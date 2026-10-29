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
  voiceURI?: string;
  pitch: number;
  rateScale: number;
};

export type ListedVoice = {
  name: string;
  lang: string;
  voiceURI?: string;
  default?: boolean;
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

export const DIALOGUE_SPEAKERS: { name: string; gender: SpeakerGender }[] = [
  { name: 'Person 1', gender: 'female' },
  { name: 'Person 2', gender: 'male' },
];

/** Person 1 is always the woman. Person 2 is always the man. */
export function canonicalSpeaker(raw: string): string | null {
  const cleaned = raw.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().replace(/:$/, '').trim();
  const match = cleaned.match(/^person\s*([12])$/i);
  if (!match) return null;
  return `Person ${match[1]}`;
}

export function genderForName(name: string): SpeakerGender | null {
  const speaker = canonicalSpeaker(name);
  return DIALOGUE_SPEAKERS.find((person) => person.name === speaker)?.gender ?? null;
}

/** Preference order. Earlier names win. "Google US English" with no suffix is female. */
const FEMALE_VOICE_HINTS = [
  'google us english',
  'google uk english female',
  'microsoft zira',
  'microsoft hazel',
  'microsoft susan',
  'microsoft aria',
  'microsoft jenny',
  'microsoft sonia',
  'microsoft libby',
  'microsoft emma',
  'microsoft ava',
  'samantha',
  'karen',
  'moira',
  'tessa',
  'serena',
  'victoria',
  'fiona',
  'kate',
  'martha',
];

const MALE_VOICE_HINTS = [
  'google uk english male',
  'microsoft david',
  'microsoft mark',
  'microsoft guy',
  'microsoft ryan',
  'microsoft george',
  'microsoft christopher',
  'microsoft eric',
  'microsoft andrew',
  'microsoft brian',
  'daniel',
  'alex',
  'fred',
  'tom',
  'aaron',
  'arthur',
  'oliver',
  'rishi',
  'gordon',
];

/**
 * Android Chrome Google TTS ids, matched against voiceURI or name.
 * en-in-x-ene is omitted: its gender is not confirmed, so it must not be treated as male.
 */
const MALE_GOOGLE_IDS = [
  'en-us-x-iom',
  'en-us-x-iol',
  'en-us-x-tpd',
  'en-gb-x-rjs',
  'en-gb-x-gbd',
  'en-au-x-aub',
  'en-au-x-aud',
];

const FEMALE_GOOGLE_IDS = [
  'en-us-x-sfg',
  'en-us-x-tpc',
  'en-us-x-tpf',
  'en-gb-x-gba',
  'en-gb-x-gbc',
  'en-gb-x-gbg',
  'en-au-x-aua',
  'en-au-x-auc',
];

function splitLabelledLine(row: string): { speaker: string; line: string } | null {
  const plain = row.replace(/[*_`]/g, '').trim();
  const match = plain.match(/^(.*?):\s*(\S.*)$/);
  if (!match) return null;
  const speaker = canonicalSpeaker(match[1]);
  if (!speaker) return null;
  return { speaker, line: match[2].trim() };
}

function withSpeakerGenders(turns: DialogueTurn[]): DialogueTurn[] {
  return turns.map((turn) => ({
    ...turn,
    speaker: canonicalSpeaker(turn.speaker) ?? turn.speaker,
    gender: genderForName(turn.speaker),
  }));
}

export function parseDialogue(raw: unknown): DialogueTurn[] {
  if (Array.isArray(raw)) {
    return withSpeakerGenders(raw.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const rawLine = String(record.line ?? record.text ?? '');
      const labelled = splitLabelledLine(rawLine);
      const speaker = canonicalSpeaker(String(record.speaker ?? record.name ?? '')) ?? labelled?.speaker ?? '';
      const line = labelled ? labelled.line : cleanLine(speaker, rawLine);
      if (!speaker || !line) return [];
      return [{ speaker, line, gender: null }];
    }));
  }
  if (typeof raw !== 'string') return [];
  const turns: DialogueTurn[] = [];
  for (const row of raw.split(/\n+/)) {
    const labelled = splitLabelledLine(row);
    if (!labelled) continue;
    turns.push({ speaker: labelled.speaker, line: labelled.line, gender: null });
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

function voiceBlob(voice: { name: string; voiceURI?: string }): string {
  return `${voice.name} ${voice.voiceURI ?? ''}`.toLowerCase();
}

function hintIndex(blob: string, hints: string[]): number {
  return hints.findIndex((hint) => {
    if (hint.includes(' ') || hint.includes('-')) return blob.includes(hint);
    return new RegExp(`(^|[^a-z])${hint}([^a-z]|$)`).test(blob);
  });
}

/** Female, male, or unknown. Name lists win; Google TTS ids cover Android Chrome. */
export function voiceGender(voice: { name: string; voiceURI?: string }): SpeakerGender | null {
  const blob = voiceBlob(voice);
  if (MALE_GOOGLE_IDS.some((id) => blob.includes(id))) return 'male';
  if (FEMALE_GOOGLE_IDS.some((id) => blob.includes(id))) return 'female';
  const femaleHint = hintIndex(blob, FEMALE_VOICE_HINTS);
  const maleHint = hintIndex(blob, MALE_VOICE_HINTS);
  if (femaleHint >= 0 && (maleHint < 0 || femaleHint <= maleHint)) return 'female';
  if (maleHint >= 0) return 'male';
  if (blob.includes('female')) return 'female';
  if (/(^|[^a-z])male([^a-z]|$)/.test(blob)) return 'male';
  if (blob.includes(' man')) return 'male';
  return null;
}

function naturalVoice(voice: ListedVoice | undefined): SpeakerVoice {
  return {
    name: voice?.name ?? '',
    lang: voice?.lang || 'en-US',
    voiceURI: voice?.voiceURI,
    pitch: 1,
    rateScale: 1,
  };
}

function voiceKey(voice: ListedVoice): string {
  return `${voice.name}|${voice.voiceURI ?? ''}`;
}

function localeKey(lang: string): string {
  return lang.toLowerCase().replace('_', '-').split('-').slice(0, 2).join('-');
}

type ClassedVoice = ListedVoice & { heard: SpeakerGender | null };

function byHint(gender: SpeakerGender) {
  const hints = gender === 'male' ? MALE_VOICE_HINTS : FEMALE_VOICE_HINTS;
  const ids = gender === 'male' ? MALE_GOOGLE_IDS : FEMALE_GOOGLE_IDS;
  return (left: ClassedVoice, right: ClassedVoice) => {
    const leftBlob = voiceBlob(left);
    const rightBlob = voiceBlob(right);
    const leftId = hintIndex(leftBlob, ids);
    const rightId = hintIndex(rightBlob, ids);
    const leftRank = leftId >= 0 ? leftId : 100 + Math.max(hintIndex(leftBlob, hints), 0);
    const rightRank = rightId >= 0 ? rightId : 100 + Math.max(hintIndex(rightBlob, hints), 0);
    return leftRank - rightRank;
  };
}

/**
 * Female names get a female voice. Male names get a male voice.
 * Pitch is always 1. If this device has no male voice, the man gets a different English locale, not a lowered female voice.
 */
export function voicesBySpeaker(
  speakers: { name: string; gender: SpeakerGender | null }[],
  voices: ListedVoice[],
  log: (message: string) => void = console.log
): Record<string, SpeakerVoice> {
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang || ''));
  const pool: ClassedVoice[] = (english.length ? english : voices).map((voice) => ({
    ...voice,
    heard: voiceGender(voice),
  }));
  const localeOrder = ['en-gb', 'en-us', 'en-au', 'en-in', 'en-ng'];
  const females = pool.filter((voice) => voice.heard === 'female').sort(byHint('female'));
  const males = pool.filter((voice) => voice.heard === 'male').sort(byHint('male'));
  const neutral = pool.filter((voice) => voice.heard == null).sort((left, right) => {
    const leftRank = localeOrder.indexOf(localeKey(left.lang));
    const rightRank = localeOrder.indexOf(localeKey(right.lang));
    return (leftRank < 0 ? 99 : leftRank) - (rightRank < 0 ? 99 : rightRank);
  });
  const used = new Set<string>();
  const result: Record<string, SpeakerVoice> = {};
  let femaleChoice: ClassedVoice | undefined;

  const take = (list: ClassedVoice[]) => list.find((voice) => !used.has(voiceKey(voice)));

  for (const speaker of speakers) {
    const key = speaker.name.toLowerCase();
    if (result[key] || speaker.gender === 'male') continue;
    const choice = take(females) ?? take(neutral) ?? pool.find((voice) => voice.default) ?? pool[0];
    if (choice) {
      used.add(voiceKey(choice));
      if (!femaleChoice) femaleChoice = choice;
    }
    result[key] = naturalVoice(choice);
  }

  for (const speaker of speakers) {
    const key = speaker.name.toLowerCase();
    if (result[key]) continue;
    const maleVoice = take(males);
    if (maleVoice) {
      used.add(voiceKey(maleVoice));
      result[key] = naturalVoice(maleVoice);
      continue;
    }
    const differentLocale = neutral.find((voice) => !used.has(voiceKey(voice)) && (!femaleChoice || localeKey(voice.lang) !== localeKey(femaleChoice.lang)))
      ?? pool.find((voice) => voice.heard !== 'female' && !used.has(voiceKey(voice)) && (!femaleChoice || voiceKey(voice) !== voiceKey(femaleChoice)));
    const fallback = differentLocale ?? pool.find((voice) => voice.default) ?? pool[0];
    if (fallback) used.add(voiceKey(fallback));
    log(`No male speech voice on this device. Using "${fallback?.name ?? 'default'}" (${fallback?.lang ?? ''}) at natural pitch.`);
    result[key] = naturalVoice(fallback);
  }
  return result;
}
