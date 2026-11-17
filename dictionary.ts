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
  spanish?: string | null;
};

const memory = new Map<string, DictEntry | 'missing'>();
const STORAGE_KEY = 'dictionaryCacheV2';
const MAX_SENSES = 3;
const MAX_DEFINITION = 160;

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
  if (word.endsWith('est') && word.length > 5) {
    const stem = word.slice(0, -3);
    if (stem.length >= 3 && stem.charAt(stem.length - 1) === stem.charAt(stem.length - 2)) {
      addCandidate(list, stem.slice(0, -1), word);
    }
  }
  if (word.endsWith('er') && word.length > 4 && !word.endsWith('ier')) {
    const stem = word.slice(0, -2);
    if (stem.length >= 3 && stem.charAt(stem.length - 1) === stem.charAt(stem.length - 2)) {
      addCandidate(list, stem.slice(0, -1), word);
    }
  }
  return list;
}

export function lookupCandidates(raw: string): string[] {
  const word = normalizeLookupWord(raw);
  if (!word) return [];
  return [word, ...lemmaCandidates(word)];
}

function silentEBase(surface: string, base: string): boolean {
  if (!base.endsWith('e')) return false;
  const stem = base.slice(0, -1);
  if (!/[aeiou][^aeiou]$/.test(stem)) return false;
  return surface === `${stem}ing` || surface === `${stem}ed`;
}

function relatedBase(surface: string, base: string): boolean {
  if (base.length < 2 || base === surface) return false;
  if (base.endsWith('y')) {
    const stem = base.slice(0, -1);
    if (surface === `${stem}ies` || surface === `${stem}ied`) return true;
  }
  if (silentEBase(surface, base)) return true;
  if (!surface.startsWith(base)) return false;
  if (base.length >= surface.length - 3) return true;
  return surface.startsWith(base + base.charAt(base.length - 1));
}

function baseScore(surface: string, base: string): number {
  let score = base.length;
  if (base.endsWith('y') && (surface.endsWith('ies') || surface.endsWith('ied'))) score += 10;
  if (silentEBase(surface, base)) score += 8;
  else if (base.endsWith('e') && surface.startsWith(base.slice(0, -1))) score -= 6;
  const last = base.charAt(base.length - 1);
  if (surface.startsWith(base + last)) score += 5;
  return score;
}

/** The likely dictionary headword for an inflected form, longest and simplest first. */
export function baseFormCandidates(word: string): string[] {
  const surface = normalizeLookupWord(word);
  if (!surface) return [];
  return lemmaCandidates(surface)
    .filter((base) => relatedBase(surface, base))
    .sort((left, right) => baseScore(surface, right) - baseScore(surface, left))
    .slice(0, 2);
}

function shortenDefinition(definition: string): string {
  const text = definition.replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_DEFINITION) return text;
  const cut = text.slice(0, MAX_DEFINITION);
  const space = cut.lastIndexOf(' ');
  return `${(space > 80 ? cut.slice(0, space) : cut).replace(/[;,:\s]+$/, '')}…`;
}

function isFormPointer(definition: string): boolean {
  return /(?:plural|past|participle|gerund|superlative|comparative|third-person|tense) of\b/i.test(definition);
}

/** Everyday senses outrank specialist ones such as an old textile meaning. */
function commonScore(definition: string): number {
  const text = definition.toLowerCase();
  let score = 0;
  if (/\b(fun|playful|joke|laugh)\b/.test(text)) score += 3;
  if (/\b(fibre|fiber|fibrous|teasel|backcomb|textile|obsolete|archaic|rare|dialect|nautical|zoology|botany)\b/.test(text)) score -= 5;
  return score;
}

type RawMeaning = {
  partOfSpeech: string;
  definitions: { definition: string; example?: string }[];
};

/** First sense of each part of speech, then one extra, at most three. */
export function collectSenses(meanings: readonly RawMeaning[]): { senses: DictSense[]; example: string | null } {
  const firsts: DictSense[] = [];
  const extra: DictSense[] = [];
  const seen = new Set<string>();
  let example: string | null = null;
  for (const meaning of meanings) {
    const partOfSpeech = meaning.partOfSpeech.trim() || 'word';
    const definitions = meaning.definitions
      .filter((item) => item.definition.trim() && !isFormPointer(item.definition))
      .sort((left, right) => commonScore(right.definition) - commonScore(left.definition));
    if (!definitions.length) continue;
    if (!seen.has(partOfSpeech)) {
      seen.add(partOfSpeech);
      firsts.push({ partOfSpeech, definition: shortenDefinition(definitions[0].definition) });
      if (!example && definitions[0].example?.trim()) example = definitions[0].example.trim();
      if (!extra.length && definitions[1]) {
        extra.push({ partOfSpeech, definition: shortenDefinition(definitions[1].definition) });
      }
    }
  }
  return { senses: [...firsts, ...extra].slice(0, MAX_SENSES), example };
}

function dedupeSenses(senses: readonly DictSense[]): DictSense[] {
  const seen = new Set<string>();
  const result: DictSense[] = [];
  for (const sense of senses) {
    const key = sense.definition.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(sense);
  }
  return result;
}

/** Base-form senses come first. The looked-up word stays the headword. */
export function mergeBaseEntry(surface: DictEntry, base: DictEntry): DictEntry {
  const baseReal = base.senses.filter((sense) => !isFormPointer(sense.definition));
  const surfaceReal = surface.senses.filter((sense) => !isFormPointer(sense.definition));
  const senses = dedupeSenses(baseReal.length ? [...baseReal, ...surfaceReal] : surface.senses).slice(0, MAX_SENSES);
  return {
    word: surface.word || base.word,
    phonetic: surface.phonetic || base.phonetic,
    senses: senses.length ? senses : surface.senses.slice(0, MAX_SENSES),
    example: (baseReal.length ? base.example : surface.example) || surface.example || base.example,
    note: baseReal.length ? `from: ${base.word.toLowerCase()}` : null,
  };
}

/** The text stored on a saved word: main sense first, extras after a dot. */
export function meaningToSave(senses: readonly DictSense[]): string {
  return senses
    .map((sense) => sense.definition.trim())
    .filter(Boolean)
    .join(' · ')
    .slice(0, 400);
}

export function parseDictionary(data: unknown, fallbackWord: string): DictEntry | null {
  const entry = Array.isArray(data) ? data[0] : null;
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;
  const phonetic = firstPhonetic(record);
  const meanings = Array.isArray(record.meanings) ? record.meanings : [];
  const raw: RawMeaning[] = [];
  for (const meaning of meanings) {
    if (!meaning || typeof meaning !== 'object') continue;
    const meaningRecord = meaning as Record<string, unknown>;
    const definitions = Array.isArray(meaningRecord.definitions) ? meaningRecord.definitions : [];
    raw.push({
      partOfSpeech: String(meaningRecord.partOfSpeech ?? ''),
      definitions: definitions.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const recordItem = item as Record<string, unknown>;
        return [{
          definition: String(recordItem.definition ?? ''),
          example: String(recordItem.example ?? ''),
        }];
      }),
    });
  }
  const { senses, example } = collectSenses(raw);
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
  const raw: RawMeaning[] = [];
  for (const group of groups) {
    if (!group || typeof group !== 'object') continue;
    const record = group as Record<string, unknown>;
    const definitions = Array.isArray(record.definitions) ? record.definitions : [];
    raw.push({
      partOfSpeech: String(record.partOfSpeech ?? ''),
      definitions: definitions.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const recordItem = item as Record<string, unknown>;
        const definition = stripHtml(String(recordItem.definition ?? ''));
        if (!definition || /^ISO\b/i.test(definition)) return [];
        const examples = recordItem.parsedExamples;
        const sample = Array.isArray(examples) && examples[0] && typeof examples[0] === 'object'
          ? stripHtml(String((examples[0] as Record<string, unknown>).example ?? ''))
          : '';
        return [{ definition, example: sample }];
      }),
    });
  }
  const { senses, example } = collectSenses(raw);
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

async function attachBase(entry: DictEntry, surface: string): Promise<DictEntry> {
  const hinted = inflectionPointer(entry)?.base;
  const bases = [hinted, ...baseFormCandidates(surface)]
    .filter((base, index, all): base is string => Boolean(base) && all.indexOf(base) === index && base !== surface);
  for (const base of bases.slice(0, 2)) {
    let found = await lookupForm(base, false);
    if (found === 'missing') continue;
    if (!isEntry(found)) {
      found = await fetchWiktionary(base);
    }
    if (!isEntry(found)) continue;
    return mergeBaseEntry(entry, found);
  }
  return entry;
}

/** A single word or a short phrase worth sending to the dictionary. */
export function searchLookupTerm(raw: string): string | null {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > 48) return null;
  if (!/^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/.test(text)) return null;
  if (text.split(' ').length > 4) return null;
  if (text.replace(/[^A-Za-z]/g, '').length < 2) return null;
  return text;
}

/** Same dictionary as the word popup. A short phrase keeps its spaces. */
export async function defineSearchText(raw: string): Promise<DictEntry | null> {
  const term = searchLookupTerm(raw);
  if (!term) return null;
  if (!term.includes(' ')) return defineWord(term);
  const word = term.toLowerCase();
  const resultKey = `result:${word}`;
  const saved = cached(resultKey);
  if (saved === 'missing') return null;
  if (saved && saved !== 'missing') return saved;
  let result = await lookupForm(word, true);
  if (!isEntry(result)) {
    const wiki = await fetchWiktionary(word);
    if (isEntry(wiki)) result = wiki;
    else if (wiki === 'failed' && result === 'failed') throw new Error('lookup failed');
  }
  if (!isEntry(result)) {
    if (result === 'failed') throw new Error('lookup failed');
    remember(resultKey, 'missing');
    return null;
  }
  remember(resultKey, result);
  return result;
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
      const shown = inflectionPointer(result) ? await attachBase(result, word) : result;
      remember(resultKey, shown);
      return shown;
    }
    if (result === 'missing') sawMiss = true;
    if (result === 'failed') sawFailure = true;
  }
  for (const form of forms) {
    const result = await fetchWiktionary(form);
    if (isEntry(result)) {
      const shown = inflectionPointer(result) ? await attachBase(result, word) : result;
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
  margin = 8,
  bottomReserve = 0,
): { top: number; left: number } {
  const floor = viewport.height - margin - bottomReserve;
  let top = anchor.bottom + 6;
  if (top + popup.height > floor) top = anchor.top - popup.height - 6;
  if (top < margin) top = margin;
  if (top + popup.height > floor) {
    top = Math.max(margin, floor - popup.height);
  }
  let left = anchor.left;
  if (left + popup.width > viewport.width - margin) left = viewport.width - popup.width - margin;
  if (left < margin) left = margin;
  return { top, left };
}
