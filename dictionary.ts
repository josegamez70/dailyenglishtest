export type DictSense = {
  partOfSpeech: string;
  definition: string;
};

export type DictEntry = {
  word: string;
  phonetic: string | null;
  senses: DictSense[];
  example: string | null;
};

const memory = new Map<string, DictEntry | 'missing'>();
const STORAGE_KEY = 'dictionaryCacheV1';

export function lookupCandidates(raw: string): string[] {
  const word = raw.toLowerCase().replace(/[^a-z']/g, '').replace(/^'+|'+$/g, '');
  if (!word || !/[a-z]/.test(word)) return [];
  const list: string[] = [];
  const add = (value: string) => {
    const clean = value.replace(/^'+|'+$/g, '');
    if (clean.length >= 1 && !list.includes(clean)) list.push(clean);
  };
  add(word);
  add(word.replace(/'/g, ''));
  if (word.endsWith('ies') && word.length > 4) add(`${word.slice(0, -3)}y`);
  if (word.endsWith('es') && word.length > 4) add(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) add(word.slice(0, -1));
  if (word.endsWith('ed') && word.length > 3) {
    const stem = word.slice(0, -2);
    add(stem);
    add(`${stem}e`);
    if (stem.length >= 2 && stem.charAt(stem.length - 1) === stem.charAt(stem.length - 2)) add(stem.slice(0, -1));
  }
  if (word.endsWith('ing') && word.length > 4) {
    const stem = word.slice(0, -3);
    add(stem);
    add(`${stem}e`);
    if (stem.length >= 2 && stem.charAt(stem.length - 1) === stem.charAt(stem.length - 2)) add(stem.slice(0, -1));
  }
  return list.slice(0, 6);
}

export function parseDictionary(data: unknown, fallbackWord: string): DictEntry | null {
  const entry = Array.isArray(data) ? data[0] : null;
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;
  const phonetic = firstPhonetic(record);
  const senses: DictSense[] = [];
  let example: string | null = null;
  const meanings = Array.isArray(record.meanings) ? record.meanings : [];
  for (const meaning of meanings) {
    if (!meaning || typeof meaning !== 'object' || senses.length >= 2) break;
    const meaningRecord = meaning as Record<string, unknown>;
    const partOfSpeech = String(meaningRecord.partOfSpeech ?? '').trim();
    const definitions = Array.isArray(meaningRecord.definitions) ? meaningRecord.definitions : [];
    for (const item of definitions) {
      if (!item || typeof item !== 'object' || senses.length >= 2) break;
      const definition = String((item as Record<string, unknown>).definition ?? '').trim();
      if (!definition) continue;
      senses.push({ partOfSpeech: partOfSpeech || 'word', definition });
      if (!example) {
        const sample = String((item as Record<string, unknown>).example ?? '').trim();
        if (sample) example = sample;
      }
    }
  }
  if (!senses.length) return null;
  const word = String(record.word ?? fallbackWord).trim() || fallbackWord;
  return { word, phonetic, senses, example };
}

function firstPhonetic(record: Record<string, unknown>): string | null {
  const direct = String(record.phonetic ?? '').trim();
  if (direct) return direct;
  const phonetics = Array.isArray(record.phonetics) ? record.phonetics : [];
  for (const item of phonetics) {
    if (!item || typeof item !== 'object') continue;
    const text = String((item as Record<string, unknown>).text ?? '').trim();
    if (text) return text;
  }
  return null;
}

function readSession(): Record<string, DictEntry | 'missing'> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DictEntry | 'missing'>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSession(key: string, value: DictEntry | 'missing') {
  try {
    const current = readSession();
    current[key] = value;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* ignore full or blocked storage */
  }
}

function cached(word: string): DictEntry | 'missing' | undefined {
  if (memory.has(word)) return memory.get(word);
  const stored = readSession()[word];
  if (stored) memory.set(word, stored);
  return stored;
}

function remember(word: string, value: DictEntry | 'missing') {
  memory.set(word, value);
  writeSession(word, value);
}

async function fetchEntry(word: string): Promise<DictEntry | 'missing'> {
  const saved = cached(word);
  if (saved) return saved;
  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (response.status === 404) {
    remember(word, 'missing');
    return 'missing';
  }
  if (!response.ok) throw new Error('lookup failed');
  const entry = parseDictionary(await response.json(), word);
  const value = entry ?? 'missing';
  remember(word, value);
  return value;
}

export async function defineWord(raw: string): Promise<DictEntry | null> {
  const candidates = lookupCandidates(raw);
  if (!candidates.length) return null;
  let sawMissing = false;
  for (const candidate of candidates) {
    const result = await fetchEntry(candidate);
    if (result === 'missing') {
      sawMissing = true;
      continue;
    }
    return result;
  }
  if (sawMissing) return null;
  return null;
}

export function popupPosition(
  anchor: { top: number; bottom: number; left: number },
  popup: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8
): { top: number; left: number } {
  let top = anchor.bottom + 6;
  if (top + popup.height > viewport.height - margin) top = anchor.top - popup.height - 6;
  if (top < margin) top = margin;
  if (top + popup.height > viewport.height - margin) {
    top = Math.max(margin, viewport.height - margin - popup.height);
  }
  let left = anchor.left;
  if (left + popup.width > viewport.width - margin) left = viewport.width - popup.width - margin;
  if (left < margin) left = margin;
  return { top, left };
}
