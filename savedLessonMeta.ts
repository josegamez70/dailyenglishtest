import {
  grammarTitle,
  type GrammarExerciseType,
  type GrammarItem,
  type GrammarLevel,
  type ItemGrade,
} from './grammarSet.ts';
import { lessonModeLabel } from './progressStats.ts';
import { grammarSubtype, savedLevelLabel } from './studentDetail.ts';

export type SavedLessonBadge = {
  kind: 'mode' | 'format' | 'level' | 'subtype' | 'task';
  label: string;
};

/** Newest reading/listening rows kept, and newest grammar sets kept. Each group has its own cap. */
export const SAVED_LESSON_LIMIT = 10;

export type SavedLessonFilter = 'all' | 'reading' | 'listening' | 'grammar';

export const SAVED_LESSON_FILTERS: readonly { id: SavedLessonFilter; label: string; empty: string }[] = [
  { id: 'all', label: 'All', empty: 'No saved lessons yet.' },
  { id: 'reading', label: 'Reading', empty: 'No saved reading lessons yet.' },
  { id: 'listening', label: 'Listening', empty: 'No saved listening lessons yet.' },
  { id: 'grammar', label: 'Grammar', empty: 'No saved grammar sets yet.' },
];

/** Reading, listening, and grammar are stored on the lesson. Older rows with no mode stay in All. */
export function savedLessonFilterMode(lesson: Record<string, unknown>): Exclude<SavedLessonFilter, 'all'> | null {
  if (lesson.mode === 'reading' || lesson.mode === 'listening' || lesson.mode === 'grammar') return lesson.mode;
  return null;
}

export function filterSavedLessons<T extends { lesson: Record<string, unknown> }>(
  rows: T[],
  filter: SavedLessonFilter,
): T[] {
  if (filter === 'all') return rows;
  return rows.filter((row) => savedLessonFilterMode(row.lesson) === filter);
}

/**
 * A saved lesson keeps the practice mode and the format (`text` or `dialogue`).
 * My progress prints reading and listening as Reading or Audio. The lesson screen
 * calls the two formats Text and Dialogue. A grammar set adds Grammar, the exercise
 * (Phrasal, Blanks, or Order), and the level.
 */
export function savedLessonBadges(lesson: Record<string, unknown>): SavedLessonBadge[] {
  const taskBadge: SavedLessonBadge[] = lesson.task === true ? [{ kind: 'task', label: 'Task' }] : [];
  if (lesson.mode === 'grammar') {
    const badges: SavedLessonBadge[] = [...taskBadge, { kind: 'mode', label: 'Grammar' }];
    const subtype = grammarSubtypeLabel(lesson);
    if (subtype) badges.push({ kind: 'subtype', label: subtype });
    const level = savedLessonLevelLabel(lesson);
    if (level) badges.push({ kind: 'level', label: level });
    return badges;
  }
  const badges: SavedLessonBadge[] = [...taskBadge];
  if (lesson.mode === 'reading' || lesson.mode === 'listening') {
    badges.push({ kind: 'mode', label: lessonModeLabel(lesson.mode) });
  }
  if (lesson.format === 'text') badges.push({ kind: 'format', label: 'Text' });
  else if (lesson.format === 'dialogue') badges.push({ kind: 'format', label: 'Dialogue' });
  const level = savedLessonLevelLabel(lesson);
  if (level) badges.push({ kind: 'level', label: level });
  return badges;
}

/** Prefer the label stored with the lesson. Otherwise the raw level value. */
export function savedLessonLevelLabel(lesson: Record<string, unknown>): string {
  const label = typeof lesson.levelLabel === 'string' ? lesson.levelLabel.trim() : '';
  const level = typeof lesson.level === 'string' ? lesson.level.trim() : '';
  const raw = label || level;
  if (!raw) return '';
  return savedLevelLabel(raw);
}

function grammarSubtypeLabel(lesson: Record<string, unknown>): string {
  if (lesson.exercise === 'phrasal') return 'Phrasal';
  if (lesson.exercise === 'blanks') return 'Blanks';
  if (lesson.exercise === 'order') return 'Order';
  return grammarSubtype({
    mode: 'grammar',
    title: typeof lesson.title === 'string' ? lesson.title : '',
    topic: typeof lesson.topic === 'string' ? lesson.topic : '',
  }) ?? '';
}

/** Show the newest reading/listening rows and the newest grammar rows together, each capped. */
export function mergeSavedLessons<T extends { created_at: string }>(
  practice: T[],
  grammar: T[],
  limit = SAVED_LESSON_LIMIT,
): T[] {
  const newest = (rows: T[]) => [...rows]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, limit);
  return [...newest(practice), ...newest(grammar)].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
}

export type SavedGrammarLesson = {
  level: GrammarLevel;
  exercise: GrammarExerciseType;
  topic: string;
  title: string;
  items: GrammarItem[];
  grades: ItemGrade[] | null;
};

export type GrammarLaunch = SavedGrammarLesson & {
  id: string;
  token: number;
  task?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function parseChoice(raw: Record<string, unknown>): GrammarItem | null {
  if (raw.kind !== 'choice') return null;
  const prompt = asText(raw.prompt);
  const explanation = asText(raw.explanation);
  const correctAnswer = asText(raw.correctAnswer);
  const options = Array.isArray(raw.options) ? raw.options.map(asText).filter(Boolean) : [];
  if (!prompt || !explanation || options.length !== 4) return null;
  if (new Set(options.map((option) => option.toLowerCase())).size !== 4) return null;
  if (!options.includes(correctAnswer)) return null;
  return { kind: 'choice', prompt, options, correctAnswer, explanation };
}

function parseOrder(raw: Record<string, unknown>): GrammarItem | null {
  if (raw.kind !== 'order') return null;
  const prompt = asText(raw.prompt) || 'Put these parts in order.';
  const explanation = asText(raw.explanation);
  const chunks = Array.isArray(raw.chunks) ? raw.chunks.map(asText).filter(Boolean) : [];
  if (!explanation || chunks.length < 4 || chunks.length > 6) return null;
  if (new Set(chunks.map((chunk) => chunk.toLowerCase())).size !== chunks.length) return null;
  return { kind: 'order', prompt, chunks, explanation };
}

function parseGrades(value: unknown, count: number): ItemGrade[] | null {
  if (!Array.isArray(value) || value.length !== count) return null;
  const grades: ItemGrade[] = [];
  for (const entry of value) {
    const raw = asRecord(entry);
    if (!raw || typeof raw.correct !== 'boolean') return null;
    const prompt = asText(raw.prompt);
    const userAnswer = asText(raw.userAnswer);
    const correctAnswer = asText(raw.correctAnswer);
    const explanation = asText(raw.explanation);
    if (!prompt || !userAnswer || !correctAnswer || !explanation) return null;
    grades.push({ prompt, correct: raw.correct, userAnswer, correctAnswer, explanation });
  }
  return grades;
}

/** The jsonb stored for one grammar set. Grades are added after the learner checks answers. */
export function grammarLessonRecord(input: {
  level: GrammarLevel;
  exercise: GrammarExerciseType;
  topic: string;
  title: string;
  items: GrammarItem[];
  grades?: ItemGrade[] | null;
  task?: boolean;
}): Record<string, unknown> {
  const title = input.title.trim() || grammarTitle(input.exercise);
  const items = input.items.map((item) => (
    item.kind === 'choice'
      ? {
        kind: 'choice' as const,
        prompt: item.prompt,
        options: item.options,
        correctAnswer: item.correctAnswer,
        explanation: item.explanation,
      }
      : {
        kind: 'order' as const,
        prompt: item.prompt,
        chunks: item.chunks,
        explanation: item.explanation,
      }
  ));
  const lesson: Record<string, unknown> = {
    mode: 'grammar',
    level: input.level,
    levelLabel: input.level,
    exercise: input.exercise,
    topic: input.topic.trim(),
    title,
    items,
  };
  if (input.grades && input.grades.length === items.length) lesson.grades = input.grades;
  if (input.task) lesson.task = true;
  return lesson;
}

/** Null when the saved blob is not a grammar set we can open again. */
export function parseSavedGrammarLesson(lesson: Record<string, unknown>): SavedGrammarLesson | null {
  if (lesson.mode !== 'grammar') return null;
  const level: GrammarLevel | null = lesson.level === 'B1' || lesson.level === 'B2' || lesson.level === 'C1'
    ? lesson.level
    : null;
  const exercise: GrammarExerciseType | null = lesson.exercise === 'phrasal' || lesson.exercise === 'blanks' || lesson.exercise === 'order'
    ? lesson.exercise
    : null;
  if (!level || !exercise || !Array.isArray(lesson.items) || lesson.items.length === 0 || lesson.items.length > 12) return null;
  const items: GrammarItem[] = [];
  for (const entry of lesson.items) {
    const raw = asRecord(entry);
    if (!raw) return null;
    const item = exercise === 'order' ? parseOrder(raw) : parseChoice(raw);
    if (!item) return null;
    items.push(item);
  }
  const title = asText(lesson.title) || grammarTitle(exercise);
  return {
    level,
    exercise,
    topic: asText(lesson.topic),
    title,
    items,
    grades: parseGrades(lesson.grades, items.length),
  };
}
