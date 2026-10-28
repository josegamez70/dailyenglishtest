export type ContentFormat = 'text' | 'dialogue';

export type SpeakerGender = 'female' | 'male';

export type DialogueTurn = {
  speaker: string;
  line: string;
  gender: SpeakerGender | null;
};

export type SpeechLine = {
  speaker: string;
  speakerIndex: number;
  text: string;
  turnIndex: number;
};

export type SpeakerVoice = {
  name: string;
  lang: string;
  pitch: number;
  rateScale: number;
};

export function normalizeFormat(value: unknown): ContentFormat {
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'dialogue' || text === 'dialog' ? 'dialogue' : 'text';
}

function cleanLine(speaker: string, line: string): string {
  const trimmed = line.replace(/\s+/g, ' ').trim();
  const prefix = speaker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return trimmed.replace(new RegExp(`^${prefix}\\s*:\\s*`, 'i'), '').trim();
}

const FEMALE_NAMES = new Set([
  'ana', 'anna', 'anne', 'ann', 'emma', 'mia', 'sophie', 'sofia', 'olivia', 'lily', 'lucy',
  'mary', 'sarah', 'sara', 'kate', 'katie', 'grace', 'hannah', 'ella', 'amy', 'jane', 'lisa',
  'nina', 'chloe', 'zoe', 'zara', 'maria', 'fatima', 'aisha', 'priya', 'mei', 'leila', 'layla',
  'rosa', 'elena', 'lucia', 'julia', 'helen', 'rachel', 'emily', 'alice', 'claire', 'diana',
  'fiona', 'laura', 'linda', 'nancy', 'ruth', 'susan', 'wendy',
]);

const MALE_NAMES = new Set([
  'ben', 'benjamin', 'leo', 'leon', 'tom', 'thomas', 'james', 'john', 'jack', 'joe', 'joseph',
  'david', 'daniel', 'mark', 'alex', 'alexander', 'adam', 'sam', 'samuel', 'mike', 'michael',
  'peter', 'paul', 'chris', 'robert', 'will', 'william', 'harry', 'henry', 'george', 'charles',
  'charlie', 'edward', 'frank', 'fred', 'luke', 'martin', 'nick', 'oscar', 'richard', 'steve',
  'tim', 'ali', 'omar', 'ahmed', 'carlos', 'diego', 'luis', 'marco', 'pedro',
]);

const FEMALE_VOICE_HINTS = [
  'samantha', 'zira', 'karen', 'susan', 'serena', 'alexa', 'victoria', 'moira', 'fiona',
  'tessa', 'veena', 'kate', 'google uk english female',
];

const MALE_VOICE_HINTS = [
  'daniel', 'david', 'mark', 'alex', 'fred', 'rishi', 'arthur', 'aaron', 'google uk english male',
];

export function normalizeGender(value: unknown): SpeakerGender | null {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'female' || text === 'f' || text === 'woman' || text === 'girl') return 'female';
  if (text === 'male' || text === 'm' || text === 'man' || text === 'boy') return 'male';
  return null;
}

export function inferGender(name: string): SpeakerGender | null {
  const key = name.trim().toLowerCase();
  if (FEMALE_NAMES.has(key)) return 'female';
  if (MALE_NAMES.has(key)) return 'male';
  return null;
}

export function dialogueGendersConflict(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  const seen = new Map<string, SpeakerGender>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const speaker = String(record.speaker ?? record.name ?? '').trim().toLowerCase();
    const gender = normalizeGender(record.gender);
    if (!speaker || !gender) continue;
    const previous = seen.get(speaker);
    if (previous && previous !== gender) return true;
    seen.set(speaker, gender);
  }
  return false;
}

function withSpeakerGenders(turns: DialogueTurn[]): DialogueTurn[] {
  const known = new Map<string, SpeakerGender>();
  for (const turn of turns) {
    const key = turn.speaker.toLowerCase();
    if (turn.gender && !known.has(key)) known.set(key, turn.gender);
  }
  for (const turn of turns) {
    const key = turn.speaker.toLowerCase();
    if (!known.has(key)) {
      const inferred = inferGender(turn.speaker);
      if (inferred) known.set(key, inferred);
    }
  }
  const speakers = dialogueSpeakers(turns).map((name) => name.toLowerCase());
  if (speakers.length === 2) {
    const [first, second] = speakers;
    if (known.has(first) && !known.has(second)) known.set(second, known.get(first) === 'female' ? 'male' : 'female');
    if (known.has(second) && !known.has(first)) known.set(first, known.get(second) === 'female' ? 'male' : 'female');
  }
  return turns.map((turn) => ({
    ...turn,
    gender: known.get(turn.speaker.toLowerCase()) ?? null,
  }));
}

export function parseDialogue(raw: unknown): DialogueTurn[] {
  if (Array.isArray(raw)) {
    return withSpeakerGenders(raw.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const speaker = String(record.speaker ?? record.name ?? '').replace(/\s+/g, ' ').trim();
      const line = cleanLine(speaker, String(record.line ?? record.text ?? ''));
      if (!speaker || !line || speaker.length > 40 || speaker.includes(':')) return [];
      return [{ speaker, line, gender: normalizeGender(record.gender) }];
    }));
  }
  if (typeof raw !== 'string') return [];
  const turns: DialogueTurn[] = [];
  for (const row of raw.split(/\n+/)) {
    const match = row.trim().match(/^([^:\n]{1,40}):\s+(\S.*)$/);
    if (!match) continue;
    const speaker = match[1].trim();
    const line = cleanLine(speaker, match[2]);
    if (speaker && line) turns.push({ speaker, line, gender: null });
  }
  return withSpeakerGenders(turns);
}

export function renderDialogue(turns: DialogueTurn[]): string {
  return turns.map((turn) => `${turn.speaker}: ${turn.line}`).join('\n');
}

export function dialogueSpeakers(turns: DialogueTurn[]): string[] {
  const names: string[] = [];
  for (const turn of turns) {
    if (!names.some((name) => name.toLowerCase() === turn.speaker.toLowerCase())) names.push(turn.speaker);
  }
  return names;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function spokenWordCount(turns: DialogueTurn[]): number {
  return countWords(turns.map((turn) => turn.line).join(' '));
}

export function contentWordCount(text: string, format: ContentFormat): number {
  if (format !== 'dialogue') return countWords(text);
  const turns = parseDialogue(text);
  if (!turns.length) return countWords(text);
  return spokenWordCount(turns);
}

export function isContentLengthOk(text: string, format: ContentFormat, target: number): boolean {
  const count = contentWordCount(text, format);
  const safe = Math.max(1, Math.round(target));
  const min = Math.floor(safe * 0.85);
  const max = Math.ceil(safe * 1.15);
  return count >= min && count <= max;
}

export function speechLines(turns: DialogueTurn[]): SpeechLine[] {
  const names = dialogueSpeakers(turns);
  return turns.map((turn, turnIndex) => ({
    speaker: turn.speaker,
    speakerIndex: Math.max(0, names.findIndex((name) => name.toLowerCase() === turn.speaker.toLowerCase())),
    text: `${turn.speaker}. ${turn.line}`,
    turnIndex,
  }));
}

export function resumeTurnIndex(durations: number[], elapsedMs: number): number {
  if (durations.length === 0) return 0;
  let cursor = 0;
  for (let index = 0; index < durations.length; index++) {
    if (elapsedMs < cursor + durations[index]) return index;
    cursor += durations[index];
  }
  return durations.length - 1;
}

export function speakersWithGender(turns: DialogueTurn[]): { name: string; gender: SpeakerGender | null }[] {
  const speakers: { name: string; gender: SpeakerGender | null }[] = [];
  for (const turn of turns) {
    if (speakers.some((speaker) => speaker.name.toLowerCase() === turn.speaker.toLowerCase())) continue;
    speakers.push({ name: turn.speaker, gender: turn.gender });
  }
  return speakers;
}

export function voiceGender(name: string): SpeakerGender | null {
  const text = name.toLowerCase();
  if (text.includes('female')) return 'female';
  if (text.includes('male')) return 'male';
  if (FEMALE_VOICE_HINTS.some((hint) => text.includes(hint))) return 'female';
  if (MALE_VOICE_HINTS.some((hint) => text.includes(hint))) return 'male';
  return null;
}

function pitchedVoice(
  voice: { name: string; lang: string } | undefined,
  gender: SpeakerGender | null,
  adjustPitch: boolean
): SpeakerVoice {
  const pitch = !adjustPitch ? 1 : gender === 'female' ? 1.3 : gender === 'male' ? 0.75 : 1;
  const rateScale = !adjustPitch ? 1 : gender === 'male' ? 0.92 : 1;
  return {
    name: voice?.name ?? '',
    lang: voice?.lang || 'en-US',
    pitch,
    rateScale,
  };
}

/** One voice per speaker. Female speakers get a female-sounding voice; male speakers get a male-sounding one. */
export function voicesBySpeaker(
  speakers: { name: string; gender: SpeakerGender | null }[],
  voices: { name: string; lang: string }[]
): Record<string, SpeakerVoice> {
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang));
  const pool = (english.length ? english : voices).map((voice) => ({
    ...voice,
    heard: voiceGender(voice.name),
  }));
  const used = new Set<string>();
  const result: Record<string, SpeakerVoice> = {};
  for (const speaker of speakers) {
    const key = speaker.name.toLowerCase();
    if (result[key]) continue;
    if (pool.length === 1) {
      result[key] = pitchedVoice(pool[0], speaker.gender, speaker.gender != null);
      continue;
    }
    const match = pool.find((voice) => speaker.gender && voice.heard === speaker.gender && !used.has(voice.name));
    if (match) {
      used.add(match.name);
      result[key] = pitchedVoice(match, speaker.gender, false);
      continue;
    }
    const unused = pool.find((voice) => !used.has(voice.name));
    if (unused && pool.length > 1) {
      used.add(unused.name);
      result[key] = pitchedVoice(unused, speaker.gender, unused.heard !== speaker.gender && speaker.gender != null);
      continue;
    }
    result[key] = pitchedVoice(pool[0], speaker.gender, speaker.gender != null);
  }
  return result;
}
