import { speakerFromName, type DialogueTurn, type SpeakerGender } from './dialogue.ts';

/** Neural mp3 the bank stores and the player streams. */
export const AZURE_TTS_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

/** American English neural voices. A woman is Ava. A man is Andrew. Text uses Ava. */
export const AZURE_VOICE_FEMALE = 'en-US-AvaMultilingualNeural';
export const AZURE_VOICE_MALE = 'en-US-AndrewMultilingualNeural';

/** Slower Azure audio is spoken at 75% of the normal pace. The player does not stretch the file. */
export const AZURE_SLOW_OF_NORMAL = 0.75;
export const AZURE_VOICE_FIRST = AZURE_VOICE_FEMALE;
export const AZURE_VOICE_SECOND = AZURE_VOICE_MALE;

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
  detail: string;
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

/** Ava for a woman, Andrew for a man. A known name wins over a mismatched gender field. */
export function azureVoiceForTurn(turn: { speaker: string; gender?: SpeakerGender | null }): string {
  const listed = speakerFromName(turn.speaker);
  const gender = listed?.gender ?? (turn.gender === 'male' ? 'male' : 'female');
  return gender === 'male' ? AZURE_VOICE_MALE : AZURE_VOICE_FEMALE;
}

/** Distinct speakers in speaking order, with the Azure voice that matches each name. */
export function dialogueVoiceCast(dialogue: readonly { speaker: string; gender?: SpeakerGender | null }[]): { speaker: string; gender: SpeakerGender; voice: string }[] {
  const cast: { speaker: string; gender: SpeakerGender; voice: string }[] = [];
  for (const turn of dialogue) {
    const name = spokenLine(turn.speaker);
    if (!name || cast.some((speaker) => speaker.speaker.toLowerCase() === name.toLowerCase())) continue;
    const voice = azureVoiceForTurn({ speaker: name, gender: turn.gender });
    cast.push({
      speaker: name,
      gender: voice === AZURE_VOICE_MALE ? 'male' : 'female',
      voice,
    });
  }
  return cast;
}

/** Profile speeds the app offers. Anything else is the normal pace. */
export function listeningProfileSpeed(value: unknown): number {
  const speed = Number(value);
  if (speed === 0.75 || speed === 1.25) return speed;
  return 1;
}

/**
 * Relative Azure prosody percent. 0 is the default pace and needs no tag.
 * Slow is 75% of the profile speed. +25% is a 1.25 profile. -25% is either a
 * 0.75 profile or the standard slower file.
 */
export function azureProsodyPercent(profileSpeed: number, slow = false): number {
  const factor = listeningProfileSpeed(profileSpeed) * (slow ? AZURE_SLOW_OF_NORMAL : 1);
  return Math.round((factor - 1) * 100);
}

export function azureProsodyRate(percent: number): string | null {
  if (!percent) return null;
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

/**
 * One SSML document. A story is Ava. A conversation uses Ava or Andrew from the
 * speaker's gender, so a woman who speaks second is still Ava.
 * A slower file wraps the words in prosody so Azure speaks more slowly.
 */
export function buildListeningSsml(
  speech: ListeningSpeech,
  pace?: { profileSpeed?: number; slow?: boolean },
): { ssml: string; spokenCharacters: number; lines: string[] } {
  const prosody = azureProsodyRate(azureProsodyPercent(pace?.profileSpeed ?? 1, pace?.slow === true));
  const voiced = (inner: string) => prosody ? `<prosody rate="${prosody}">${inner}</prosody>` : inner;
  if (speech.format === 'dialogue' && speech.dialogue.length > 0) {
    const lines: string[] = [];
    const parts: string[] = [];
    speech.dialogue.forEach((turn, index) => {
      const line = spokenLine(turn.line);
      const name = spokenLine(turn.speaker);
      if (!line || !name) return;
      const said = `${name}. ${line}`;
      lines.push(said);
      const pause = index < speech.dialogue.length - 1 ? '<break time="350ms"/>' : '';
      parts.push(`<voice name="${azureVoiceForTurn(turn)}">${voiced(`${escapeSsml(said)}${pause}`)}</voice>`);
    });
    return {
      ssml: wrapSsml(parts.join('')),
      spokenCharacters: spokenCharacterCount(lines),
      lines,
    };
  }
  const line = spokenLine(speech.story);
  return {
    ssml: wrapSsml(`<voice name="${AZURE_VOICE_FIRST}">${voiced(escapeSsml(line))}</voice>`),
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
  if (!key || !input.ssml.trim()) return { ok: false, status: 0, attempts: 0, retryable: false, detail: 'missing speech settings' };
  let endpoint = '';
  try {
    endpoint = azureSpeechEndpoint(input.region);
  } catch {
    return { ok: false, status: 0, attempts: 0, retryable: false, detail: 'bad speech region' };
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
    } catch (error) {
      return {
        ok: false,
        status: 0,
        attempts,
        retryable: true,
        detail: error instanceof Error ? error.message.slice(0, 180) : 'speech request failed',
      };
    }
    if (response.ok) {
      const audio = new Uint8Array(await response.arrayBuffer());
      if (audio.byteLength < 64) return { ok: false, status: 502, attempts, retryable: false, detail: 'empty audio' };
      return {
        ok: true,
        audio,
        attempts,
        spokenCharacters: input.spokenCharacters ?? 0,
      };
    }
    const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 180);
    const retryable = response.status === 429 || response.status === 503;
    if (!retryable || attempt + 1 >= maxAttempts) {
      return { ok: false, status: response.status, attempts, retryable, detail };
    }
    await sleep(retryDelayMs(response, attempt));
  }
  return { ok: false, status: 429, attempts, retryable: true, detail: 'speech throttled' };
}
