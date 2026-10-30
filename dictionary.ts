export type DictSense = {
  partOfSpeech: string;
  definition: string;
};

export type DictEntry = {
  word: string;
  phonetic: string | null;
  senses: DictSense[];
  example: string | null;
  note?: string | null;
};

const memory = new Map<string, DictEntry | 'missing'>();
const STORAGE_KEY = 'dictionaryCacheV1';

/** Lowercase, drop punctuation and curly quotes, and remove a possessive 's. */
export function normalizeLookupWord(raw: string): string {
  const word = raw
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032\uFF07]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '')
    .replace(/[^a-z']/g, '')
    .replace(/^'+|'+$/g, '')
    .replace(/'s$/, '');
  return /[a-z]/.test(word) ? word : '';
}

function addCandidate(list: string[], value: string, current: string) {
  const clean = value.replace(/[^a-z]/g, '');
  if (clean.length >= 2 && clean !== current && !list.includes(clean)) list.push(clean);
}

/** Base forms to try after the word itself, in a fixed order. */
export function lemmaCandidates(word: string): string[] {
  const list: string[] = [];
  if (word.endsWith('ies') && word.length > 4) addCandidate(list, `${word.slice(0, -3)}y`, word);
  if (word.endsWith('ied') && word.length > 4) addCandidate(list, `${word.slice(0, -3)}y`, word);
  if (word.endsWith('es') && word.length > 3) addCandidate(list, word.slice(0, -2), word);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) addCandidate(list, word.slice(0, -1), word);
  if (word.endsWith('ed') && word.length > 3) {
    const stem = word.slice(0, -2);
    addCandidate(list, stem, word);
    if (stem.length >= 2 && stem.charAt(stem.length - 1) === stem.charAt(stem.length - 2)) {
      addCandidate(list, stem.slice(0, -1), word);
    }
    addCandidate(list, `${stem}e`, word);
  }
  if (word.endsWith('ing') && word.length > 4) {
    const stem = word.slice(0, -3);
    addCandidate(list, stem, word);
    addCandidate(list, `${stem}e`, word);
    if (stem.length >= 2 && stem.charAt(stem.length - 1) === stem.charAt(stem.length - 2)) {
      addCandidate(list, stem.slice(0, -1), word);
    }
  }
  if (word.endsWith('iest') && word.length > 5) addCandidate(list, `${word.slice(0, -4)}y`, word);
  if (word.endsWith('ier') && word.length > 4) addCandidate(list, `${word.slice(0, -3)}y`, word);
  if (word.endsWith('est') && word.length > 4) addCandidate(list, word.slice(0, -3), word);
  if (word.endsWith('er') && word.length > 3) addCandidate(list, word.slice(0, -2), word);
  return list;
}

export function lookupCandidates(raw: string): string[] {
  const word = normalizeLookupWord(raw);
  if (!word) return [];
  return [word, ...lemmaCandidates(word)];
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

type FetchResult = DictEntry | 'missing' | 'failed';

function isEntry(value: FetchResult): value is DictEntry {
  return value !== 'missing' && value !== 'failed';
}

const INFLECTION = /(?:plural|past|participle|gerund|superlative|comparative|third-person|form|tense) of ["“]?([a-z'-]+)/i;

function inflectionLabel(definition: string): string {
  const text = definition.toLowerCase();
  if (text.includes('plural')) return 'plural';
  if (text.includes('superlative')) return 'superlative';
  if (text.includes('comparative')) return 'comparative';
  if (text.includes('third-person')) return 'third-person';
  if (text.includes('gerund')) return 'gerund';
  if (text.includes('past')) return 'past';
  return 'form';
}

/** When the first sense only points at a base word, return that base word. */
export function inflectionPointer(entry: DictEntry): { base: string; label: string } | null {
  const definition = entry.senses[0]?.definition ?? '';
  const match = definition.match(INFLECTION);
  if (!match) return null;
  const base = match[1].toLowerCase().replace(/^['"“]+|['"”]+$/g, '');
  if (!/[a-z]/.test(base) || base === entry.word.toLowerCase()) return null;
  return { base, label: inflectionLabel(definition) };
}

async function fetchDictionary(word: string): Promise<FetchResult> {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return 'missing';
    if (!response.ok) return 'failed';
    const entry = parseDictionary(await response.json(), word);
    return entry ?? 'missing';
  } catch {
    return 'failed';
  }
}

function stripHtml(value: string): string {
  const text = value.split(/<style|<link|<script/i)[0] ?? value;
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseWiktionary(data: unknown, fallbackWord: string): DictEntry | null {
  if (!data || typeof data !== 'object') return null;
  const groups = (data as Record<string, unknown>).en;
  if (!Array.isArray(groups)) return null;
  const senses: DictSense[] = [];
  let example: string | null = null;
  for (const group of groups) {
    if (!group || typeof group !== 'object' || senses.length >= 2) break;
    const record = group as Record<string, unknown>;
    const partOfSpeech = String(record.partOfSpeech ?? '').trim() || 'word';
    const definitions = Array.isArray(record.definitions) ? record.definitions : [];
    for (const item of definitions) {
      if (!item || typeof item !== 'object' || senses.length >= 2) break;
      const definition = stripHtml(String((item as Record<string, unknown>).definition ?? ''));
      if (!definition || /^ISO\b/i.test(definition)) continue;
      senses.push({ partOfSpeech, definition });
      if (!example) {
        const examples = (item as Record<string, unknown>).parsedExamples;
        const sample = Array.isArray(examples) && examples[0] && typeof examples[0] === 'object'
          ? stripHtml(String((examples[0] as Record<string, unknown>).example ?? ''))
          : '';
        if (sample) example = sample;
      }
    }
  }
  if (!senses.length) return null;
  return { word: fallbackWord, phonetic: null, senses, example };
}

async function fetchWiktionary(word: string): Promise<FetchResult> {
  const key = `wiki:${word}`;
  const saved = cached(key);
  if (saved) return saved;
  try {
    const response = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) {
      remember(key, 'missing');
      return 'missing';
    }
    if (!response.ok) return 'failed';
    const entry = parseWiktionary(await response.json(), word);
    const value = entry ?? 'missing';
    remember(key, value);
    return value;
  } catch {
    return 'failed';
  }
}

async function lookupForm(word: string, retryMiss: boolean): Promise<FetchResult> {
  const saved = cached(word);
  if (saved) return saved;
  let result = await fetchDictionary(word);
  if (isEntry(result)) {
    remember(word, result);
    return result;
  }
  const retry = result === 'failed' || (retryMiss && result === 'missing');
  if (retry) {
    const again = await fetchDictionary(word);
    if (isEntry(again)) {
      remember(word, again);
      return again;
    }
    if (again === 'missing' || result === 'missing') {
      remember(word, 'missing');
      return 'missing';
    }
    return 'failed';
  }
  if (result === 'missing') remember(word, 'missing');
  return result;
}

async function followInflection(entry: DictEntry, surface: string, depth = 0): Promise<DictEntry> {
  if (depth >= 2) return entry;
  const pointer = inflectionPointer(entry);
  if (!pointer) return entry;
  let base = await lookupForm(pointer.base, true);
  if (!isEntry(base)) {
    const wiki = await fetchWiktionary(pointer.base);
    if (!isEntry(wiki)) return entry;
    base = wiki;
  }
  const followed = inflectionPointer(base) ? await followInflection(base, surface, depth + 1) : base;
  if (inflectionPointer(followed)) return entry;
  return {
    word: followed.word,
    phonetic: followed.phonetic,
    senses: followed.senses,
    example: followed.example,
    note: `(${pointer.label}: ${surface})`,
  };
}

export async function defineWord(raw: string): Promise<DictEntry | null> {
  const word = normalizeLookupWord(raw);
  if (!word) return null;
  const resultKey = `result:${word}`;
  const saved = cached(resultKey);
  if (saved === 'missing') return null;
  if (saved && saved !== 'missing') return saved;

  const forms = lookupCandidates(word);
  let sawMiss = false;
  let sawFailure = false;
  for (let index = 0; index < forms.length; index += 1) {
    const result = await lookupForm(forms[index], index === 0);
    if (isEntry(result)) {
      const shown = await followInflection(result, word);
      remember(resultKey, shown);
      return shown;
    }
    if (result === 'missing') sawMiss = true;
    if (result === 'failed') sawFailure = true;
  }
  for (const form of forms) {
    const result = await fetchWiktionary(form);
    if (isEntry(result)) {
      const shown = await followInflection(result, word);
      remember(resultKey, shown);
      return shown;
    }
    if (result === 'missing') sawMiss = true;
    if (result === 'failed') sawFailure = true;
  }
  if (sawFailure && !sawMiss) throw new Error('lookup failed');
  remember(resultKey, 'missing');
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
