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
export const MALE_NAMES = ['James', 'Daniel', 'Leo', 'Noah', 'Owen', 'Ben', 'Luke', 'Sam'] as const;

export type DialogueSpeaker = { name: string; gender: SpeakerGender };

/**
 * One woman and one man. Either may speak first. The pair changes each lesson.
 * Azure uses Ava for the woman and Andrew for the man, not the speaking order.
 */
export function pickDialogueSpeakers(previous: string[] = [], random: () => number = Math.random): DialogueSpeaker[] {
  const pairs: DialogueSpeaker[][] = [];
  for (const woman of FEMALE_NAMES) {
    for (const man of MALE_NAMES) {
      pairs.push([
        { name: woman, gender: 'female' },
        { name: man, gender: 'male' },
      ]);
      pairs.push([
        { name: man, gender: 'male' },
        { name: woman, gender: 'female' },
      ]);
    }
  }
  const previousKey = previous.map((name) => name.toLowerCase()).sort().join('|');
  const allowed = pairs.filter((pair) => pair.map((speaker) => speaker.name.toLowerCase()).sort().join('|') !== previousKey);
  const pool = allowed.length ? allowed : pairs;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index].map((speaker) => ({ ...speaker }));
}

/** A name from the fixed lists, with the gender that voice must match. */
export function speakerFromName(raw: string): DialogueSpeaker | null {
  return knownName(raw);
}

function knownName(raw: string): DialogueSpeaker | null {
  const key = String(raw ?? '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().replace(/:$/, '').trim().toLowerCase();
  const woman = FEMALE_NAMES.find((name) => name.toLowerCase() === key);
  if (woman) return { name: woman, gender: 'female' };
  const man = MALE_NAMES.find((name) => name.toLowerCase() === key);
  if (man) return { name: man, gender: 'male' };
  return null;
}

/** Named speakers are the real speakers. Character 1/2 and Person 1/2 still map onto the current pair. */
export function canonicalSpeaker(raw: string, cast?: { name: string }[]): string | null {
  const cleaned = raw.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().replace(/:$/, '').trim();
  const named = knownName(cleaned);
  if (named) return named.name;
  if (/^(character\s*1|person\s*1)$/i.test(cleaned)) return cast?.[0]?.name ?? 'Character 1';
  if (/^(character\s*2|person\s*2)$/i.test(cleaned)) return cast?.[1]?.name ?? 'Character 2';
  return null;
}

export function genderForName(name: string, cast?: { name: string; gender?: SpeakerGender }[]): SpeakerGender | null {
  const speaker = canonicalSpeaker(name, cast);
  if (!speaker) return null;
  const known = knownName(speaker);
  if (known) return known.gender;
  const listed = cast?.find((person) => person.name.toLowerCase() === speaker.toLowerCase());
  if (listed?.gender) return listed.gender;
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

/**
 * The bank asks for two named speakers, and the model often uses a different pair.
 * Keep the lines and the order. The person who speaks first takes the first requested
 * name, and each name keeps the gender on that cast entry.
 */
export function alignDialogueToCast(
  turns: DialogueTurn[],
  cast: { name: string; gender: SpeakerGender }[],
): DialogueTurn[] | null {
  if (cast.length !== 2 || turns.length < 4) return null;
  const first = turns[0]?.speaker?.trim();
  if (!first) return null;
  const names = dialogueSpeakers(turns);
  if (names.length !== 2) return null;
  const second = names.find((name) => name.toLowerCase() !== first.toLowerCase());
  if (!second) return null;
  const map = new Map<string, { name: string; gender: SpeakerGender }>([
    [first.toLowerCase(), cast[0]],
    [second.toLowerCase(), cast[1]],
  ]);
  const aligned: DialogueTurn[] = [];
  for (const turn of turns) {
    const person = map.get(turn.speaker.toLowerCase());
    const line = turn.line.replace(/\s+/g, ' ').trim();
    if (!person || !line) return null;
    aligned.push({ speaker: person.name, line, gender: person.gender });
  }
  return aligned;
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

/** Same female voice. The second speaker is pitched a little higher so the two women sound different. */
const FIRST_SPEAKER_PITCH = 1;
const SECOND_SPEAKER_PITCH = 1.12;

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
 * Browser speech when Azure audio is not used. A woman gets one female en-US voice.
 * A second woman is the same voice at a higher pitch. A man gets a male en-US voice.
 * en-GB voices are never chosen. An empty list still requests en-US.
 */
export function voicesBySpeaker(
  speakers: { name: string; gender: SpeakerGender | null }[],
  voices: ListedVoice[],
): Record<string, SpeakerVoice> {
  const american = americanVoices(voices);
  const females = american.filter((voice) => voice.heard === 'female').sort(byHint('female'));
  const males = american.filter((voice) => voice.heard === 'male').sort(byHint('male'));
  const femaleVoice = females[0] ?? american.find((voice) => voice.heard !== 'male');
  const maleVoice = males[0];
  const result: Record<string, SpeakerVoice> = {};
  let femaleIndex = 0;
  speakers.forEach((speaker) => {
    if (speaker.gender === 'male') {
      result[speaker.name.toLowerCase()] = spokenVoice(maleVoice, 1, 1);
      return;
    }
    const pitch = femaleIndex === 0 ? FIRST_SPEAKER_PITCH : SECOND_SPEAKER_PITCH;
    femaleIndex += 1;
    result[speaker.name.toLowerCase()] = spokenVoice(femaleVoice, pitch, 1);
  });
  return result;
}
