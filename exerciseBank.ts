import { createHash, timingSafeEqual } from 'node:crypto';
import { TOPICS, WILDCARD_TOPIC } from './constants.ts';
import {
  spokenWordCount,
  type DialogueTurn,
} from './dialogue.ts';
import {
  GRAMMAR_ITEM_COUNT,
  GRAMMAR_MIN_ITEMS,
  normalizeGrammarSet,
  type GrammarExerciseType,
  type GrammarItem,
  type GrammarLevel,
  type GrammarRequest,
  type GrammarSet,
} from './grammarSet.ts';
import { countWords, wordCountBounds } from './lessonUtils.ts';
import { readEnvValue, type EnvMap } from './taskMail.ts';

/** Standard grammar options. A typed topic is not a bank key. */
export const GRAMMAR_BANK_LEVELS: readonly GrammarLevel[] = ['B1', 'B2', 'C1'];
export const GRAMMAR_BANK_EXERCISES: readonly GrammarExerciseType[] = ['blanks', 'phrasal', 'order'];

/** New grammar sets per Monday run, spread across the 9 level × exercise pairs. */
export const EXERCISE_BANK_WEEKLY_BATCH_DEFAULT = 250;
/** New listening lessons per Monday run. Sized for Azure Speech free tier (0.5M neural characters / month). */
export const EXERCISE_BANK_LISTENING_WEEKLY_BATCH_DEFAULT = 100;
export const EXERCISE_BANK_BATCH_MAX = 3000;
/** Azure F0 neural-voice allowance. The listening batch is planned against this. */
export const AZURE_NEURAL_FREE_CHARACTERS = 500_000;
/**
 * Spoken characters for one long listening lesson (about 140 words, plus names in a dialogue).
 * A typical week mixes 60, 100, and 140 words, so the average is lower.
 */
export const LISTENING_CHARS_PER_LESSON_HIGH = 900;
/** Stored sets kept for one level and one exercise. Older rows are deleted past this. */
export const EXERCISE_BANK_CAP_DEFAULT = 1000;
export const EXERCISE_BANK_CAP_MAX = 5000;
export const EXERCISE_BANK_HOP_LIMIT = 200;
export const REFILL_RESERVE_MS = 40_000;
export const REFILL_HARD_FAILURE_LIMIT = 4;
export const REFILL_MISS_LIMIT = 8;
export const REFILL_DUPLICATE_LIMIT = 12;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GrammarSlot = {
  level: GrammarLevel;
  exercise: GrammarExerciseType;
};

export type ExerciseBankKind = 'grammar' | 'listening';

export const LISTENING_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
export const LISTENING_FORMATS = ['text', 'dialogue'] as const;
export const LISTENING_WORD_COUNTS = [60, 100, 140] as const;
export const LISTENING_QUESTION_COUNTS = [5, 8, 10] as const;

export type ListeningLevel = (typeof LISTENING_LEVELS)[number];
export type ListeningFormat = (typeof LISTENING_FORMATS)[number];

/** One standard listening combination. Wildcard is not stored; a request for it draws from these. */
export type ListeningSlot = {
  level: ListeningLevel;
  format: ListeningFormat;
  topic: string;
  wordCount: number;
  questionCount: number;
};

export type ListeningQuizItem = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  supportingSentence: string;
};

export type ListeningLesson = {
  level: ListeningLevel;
  format: ListeningFormat;
  topicValue: string;
  topicLabel: string;
  title: string;
  story: string;
  dialogue: DialogueTurn[];
  vocabulary: { word: string; definition: string }[];
  quiz: ListeningQuizItem[];
  wordCount: number;
  questionCount: number;
  speakers: { name: string; gender: 'female' | 'male' }[];
};

const LISTENING_AUDIO_PATH_RE = /^listening\/[0-9a-f]{64}\.mp3$/;

export function listeningCatalogTopics(): { value: string; label: string }[] {
  return TOPICS.filter((topic) => topic.value !== WILDCARD_TOPIC).map((topic) => ({
    value: topic.value,
    label: topic.label,
  }));
}

export type RefillInsertResult = 'inserted' | 'duplicate' | 'invalid' | 'error' | 'unavailable';

export type RefillStop = 'target' | 'time' | 'failures' | 'duplicates' | 'unavailable';

export type RefillHopResult = {
  inserted: number;
  remaining: number;
  cursor: number;
  stopped: RefillStop | null;
};

export function grammarSlots(): GrammarSlot[] {
  return GRAMMAR_BANK_LEVELS.flatMap((level) => (
    GRAMMAR_BANK_EXERCISES.map((exercise) => ({ level, exercise }))
  ));
}

/** An empty topic is the standard exercise. Typed text always stays on live generation. */
export function grammarUsesBank(topic: string): boolean {
  return topic.trim().length === 0;
}

export function listeningSlots(): ListeningSlot[] {
  return LISTENING_LEVELS.flatMap((level) => (
    LISTENING_FORMATS.flatMap((format) => (
      LISTENING_WORD_COUNTS.flatMap((wordCount) => (
        LISTENING_QUESTION_COUNTS.flatMap((questionCount) => (
          listeningCatalogTopics().map((topic) => ({
            level,
            format,
            topic: topic.value,
            wordCount,
            questionCount,
          }))
        ))
      ))
    ))
  ));
}

/** The six choices a person makes first: level, then text or dialogue. */
export function listeningFocuses(): { level: ListeningLevel; format: ListeningFormat }[] {
  return LISTENING_LEVELS.flatMap((level) => (
    LISTENING_FORMATS.map((format) => ({ level, format }))
  ));
}

export function listeningSlotKey(slot: Pick<ListeningSlot, 'level' | 'format' | 'topic' | 'wordCount' | 'questionCount'>): string {
  return `${slot.level}|${slot.format}|${slot.topic}|${slot.wordCount}|${slot.questionCount}`;
}

export function grammarSlotKey(slot: GrammarSlot): string {
  return `${slot.level}|${slot.exercise}`;
}

function slotCount(counts: ReadonlyMap<string, number> | undefined, key: string): number {
  return counts?.get(key) ?? 0;
}

/** Among the tied thinnest cells, random chooses topic, length, and question count. */
function pickLeastFilled<T>(
  candidates: readonly T[],
  keyOf: (item: T) => string,
  counts: ReadonlyMap<string, number> | undefined,
  random: () => number,
): T {
  let min = Infinity;
  const weighed = candidates.map((item) => {
    const count = slotCount(counts, keyOf(item));
    if (count < min) min = count;
    return { item, count };
  });
  const tied = weighed.filter((row) => row.count === min).map((row) => row.item);
  const roll = random();
  const safe = Number.isFinite(roll) ? roll : 0;
  const index = Math.min(tied.length - 1, Math.max(0, Math.floor(safe * tied.length)));
  return tied[index];
}

/**
 * Grammar walks levels in turn (B1, B2, C1). Inside a level it fills the exercise
 * with the fewest stored sets. An empty bank therefore still visits every level
 * before it repeats one, and a lagging exercise catches up.
 */
export function nextGrammarSlot(input: {
  cursor: number;
  counts?: ReadonlyMap<string, number>;
  random?: () => number;
}): GrammarSlot {
  const levels = GRAMMAR_BANK_LEVELS;
  const index = ((input.cursor % levels.length) + levels.length) % levels.length;
  const level = levels[index];
  const candidates = GRAMMAR_BANK_EXERCISES.map((exercise) => ({ level, exercise }));
  return pickLeastFilled(candidates, grammarSlotKey, input.counts, input.random ?? Math.random);
}

/**
 * Listening walks the six level × format pairs in turn. Inside that pair it fills
 * the thinnest topic × length × question count, and breaks ties at random so a
 * fresh bank does not spend the week on Daily Life, 60 words, and 5 questions.
 */
export function nextListeningSlot(input: {
  cursor: number;
  counts?: ReadonlyMap<string, number>;
  random?: () => number;
}): ListeningSlot {
  const focuses = listeningFocuses();
  const index = ((input.cursor % focuses.length) + focuses.length) % focuses.length;
  const focus = focuses[index];
  const candidates = listeningSlots().filter((slot) => slot.level === focus.level && slot.format === focus.format);
  return pickLeastFilled(candidates, listeningSlotKey, input.counts, input.random ?? Math.random);
}

export function isListeningLevel(value: string): value is ListeningLevel {
  return (LISTENING_LEVELS as readonly string[]).includes(value);
}

export function isListeningFormat(value: string): value is ListeningFormat {
  return value === 'text' || value === 'dialogue';
}

export function isListeningWordCount(value: number): boolean {
  return (LISTENING_WORD_COUNTS as readonly number[]).includes(value);
}

export function isListeningQuestionCount(value: number): boolean {
  return (LISTENING_QUESTION_COUNTS as readonly number[]).includes(value);
}

export function listeningTopicLabel(value: string): string {
  return listeningCatalogTopics().find((topic) => topic.value === value)?.label ?? value;
}

/**
 * A typed custom topic is generated live. An empty custom topic uses the list:
 * a named list topic, or any banked list topic when the list says "Any topic".
 */
export function listeningBankQuery(input: { customTopic: string; topic: string }):
  | { bank: false; reason: 'custom' }
  | { bank: true; topic: string | null } {
  if (input.customTopic.trim()) return { bank: false, reason: 'custom' };
  const raw = input.topic.trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === WILDCARD_TOPIC || lower === 'any topic') {
    return { bank: true, topic: null };
  }
  const byValue = listeningCatalogTopics().find((topic) => topic.value === raw || topic.value === lower);
  if (byValue) return { bank: true, topic: byValue.value };
  const byLabel = listeningCatalogTopics().find((topic) => topic.label.toLowerCase() === lower);
  if (byLabel) return { bank: true, topic: byLabel.value };
  return { bank: false, reason: 'custom' };
}

export function listeningAudioPath(hash: string): string {
  return `listening/${hash}.mp3`;
}

export function isListeningAudioPath(value: string): boolean {
  return LISTENING_AUDIO_PATH_RE.test(value);
}

function oneLineStory(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function canonicalQuizItem(item: ListeningQuizItem) {
  return {
    question: oneLineStory(item.question),
    answer: oneLineStory(item.correctAnswer),
    options: item.options.map(oneLineStory).sort(),
  };
}

/** Same story and answers are one lesson. Option order does not make a new row. */
export function listeningContentHash(lesson: Pick<
  ListeningLesson,
  'level' | 'format' | 'topicValue' | 'wordCount' | 'questionCount' | 'story' | 'quiz'
>): string {
  const quiz = lesson.quiz.map(canonicalQuizItem).sort((left, right) => {
    const a = JSON.stringify(left);
    const b = JSON.stringify(right);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  const body = JSON.stringify({
    kind: 'listening',
    level: lesson.level,
    format: lesson.format,
    topic: lesson.topicValue,
    wordCount: lesson.wordCount,
    questionCount: lesson.questionCount,
    story: oneLineStory(lesson.story),
    quiz,
  });
  return createHash('sha256').update(body).digest('hex');
}

export function listeningBankPayload(lesson: ListeningLesson) {
  return {
    mode: 'listening' as const,
    level: lesson.level,
    format: lesson.format,
    topic: lesson.topicLabel,
    title: lesson.title,
    story: lesson.story,
    dialogue: lesson.dialogue,
    vocabulary: lesson.vocabulary,
    quiz: lesson.quiz,
    wordCount: lesson.wordCount,
    questionCount: lesson.questionCount,
    speakers: lesson.speakers,
  };
}

export function listeningDimensions(lesson: ListeningLesson, audioPath: string) {
  return {
    topic: lesson.topicValue,
    wordCount: lesson.wordCount,
    questionCount: lesson.questionCount,
    audioPath,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readQuizItem(value: unknown): ListeningQuizItem | null {
  const record = asRecord(value);
  if (!record) return null;
  const options = Array.isArray(record.options)
    ? record.options.map((option) => String(option ?? '').trim()).filter(Boolean)
    : [];
  const item = {
    question: String(record.question ?? '').trim(),
    options,
    correctAnswer: String(record.correctAnswer ?? '').trim(),
    explanation: String(record.explanation ?? '').trim(),
    supportingSentence: String(record.supportingSentence ?? '').trim(),
  };
  if (!item.question || options.length !== 4 || !options.includes(item.correctAnswer) || !item.explanation) return null;
  return item;
}

/** A stored or freshly generated lesson that is safe to keep in the bank. */
export function canBankListeningLesson(lesson: ListeningLesson): boolean {
  if (!isListeningLevel(lesson.level) || !isListeningFormat(lesson.format)) return false;
  if (!listeningCatalogTopics().some((topic) => topic.value === lesson.topicValue)) return false;
  if (lesson.topicLabel !== listeningTopicLabel(lesson.topicValue)) return false;
  if (!isListeningWordCount(lesson.wordCount) || !isListeningQuestionCount(lesson.questionCount)) return false;
  if (!lesson.story.trim() || lesson.title.trim() !== lesson.topicLabel) return false;
  if (lesson.quiz.length !== lesson.questionCount) return false;
  if (lesson.quiz.some((item) => !readQuizItem(item))) return false;
  const spoken = lesson.format === 'dialogue' ? spokenWordCount(lesson.dialogue) : countWords(lesson.story);
  const bounds = wordCountBounds(lesson.wordCount);
  if (spoken < bounds.min || spoken > bounds.max) return false;
  if (lesson.format === 'dialogue') {
    if (lesson.dialogue.length < 4 || lesson.speakers.length !== 2) return false;
    const names = new Set(lesson.speakers.map((speaker) => speaker.name.toLowerCase()));
    if (names.size !== 2) return false;
    if (lesson.dialogue.some((turn) => !names.has(turn.speaker.toLowerCase()) || !turn.line.trim())) return false;
  }
  return true;
}

export function listeningLessonFromBankPayload(
  payload: unknown,
  dimensions: unknown,
  request: { level: string; format: string; topic: string | null; wordCount: number; questionCount: number },
): ListeningLesson | null {
  const body = asRecord(payload);
  const dims = asRecord(dimensions);
  if (!body || !dims) return null;
  if (body.mode !== 'listening') return null;
  if (body.level !== request.level || body.format !== request.format) return null;
  const topicValue = String(dims.topic ?? '');
  if (request.topic && topicValue !== request.topic) return null;
  const wordCount = Number(dims.wordCount);
  const questionCount = Number(dims.questionCount);
  if (wordCount !== request.wordCount || questionCount !== request.questionCount) return null;
  const audioPath = String(dims.audioPath ?? '');
  if (!isListeningAudioPath(audioPath)) return null;
  const quiz = Array.isArray(body.quiz) ? body.quiz.map(readQuizItem) : [];
  if (quiz.some((item) => !item)) return null;
  const dialogue = Array.isArray(body.dialogue)
    ? body.dialogue.flatMap((turn) => {
      const record = asRecord(turn);
      if (!record) return [];
      const speaker = String(record.speaker ?? '').trim();
      const line = String(record.line ?? '').trim();
      if (!speaker || !line) return [];
      const gender = record.gender === 'male' ? 'male' as const : 'female' as const;
      return [{ speaker, line, gender }];
    })
    : [];
  const speakers = Array.isArray(body.speakers)
    ? body.speakers.flatMap((speaker) => {
      const record = asRecord(speaker);
      if (!record) return [];
      const name = String(record.name ?? '').trim();
      if (!name) return [];
      return [{ name, gender: record.gender === 'male' ? 'male' as const : 'female' as const }];
    })
    : [];
  const vocabulary = Array.isArray(body.vocabulary)
    ? body.vocabulary.flatMap((item) => {
      const record = asRecord(item);
      if (!record) return [];
      const word = String(record.word ?? '').trim();
      const definition = String(record.definition ?? '').trim();
      if (!word || !definition) return [];
      return [{ word, definition }];
    })
    : [];
  if (!isListeningLevel(request.level) || !isListeningFormat(request.format)) return null;
  const lesson: ListeningLesson = {
    level: request.level,
    format: request.format,
    topicValue,
    topicLabel: listeningTopicLabel(topicValue),
    title: String(body.title ?? listeningTopicLabel(topicValue)),
    story: String(body.story ?? '').trim(),
    dialogue,
    vocabulary,
    quiz: quiz.filter((item): item is ListeningQuizItem => Boolean(item)),
    wordCount,
    questionCount,
    speakers,
  };
  if (!canBankListeningLesson(lesson)) return null;
  if (String(body.topic ?? '') !== lesson.topicLabel) return null;
  return lesson;
}

/** A generated story plus quiz, or null when it is not a standard bank lesson. */
export function assembleListeningLesson(input: {
  slot: ListeningSlot;
  story: string;
  dialogue: DialogueTurn[];
  vocabulary: { word: string; definition: string }[];
  quiz: ListeningQuizItem[];
  speakers: { name: string; gender: 'female' | 'male' }[];
}): ListeningLesson | null {
  const lesson: ListeningLesson = {
    level: input.slot.level,
    format: input.slot.format,
    topicValue: input.slot.topic,
    topicLabel: listeningTopicLabel(input.slot.topic),
    title: listeningTopicLabel(input.slot.topic),
    story: input.story.trim(),
    dialogue: input.dialogue,
    vocabulary: input.vocabulary,
    quiz: input.quiz,
    wordCount: input.slot.wordCount,
    questionCount: input.slot.questionCount,
    speakers: input.speakers,
  };
  return canBankListeningLesson(lesson) ? lesson : null;
}

export function isBankId(value: string): boolean {
  return UUID_RE.test(value);
}

/** Id stored on a banked piece so a withheld pack can return it to the pool. */
export function exerciseBankId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const id = (value as { bankId?: unknown }).bankId;
  return typeof id === 'string' && isBankId(id) ? id : null;
}

/** Id stored on a task grammar piece so a withheld pack can return the set to the pool. */
export function grammarBankId(value: unknown): string | null {
  return exerciseBankId(value);
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function canonicalItem(item: GrammarItem): { kind: 'choice' | 'order'; prompt?: string; answer?: string; chunks?: string[] } {
  if (item.kind === 'order') {
    return { kind: 'order', chunks: item.chunks.map(oneLine) };
  }
  return { kind: 'choice', prompt: oneLine(item.prompt), answer: oneLine(item.correctAnswer) };
}

/**
 * Same prompts and answers are one exercise, even when the options were shuffled
 * or the items were reordered. The topic is not part of the hash: banked sets have none.
 */
export function grammarContentHash(set: Pick<GrammarSet, 'level' | 'exercise' | 'items'>): string {
  const items = set.items.map(canonicalItem).sort((left, right) => {
    const a = JSON.stringify(left);
    const b = JSON.stringify(right);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  const body = JSON.stringify({
    kind: 'grammar',
    level: set.level,
    exercise: set.exercise,
    items,
  });
  return createHash('sha256').update(body).digest('hex');
}

export function grammarBankPayload(set: GrammarSet): {
  mode: 'grammar';
  level: GrammarLevel;
  exercise: GrammarExerciseType;
  topic: '';
  title: string;
  items: GrammarItem[];
} {
  return {
    mode: 'grammar',
    level: set.level,
    exercise: set.exercise,
    topic: '',
    title: set.title,
    items: set.items,
  };
}

export function canBankGrammarSet(set: GrammarSet): boolean {
  return grammarUsesBank(set.topic)
    && GRAMMAR_BANK_LEVELS.includes(set.level)
    && GRAMMAR_BANK_EXERCISES.includes(set.exercise)
    && set.items.length >= GRAMMAR_MIN_ITEMS
    && set.items.length <= GRAMMAR_ITEM_COUNT;
}

/** Re-check a stored set with the same validator the generator uses. Options are shuffled again. */
export function grammarSetFromBankPayload(payload: unknown, request: GrammarRequest): GrammarSet | null {
  if (!grammarUsesBank(request.topic)) return null;
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (record.level !== request.level || record.exercise !== request.exercise) return null;
  if (typeof record.topic === 'string' && record.topic.trim()) return null;
  const normalized = normalizeGrammarSet(payload, {
    level: request.level,
    exercise: request.exercise,
    topic: '',
  });
  if (!normalized.ok || !canBankGrammarSet(normalized.set)) return null;
  return normalized.set;
}

/** Ids past the cap when `newestFirst` is ordered newest to oldest. */
export function overflowIds(newestFirst: readonly { id: string }[], cap: number): string[] {
  if (cap < 1) return newestFirst.map((row) => row.id);
  return newestFirst.slice(cap).map((row) => row.id);
}

export function bankUnavailable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return message.includes('42p01')
    || message.includes('42883')
    || message.includes('pgrst202')
    || message.includes('pgrst205')
    || message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('could not find the function');
}

function readBoundedInt(raw: string, min: number, max: number): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

export function weeklyBatchSize(env: EnvMap): number {
  const parsed = readBoundedInt(readEnvValue(env, 'EXERCISE_BANK_WEEKLY_BATCH'), 1, EXERCISE_BANK_BATCH_MAX);
  return parsed ?? EXERCISE_BANK_WEEKLY_BATCH_DEFAULT;
}

export function listeningWeeklyBatchSize(env: EnvMap): number {
  const parsed = readBoundedInt(readEnvValue(env, 'EXERCISE_BANK_LISTENING_WEEKLY_BATCH'), 1, EXERCISE_BANK_BATCH_MAX);
  return parsed ?? EXERCISE_BANK_LISTENING_WEEKLY_BATCH_DEFAULT;
}

/** Spoken characters a Monday listening run is planned to spend. */
export function listeningWeeklyCharacters(batch: number, charsPerLesson = LISTENING_CHARS_PER_LESSON_HIGH): number {
  return Math.max(0, batch) * charsPerLesson;
}

export function exerciseBankKind(value: unknown): ExerciseBankKind | null {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text === 'grammar') return 'grammar';
  if (text === 'listening') return 'listening';
  return null;
}

export function exerciseBankCap(env: EnvMap): number {
  const parsed = readBoundedInt(readEnvValue(env, 'EXERCISE_BANK_CAP'), 1, EXERCISE_BANK_CAP_MAX);
  return parsed ?? EXERCISE_BANK_CAP_DEFAULT;
}

function headerValue(headers: Record<string, string | undefined>, name: string): string {
  return (headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '').trim();
}

/**
 * A continuation hop sends the remaining count in a header.
 * The first hop uses the JSON target, or the weekly batch when that is omitted.
 * A broken remaining count stops the chain instead of starting the batch over.
 */
function batchForKind(kind: ExerciseBankKind, env: EnvMap): number {
  return kind === 'listening' ? listeningWeeklyBatchSize(env) : weeklyBatchSize(env);
}

/**
 * A continuation hop sends the remaining count in a header.
 * The first hop uses the JSON target, or the weekly batch for that kind when target is omitted.
 * A broken remaining count stops the chain instead of starting the batch over.
 * `kind` defaults to grammar so an older seed command still fills grammar.
 */
export function readRefillRequest(input: {
  headers: Record<string, string | undefined>;
  body: string | null | undefined;
  env: EnvMap;
}): { target: number; cursor: number; hops: number; kind: ExerciseBankKind | null } {
  const cursor = readBoundedInt(headerValue(input.headers, 'x-exercise-bank-cursor'), 0, 1_000_000) ?? 0;
  const hops = readBoundedInt(headerValue(input.headers, 'x-exercise-bank-hops'), 0, EXERCISE_BANK_HOP_LIMIT) ?? 0;
  const remaining = headerValue(input.headers, 'x-exercise-bank-remaining');
  if (remaining) {
    const headerKind = headerValue(input.headers, 'x-exercise-bank-kind');
    return {
      target: readBoundedInt(remaining, 1, EXERCISE_BANK_BATCH_MAX) ?? 0,
      cursor,
      hops,
      kind: exerciseBankKind(headerKind || 'grammar'),
    };
  }
  let bodyTarget: unknown;
  let bodyKind: unknown;
  try {
    const parsed = JSON.parse(input.body || '{}') as { target?: unknown; kind?: unknown };
    bodyTarget = parsed && typeof parsed === 'object' ? parsed.target : undefined;
    bodyKind = parsed && typeof parsed === 'object' ? parsed.kind : undefined;
  } catch {
    bodyTarget = undefined;
    bodyKind = undefined;
  }
  const kind = exerciseBankKind(bodyKind ?? 'grammar');
  if (!kind) return { target: 0, cursor, hops, kind: null };
  if (bodyTarget != null && String(bodyTarget).trim()) {
    const target = readBoundedInt(String(bodyTarget), 1, EXERCISE_BANK_BATCH_MAX);
    return { target: target ?? batchForKind(kind, input.env), cursor, hops, kind };
  }
  return { target: batchForKind(kind, input.env), cursor, hops, kind };
}

export function exerciseBankSecretOk(header: string | null | undefined, env: EnvMap): boolean {
  const expected = readEnvValue(env, 'EXERCISE_BANK_JOB_SECRET');
  const got = header?.trim() ?? '';
  if (!expected || !got) return false;
  const left = Buffer.from(got);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function shouldChainRefill(result: RefillHopResult, hops: number, hopLimit = EXERCISE_BANK_HOP_LIMIT): boolean {
  if (result.remaining <= 0) return false;
  if (hops + 1 >= hopLimit) return false;
  return result.stopped === 'time' || result.stopped === null;
}

/**
 * One background invocation. `pick` chooses the next combination (level and
 * format round-robin, thinnest cell inside that). Without `pick`, it walks
 * `slots` in order. It stops for the clock, a string of failures, or the target.
 */
export async function runRefillHop<TSlot, TItem>(input: {
  slots: readonly TSlot[];
  target: number;
  cursor: number;
  deadline: number;
  now?: () => number;
  reserveMs?: number;
  pick?: (cursor: number) => TSlot;
  produce: (slot: TSlot) => Promise<TItem | null>;
  insert: (slot: TSlot, item: TItem) => Promise<RefillInsertResult>;
}): Promise<RefillHopResult> {
  const now = input.now ?? (() => Date.now());
  const reserveMs = input.reserveMs ?? REFILL_RESERVE_MS;
  const slots = input.slots;
  const pick = input.pick ?? ((cursor: number) => slots[((cursor % slots.length) + slots.length) % slots.length]);
  if (input.target <= 0) {
    return { inserted: 0, remaining: 0, cursor: input.cursor, stopped: 'target' };
  }
  if (!input.pick && !slots.length) {
    return { inserted: 0, remaining: input.target, cursor: input.cursor, stopped: 'failures' };
  }
  let inserted = 0;
  let cursor = input.cursor;
  let hard = 0;
  let misses = 0;
  let duplicates = 0;
  let stopped: RefillStop | null = null;

  while (inserted < input.target) {
    if (now() + reserveMs >= input.deadline) {
      stopped = 'time';
      break;
    }
    const slot = pick(cursor);
    cursor += 1;
    let produced: TItem | null = null;
    try {
      produced = await input.produce(slot);
    } catch {
      hard += 1;
      misses = 0;
      duplicates = 0;
      if (hard >= REFILL_HARD_FAILURE_LIMIT) {
        stopped = 'failures';
        break;
      }
      continue;
    }
    if (!produced) {
      hard = 0;
      duplicates = 0;
      misses += 1;
      if (misses >= REFILL_MISS_LIMIT) {
        stopped = 'failures';
        break;
      }
      continue;
    }
    const saved = await input.insert(slot, produced);
    if (saved === 'inserted') {
      inserted += 1;
      hard = 0;
      misses = 0;
      duplicates = 0;
      continue;
    }
    if (saved === 'duplicate') {
      hard = 0;
      misses = 0;
      duplicates += 1;
      if (duplicates >= REFILL_DUPLICATE_LIMIT) {
        stopped = 'duplicates';
        break;
      }
      continue;
    }
    if (saved === 'unavailable') {
      stopped = 'unavailable';
      break;
    }
    if (saved === 'error') hard += 1;
    else hard = 0;
    misses += 1;
    duplicates = 0;
    if (hard >= REFILL_HARD_FAILURE_LIMIT || misses >= REFILL_MISS_LIMIT) {
      stopped = 'failures';
      break;
    }
  }

  if (!stopped && inserted >= input.target) stopped = 'target';
  return {
    inserted,
    remaining: Math.max(0, input.target - inserted),
    cursor,
    stopped,
  };
}
