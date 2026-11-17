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
  const contextual = line ? await askModel(term, line) : null;
  if (contextual) {
    memory.set(key, contextual);
    return contextual;
  }
  const fallback = term.includes(' ') ? await defineSearchText(term) : await defineWord(term);
  if (fallback) memory.set(key, fallback);
  return fallback;
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
    const data = await response.json() as { ok?: boolean; definition?: string; partOfSpeech?: string; word?: string };
    const definition = String(data.definition ?? '').replace(/\s+/g, ' ').trim();
    if (!data.ok || !definition) return null;
    return {
      word: String(data.word || word),
      phonetic: null,
      senses: [{ partOfSpeech: String(data.partOfSpeech || 'word').slice(0, 32) || 'word', definition: definition.slice(0, 160) }],
      example: sentence,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
