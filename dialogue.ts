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

export const FEMALE_NAMES = ['Anna', 'Sophie', 'Emma', 'Lucy', 'Laura', 'Kate', 'Julia', 'Mia'] as const;

export type DialogueSpeaker = { name: string; gender: SpeakerGender };

/** First speaker is the higher voice. Second speaker is the lower voice. Both are women. */
export function pickDialogueSpeakers(previous: string[] = [], random: () => number = Math.random): DialogueSpeaker[] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < FEMALE_NAMES.length; i += 1) {
    for (let j = 0; j < FEMALE_NAMES.length; j += 1) {
      if (i === j) continue;
      pairs.push([FEMALE_NAMES[i], FEMALE_NAMES[j]]);
    }
  }
  const previousKey = previous.map((name) => name.toLowerCase()).sort().join('|');
  const allowed = pairs.filter(([first, second]) => [first, second].map((name) => name.toLowerCase()).sort().join('|') !== previousKey);
  const pool = allowed.length ? allowed : pairs;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  const [first, second] = pool[index];
  return [
    { name: first, gender: 'female' },
    { name: second, gender: 'female' },
  ];
}

function basketName(raw: string): string | null {
  return FEMALE_NAMES.find((name) => name.toLowerCase() === raw.toLowerCase()) ?? null;
}

/** Named women are the real speakers. Character 1/2 and Person 1/2 still map onto the current pair. */
export function canonicalSpeaker(raw: string, cast?: { name: string }[]): string | null {
  const cleaned = raw.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().replace(/:$/, '').trim();
  const named = basketName(cleaned);
  if (named) return named;
  if (/^(character\s*1|person\s*1)$/i.test(cleaned)) return cast?.[0]?.name ?? 'Character 1';
  if (/^(character\s*2|person\s*2)$/i.test(cleaned)) return cast?.[1]?.name ?? 'Character 2';
  return null;
}

export function genderForName(name: string, cast?: { name: string }[]): SpeakerGender | null {
  const speaker = canonicalSpeaker(name, cast);
  if (!speaker) return null;
  return 'female';
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

function splitLabelledLine(row: string, cast?: { name: string }[]): { speaker: string; line: string } | null {
  const plain = row.replace(/[*_`]/g, '').trim();
  const match = plain.match(/^(.*?):\s*(\S.*)$/);
  if (!match) return null;
  const speaker = canonicalSpeaker(match[1], cast);
  if (!speaker) return null;
  return { speaker, line: match[2].trim() };
}

function withSpeakerGenders(turns: DialogueTurn[], cast?: { name: string }[]): DialogueTurn[] {
  return turns.map((turn) => ({
    ...turn,
    speaker: canonicalSpeaker(turn.speaker, cast) ?? turn.speaker,
    gender: genderForName(turn.speaker, cast),
  }));
}

export function parseDialogue(raw: unknown, cast?: { name: string }[]): DialogueTurn[] {
  if (Array.isArray(raw)) {
    return withSpeakerGenders(raw.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const rawLine = String(record.line ?? record.text ?? '');
      const labelled = splitLabelledLine(rawLine, cast);
      const speaker = canonicalSpeaker(String(record.speaker ?? record.name ?? ''), cast) ?? labelled?.speaker ?? '';
      const line = labelled ? labelled.line : cleanLine(speaker, rawLine);
      if (!speaker || !line) return [];
      return [{ speaker, line, gender: null }];
    }), cast);
  }
  if (typeof raw !== 'string') return [];
  const turns: DialogueTurn[] = [];
  for (const row of raw.split(/\n+/)) {
    const labelled = splitLabelledLine(row, cast);
    if (!labelled) continue;
    turns.push({ speaker: labelled.speaker, line: labelled.line, gender: null });
  }
  return withSpeakerGenders(turns, cast);
}

/** About ten spoken words per turn. 60 words is 6 turns. */
export function dialogueTurnPlan(wordCount: number): { turns: number; wordsPerTurn: number } {
  const wordsPerTurn = 10;
  const turns = Math.max(4, Math.round(Math.max(1, wordCount) / wordsPerTurn));
  return { turns, wordsPerTurn };
}

/** Drop whole turns from the end until the spoken words fit the ±15% window. */
export function trimDialogueToLength(turns: DialogueTurn[], target: number): DialogueTurn[] {
  const max = Math.ceil(Math.max(1, Math.round(target)) * 1.15);
  if (spokenWordCount(turns) <= max) return turns;
  const trimmed = turns.slice();
  while (trimmed.length > 1 && spokenWordCount(trimmed) > max) trimmed.pop();
  return trimmed;
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

/** First speaker sounds higher. Second speaker sounds lower. Used only when one en-US voice must play both parts. */
const FEMALE_PITCH = 1.15;
const MALE_PITCH = 0.85;

export function isEnUsLang(lang: string): boolean {
  return lang.toLowerCase().replace(/_/g, '-').startsWith('en-us');
}

function spokenVoice(voice: ListedVoice | undefined, pitch: number, rateScale: number): SpeakerVoice {
  return {
    name: voice?.name ?? '',
    lang: 'en-US',
    voiceURI: voice?.voiceURI,
    pitch,
    rateScale,
  };
}

function voiceKey(voice: ListedVoice): string {
  return `${voice.name}|${voice.voiceURI ?? ''}`;
}

type ClassedVoice = ListedVoice & { heard: SpeakerGender | null };

function americanVoices(voices: ListedVoice[]): ClassedVoice[] {
  return voices
    .filter((voice) => isEnUsLang(voice.lang || ''))
    .map((voice) => ({ ...voice, heard: voiceGender(voice) }));
}

function byHint(gender: SpeakerGender) {
  const hints = gender === 'male' ? MALE_VOICE_HINTS : FEMALE_VOICE_HINTS;
  const ids = gender === 'male' ? MALE_GOOGLE_IDS : FEMALE_GOOGLE_IDS;
  const rank = (blob: string) => {
    const id = hintIndex(blob, ids);
    if (id >= 0) return id;
    const hint = hintIndex(blob, hints);
    if (hint >= 0) return 100 + hint;
    return 1000;
  };
  return (left: ClassedVoice, right: ClassedVoice) => rank(voiceBlob(left)) - rank(voiceBlob(right));
}

/**
 * One en-US voice for narration. The device default is used when that default is already en-US.
 * Otherwise a known female en-US voice, then any en-US voice. Other languages are ignored.
 */
export function narrationVoice(voices: ListedVoice[]): SpeakerVoice {
  const american = americanVoices(voices);
  const marked = american.find((voice) => voice.default);
  if (marked) return spokenVoice(marked, 1, 1);
  const females = american.filter((voice) => voice.heard === 'female').sort(byHint('female'));
  return spokenVoice(females[0] ?? american[0], 1, 1);
}

/**
 * Dialogue alternates a female en-US voice and a male en-US voice, one per speaker, in speaker order.
 * The first speaker is female. The next is male. en-GB and every other locale are never chosen.
 * Profile accent settings are ignored by the caller. If only one en-US voice exists, both speakers
 * use it, at pitch 1.15 then 0.85.
 */
export function voicesBySpeaker(
  speakers: { name: string; gender: SpeakerGender | null }[],
  voices: ListedVoice[],
  log: (message: string) => void = console.log
): Record<string, SpeakerVoice> {
  const american = americanVoices(voices);
  const females = american.filter((voice) => voice.heard === 'female').sort(byHint('female'));
  const males = american.filter((voice) => voice.heard === 'male').sort(byHint('male'));
  const femaleVoice = females[0];
  const maleVoice = males.find((voice) => !femaleVoice || voiceKey(voice) !== voiceKey(femaleVoice));
  const distinctGenders = Boolean(femaleVoice && maleVoice);

  let higher: ClassedVoice | undefined;
  let lower: ClassedVoice | undefined;
  if (distinctGenders) {
    higher = femaleVoice;
    lower = maleVoice;
  } else if (american.length <= 1) {
    higher = american[0];
    lower = american[0];
    if (american.length === 1) {
      log(`Only one American English voice (${american[0].name}). Using pitch ${FEMALE_PITCH} for the first speaker and ${MALE_PITCH} for the second.`);
    } else {
      log('No American English speech voice on this device. Speech will request en-US.');
    }
  } else {
    const knownFemale = females[0];
    const knownMale = males[0];
    if (knownFemale) {
      higher = knownFemale;
      lower = american.find((voice) => voiceKey(voice) !== voiceKey(knownFemale)) ?? knownFemale;
    } else if (knownMale) {
      lower = knownMale;
      higher = american.find((voice) => voiceKey(voice) !== voiceKey(knownMale)) ?? knownMale;
    } else {
      higher = american[0];
      lower = american.find((voice) => voiceKey(voice) !== voiceKey(american[0])) ?? american[0];
    }
    log(`No separate American female and male voices. Using "${higher?.name ?? 'default'}" and "${lower?.name ?? 'default'}".`);
  }

  const natural = Boolean(distinctGenders && higher && lower && voiceKey(higher) !== voiceKey(lower));
  const result: Record<string, SpeakerVoice> = {};
  speakers.forEach((speaker, index) => {
    const femaleTurn = index % 2 === 0;
    const voice = femaleTurn ? higher : lower;
    const pitch = natural ? 1 : (femaleTurn ? FEMALE_PITCH : MALE_PITCH);
    result[speaker.name.toLowerCase()] = spokenVoice(voice, pitch, 1);
  });
  return result;
}
