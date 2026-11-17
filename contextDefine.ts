import { accessToken } from './auth';
import { defineSearchText, defineWord, type DictEntry } from './dictionary';

const memory = new Map<string, DictEntry>();

function cacheKey(word: string, sentence: string): string {
  return `${word.toLowerCase()}|${sentence.slice(0, 180).toLowerCase()}`;
}

/** The sense that fits this sentence. A dictionary lookup is used when the model is unavailable. */
export async function defineInContext(word: string, sentence: string): Promise<DictEntry | null> {
  const term = word.replace(/\s+/g, ' ').trim();
  const line = sentence.replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!term) return null;
  const key = cacheKey(term, line);
  const saved = memory.get(key);
  if (saved) return saved;
  const gloss = learnerGloss(term, line);
  const contextual = line ? await askModel(term, line) : null;
  if (contextual && !senseClashes(term, contextual.senses[0]?.definition ?? '', line)) {
    memory.set(key, contextual);
    return contextual;
  }
  if (gloss) {
    memory.set(key, gloss);
    return gloss;
  }
  const fallback = term.includes(' ') ? await defineSearchText(term) : await defineWord(term);
  if (fallback && senseClashes(term, fallback.senses[0]?.definition ?? '', line) && gloss) return gloss;
  if (fallback) memory.set(key, fallback);
  return fallback;
}

function learnerGloss(word: string, sentence: string): DictEntry | null {
  const term = word.toLowerCase();
  if (/\bshower\b/.test(term) && /\b(soap|towel|bathroom|wash|water|dry)\b/i.test(sentence)) {
    return { word, phonetic: null, senses: [{ partOfSpeech: 'noun', definition: 'a wash of your body with water' }], example: sentence || null };
  }
  if (/\bwake\b/.test(term) && /\b(morning|sleep|bed|clock|tired|o'clock)\b/i.test(sentence)) {
    return { word, phonetic: null, senses: [{ partOfSpeech: 'verb', definition: 'to stop sleeping' }], example: sentence || null };
  }
  if (/\bintrusive\b/.test(term) && !/\b(rock|magma|geology|igneous)\b/i.test(sentence)) {
    return { word, phonetic: null, senses: [{ partOfSpeech: 'adjective', definition: 'pushing in where you are not wanted' }], example: sentence || null };
  }
  return null;
}

function senseClashes(word: string, definition: string, sentence: string): boolean {
  const term = word.toLowerCase();
  if (/\bshower\b/.test(term) && /\b(soap|towel|bathroom|wash)\b/i.test(sentence) && /\b(rain|snow|precipitation|sleet)\b/i.test(definition)) return true;
  if (/\bwake\b/.test(term) && /\b(morning|sleep|bed|tired)\b/i.test(sentence) && /\b(funeral|boat|trail)\b/i.test(definition)) return true;
  if (/\bintrusive\b/.test(term) && !/\b(rock|magma|geology)\b/i.test(sentence) && /\b(rock|magma|geology|igneous)\b/i.test(definition)) return true;
  return false;
}

const translations = new Map<string, string>();

export async function translateToSpanish(text: string): Promise<string | null> {
  const source = text.replace(/\s+/g, ' ').trim();
  if (!source) return null;
  const saved = translations.get(source);
  if (saved) return saved;
  const token = await accessToken();
  if (!token) return null;
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: 'translate', text: source }),
    });
    if (!response.ok) return null;
    const data = await response.json() as { ok?: boolean; spanish?: string };
    const spanish = String(data.spanish ?? '').trim();
    if (!data.ok || !spanish) return null;
    translations.set(source, spanish);
    return spanish;
  } catch {
    return null;
  }
}

async function askModel(word: string, sentence: string): Promise<DictEntry | null> {
  const token = await accessToken();
  if (!token) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: 'define', word, sentence }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json() as { ok?: boolean; definition?: string; partOfSpeech?: string; word?: string; spanish?: string };
    const definition = String(data.definition ?? '').replace(/\s+/g, ' ').trim();
    if (!data.ok || !definition) return null;
    return {
      word: String(data.word || word),
      phonetic: null,
      senses: [{ partOfSpeech: String(data.partOfSpeech || 'word').slice(0, 32) || 'word', definition: definition.slice(0, 160) }],
      example: sentence,
      spanish: String(data.spanish ?? '').trim().slice(0, 80) || null,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
