import type { DialogueTurn } from './dialogue.ts';

/** Neural mp3 the bank stores and the player streams. */
export const AZURE_TTS_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

/** American English neural voices. Text uses Ava. A conversation uses one voice per speaker. */
export const AZURE_VOICE_FIRST = 'en-US-AvaMultilingualNeural';
export const AZURE_VOICE_SECOND = 'en-US-AndrewMultilingualNeural';

const REGION_RE = /^[a-z0-9-]{1,40}$/i;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

export type ListeningSpeech = {
  format: 'text' | 'dialogue';
  story: string;
  dialogue: DialogueTurn[];
};

export type AzureSpeechSuccess = {
  ok: true;
  audio: Uint8Array;
  attempts: number;
  spokenCharacters: number;
};

export type AzureSpeechFailure = {
  ok: false;
  status: number;
  attempts: number;
  retryable: boolean;
};

export class AzureSpeechError extends Error {
  status: number;
  attempts: number;

  constructor(status: number, attempts: number) {
    super(`Azure speech failed (${status})`);
    this.name = 'AzureSpeechError';
    this.status = status;
    this.attempts = attempts;
  }
}

export function escapeSsml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function spokenLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Characters Azure bills for neural voices: the spoken text, not the SSML tags. */
export function spokenCharacterCount(lines: readonly string[]): number {
  return lines.reduce((total, line) => total + line.length, 0);
}

function voiceForSpeaker(index: number): string {
  return index <= 0 ? AZURE_VOICE_FIRST : AZURE_VOICE_SECOND;
}

/**
 * One SSML document. A story is a single voice. A conversation gives each speaker
 * their own voice, in the order they first speak.
 */
export function buildListeningSsml(speech: ListeningSpeech): { ssml: string; spokenCharacters: number; lines: string[] } {
  if (speech.format === 'dialogue' && speech.dialogue.length > 0) {
    const order: string[] = [];
    for (const turn of speech.dialogue) {
      const name = spokenLine(turn.speaker);
      if (!name) continue;
      if (!order.some((speaker) => speaker.toLowerCase() === name.toLowerCase())) order.push(name);
    }
    const lines: string[] = [];
    const parts: string[] = [];
    speech.dialogue.forEach((turn, index) => {
      const line = spokenLine(turn.line);
      const name = spokenLine(turn.speaker);
      if (!line || !name) return;
      const speakerIndex = Math.max(0, order.findIndex((speaker) => speaker.toLowerCase() === name.toLowerCase()));
      const said = `${name}. ${line}`;
      lines.push(said);
      if (parts.length) parts.push('<break time="350ms"/>');
      parts.push(`<voice name="${voiceForSpeaker(speakerIndex)}">${escapeSsml(said)}</voice>`);
    });
    return {
      ssml: wrapSsml(parts.join('')),
      spokenCharacters: spokenCharacterCount(lines),
      lines,
    };
  }
  const line = spokenLine(speech.story);
  return {
    ssml: wrapSsml(`<voice name="${AZURE_VOICE_FIRST}">${escapeSsml(line)}</voice>`),
    spokenCharacters: line.length,
    lines: line ? [line] : [],
  };
}

function wrapSsml(inner: string): string {
  return `<speak version="1.0" xml:lang="en-US" xmlns="http://www.w3.org/2001/10/synthesis">${inner}</speak>`;
}

export function azureSpeechEndpoint(region: string): string {
  const clean = region.trim();
  if (!REGION_RE.test(clean)) throw new AzureSpeechError(0, 0);
  return `https://${clean}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

function retryDelayMs(response: Response, attemptIndex: number): number {
  const header = response.headers.get('retry-after');
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(20_000, Math.round(seconds * 1000));
  return RETRY_DELAYS_MS[Math.min(attemptIndex, RETRY_DELAYS_MS.length - 1)];
}

/**
 * One neural mp3. A 429 or 503 waits and tries again. Callers synthesize one
 * lesson at a time: the free tier allows very little concurrency.
 */
export async function synthesizeNeuralMp3(input: {
  key: string;
  region: string;
  ssml: string;
  spokenCharacters?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}): Promise<AzureSpeechSuccess | AzureSpeechFailure> {
  const key = input.key.trim();
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = input.maxAttempts ?? RETRY_DELAYS_MS.length + 1;
  if (!key || !input.ssml.trim()) return { ok: false, status: 0, attempts: 0, retryable: false };
  let endpoint = '';
  try {
    endpoint = azureSpeechEndpoint(input.region);
  } catch {
    return { ok: false, status: 0, attempts: 0, retryable: false };
  }
  let attempts = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    attempts += 1;
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': AZURE_TTS_OUTPUT_FORMAT,
          'User-Agent': 'dailyenglishtest',
        },
        body: input.ssml,
      });
    } catch {
      return { ok: false, status: 0, attempts, retryable: true };
    }
    if (response.ok) {
      const audio = new Uint8Array(await response.arrayBuffer());
      if (audio.byteLength < 64) return { ok: false, status: 502, attempts, retryable: false };
      return {
        ok: true,
        audio,
        attempts,
        spokenCharacters: input.spokenCharacters ?? 0,
      };
    }
    const retryable = response.status === 429 || response.status === 503;
    if (!retryable || attempt + 1 >= maxAttempts) {
      return { ok: false, status: response.status, attempts, retryable };
    }
    await sleep(retryDelayMs(response, attempt));
  }
  return { ok: false, status: 429, attempts, retryable: true };
}
