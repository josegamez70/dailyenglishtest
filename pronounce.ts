export type PronunciationAccent = 'british' | 'american';

export type PronunciationVoice = {
  lang: string;
  name?: string;
  voiceURI?: string;
  default?: boolean;
};

const cache = new Map<string, string | null>();

function audioKey(term: string): string {
  return term.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isHttpsAudio(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /\.(mp3|ogg|wav)(?:$|\?)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function isUkAudio(url: string): boolean {
  return /-uk\.(?:mp3|ogg|wav)/i.test(url) || /_gb_/i.test(url) || /-gb\.(?:mp3|ogg|wav)/i.test(url);
}

/** UK recording first, then any other https audio from the same dictionary entry. */
export function pickPronunciationAudio(phonetics: unknown): string | null {
  if (!Array.isArray(phonetics)) return null;
  const urls: string[] = [];
  for (const item of phonetics) {
    if (!item || typeof item !== 'object') continue;
    const audio = String((item as { audio?: unknown }).audio ?? '').trim();
    if (isHttpsAudio(audio) && !urls.includes(audio)) urls.push(audio);
  }
  return urls.find(isUkAudio) ?? urls[0] ?? null;
}

/** en-GB unless the profile accent is American, which maps to en-US. */
export function pronunciationVoice(
  voices: readonly PronunciationVoice[],
  accent: PronunciationAccent,
): PronunciationVoice | null {
  const want = accent === 'american' ? /^en-US\b/i : /^en-GB\b/i;
  const matches = voices.filter((voice) => want.test(voice.lang || ''));
  return matches.find((voice) => voice.default) ?? matches[0] ?? null;
}

export function pronunciationLang(accent: PronunciationAccent): 'en-GB' | 'en-US' {
  return accent === 'american' ? 'en-US' : 'en-GB';
}

/** Cached dictionary audio for this term. Null means the dictionary has no recording. */
export async function pronunciationUrl(term: string): Promise<string | null> {
  const key = audioKey(term);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) {
      cache.set(key, null);
      return null;
    }
    if (!response.ok) return null;
    const data = await response.json() as unknown;
    const entry = Array.isArray(data) ? data[0] : null;
    const phonetics = entry && typeof entry === 'object' ? (entry as { phonetics?: unknown }).phonetics : null;
    const url = pickPronunciationAudio(phonetics);
    cache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

export function cachedPronunciationUrl(term: string): string | null | undefined {
  const key = audioKey(term);
  if (!key || !cache.has(key)) return undefined;
  return cache.get(key) ?? null;
}
