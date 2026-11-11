import { LEVELS, QUESTION_COUNTS, TOPICS, WILDCARD_TOPIC, WORD_COUNTS } from './constants.ts';

/** Newest task packs kept per person. Older packs are deleted by a database trigger. */
export const TASK_PACK_LIMIT = 5;

export const TASK_PERIOD_ZONE = 'Europe/Madrid';

export type TaskFrequency = 'daily' | 'weekly';
export type TaskLevel = 'beginner' | 'intermediate' | 'advanced';
export type TaskFormat = 'text' | 'dialogue';
export type TaskGrammarLevel = 'B1' | 'B2' | 'C1';
export type TaskGrammarExercise = 'blanks' | 'phrasal' | 'order';

export type TaskSettings = {
  enabled: boolean;
  emailReminders: boolean;
  frequency: TaskFrequency;
  level: TaskLevel;
  topic: string;
  wordCount: number;
  questionCount: number;
  readingFormat: TaskFormat;
  listeningFormat: TaskFormat;
  grammarLevel: TaskGrammarLevel;
  grammarExercise: TaskGrammarExercise;
  grammarTopic: string;
};

export const DEFAULT_TASK_SETTINGS: TaskSettings = {
  enabled: false,
  emailReminders: true,
  frequency: 'daily',
  level: 'beginner',
  topic: 'daily life',
  wordCount: 100,
  questionCount: 5,
  readingFormat: 'text',
  listeningFormat: 'text',
  grammarLevel: 'B1',
  grammarExercise: 'blanks',
  grammarTopic: '',
};

export type TaskStep =
  | 'reading-story'
  | 'reading-quiz'
  | 'listening-story'
  | 'listening-quiz'
  | 'grammar'
  | 'done';

export type TaskBlockReason = 'free_limit' | 'pilot_expired' | 'missing';

export type PracticePiece = {
  story: string;
  quiz: unknown[];
  vocabulary: unknown[];
  dialogue: unknown[];
  format: TaskFormat;
  level: string;
  levelLabel: string;
  topic: string;
  title: string;
  speakers: { name: string; gender: 'female' | 'male' }[];
  wordCount: number;
  questionCount: number;
};

export type GrammarPiece = {
  level: TaskGrammarLevel;
  exercise: TaskGrammarExercise;
  topic: string;
  title: string;
  items: unknown[];
};

const LEVEL_VALUES = new Set<TaskLevel>(['beginner', 'intermediate', 'advanced']);
const FORMATS = new Set<TaskFormat>(['text', 'dialogue']);
const GRAMMAR_LEVELS = new Set<TaskGrammarLevel>(['B1', 'B2', 'C1']);
const GRAMMAR_EXERCISES = new Set<TaskGrammarExercise>(['blanks', 'phrasal', 'order']);
const WORD_VALUES = new Set(WORD_COUNTS.map((item) => item.value));
const QUESTION_VALUES = new Set(QUESTION_COUNTS.map((item) => item.value));
const TOPIC_VALUES = new Set(TOPICS.map((item) => item.value));

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function taskLevelLabel(level: string): string {
  return LEVELS.find((item) => item.value === level)?.label ?? level;
}

export function normalizeTaskSettings(input: unknown): TaskSettings | null {
  const raw = asRecord(input);
  if (!raw) return null;
  const frequency: TaskFrequency | null = raw.frequency === 'weekly' ? 'weekly' : raw.frequency === 'daily' ? 'daily' : null;
  const level = LEVEL_VALUES.has(raw.level as TaskLevel) ? raw.level as TaskLevel : null;
  const readingFormat = FORMATS.has(raw.readingFormat as TaskFormat) ? raw.readingFormat as TaskFormat : null;
  const listeningFormat = FORMATS.has(raw.listeningFormat as TaskFormat) ? raw.listeningFormat as TaskFormat : null;
  const grammarLevel = GRAMMAR_LEVELS.has(raw.grammarLevel as TaskGrammarLevel) ? raw.grammarLevel as TaskGrammarLevel : null;
  const grammarExercise = GRAMMAR_EXERCISES.has(raw.grammarExercise as TaskGrammarExercise) ? raw.grammarExercise as TaskGrammarExercise : null;
  const wordCount = Number(raw.wordCount);
  const questionCount = Number(raw.questionCount);
  const topic = typeof raw.topic === 'string' ? raw.topic.trim() : '';
  if (!frequency || !level || !readingFormat || !listeningFormat || !grammarLevel || !grammarExercise) return null;
  if (!WORD_VALUES.has(wordCount) || !QUESTION_VALUES.has(questionCount)) return null;
  if (!TOPIC_VALUES.has(topic)) return null;
  const grammarTopic = typeof raw.grammarTopic === 'string' ? raw.grammarTopic.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return {
    enabled: raw.enabled === true,
    emailReminders: raw.emailReminders !== false,
    frequency,
    level,
    topic,
    wordCount,
    questionCount,
    readingFormat,
    listeningFormat,
    grammarLevel,
    grammarExercise,
    grammarTopic,
  };
}

export function settingsFromRow(row: Record<string, unknown> | null): TaskSettings {
  if (!row) return { ...DEFAULT_TASK_SETTINGS };
  return normalizeTaskSettings({
    enabled: row.enabled,
    emailReminders: row.email_reminders,
    frequency: row.frequency,
    level: row.level,
    topic: row.topic,
    wordCount: row.word_count,
    questionCount: row.question_count,
    readingFormat: row.reading_format,
    listeningFormat: row.listening_format,
    grammarLevel: row.grammar_level,
    grammarExercise: row.grammar_exercise,
    grammarTopic: row.grammar_topic,
  }) ?? { ...DEFAULT_TASK_SETTINGS };
}

export function settingsToRow(userId: string, settings: TaskSettings): Record<string, unknown> {
  return {
    user_id: userId,
    enabled: settings.enabled,
    email_reminders: settings.emailReminders,
    frequency: settings.frequency,
    level: settings.level,
    topic: settings.topic,
    word_count: settings.wordCount,
    question_count: settings.questionCount,
    reading_format: settings.readingFormat,
    listening_format: settings.listeningFormat,
    grammar_level: settings.grammarLevel,
    grammar_exercise: settings.grammarExercise,
    grammar_topic: settings.grammarTopic,
  };
}

export function madridDateParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TASK_PERIOD_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day') };
}

/** ISO week for a calendar date. Week 1 is the week of the first Thursday. */
export function isoWeek(year: number, month: number, day: number): { weekYear: number; week: number } {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { weekYear, week };
}

/** Daily key is the Madrid date. Weekly key is the Madrid ISO week, starting Monday. */
export function periodKey(frequency: TaskFrequency, now = new Date()): string {
  const { year, month, day } = madridDateParts(now);
  if (frequency === 'weekly') {
    const week = isoWeek(year, month, day);
    return `${week.weekYear}-W${String(week.week).padStart(2, '0')}`;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function periodLabel(frequency: TaskFrequency, key: string): string {
  if (frequency === 'weekly') return `Week ${key.replace('-W', ' week ')}`;
  const [year, month, day] = key.split('-').map((part) => Number(part));
  if (!year || !month || !day) return key;
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/**
 * A task pack is one learning session.
 * Unlimited plans (premium, tester, active academy, active pilot) are not counted.
 * A free account spends one of the 3 free lessons for the whole pack, not one per exercise.
 * The normal Reading, Listening, and Grammar buttons still spend one lesson each.
 */
export function taskGenerationDecision(block: string): {
  generate: boolean;
  consumeLessons: 0 | 1;
  reason: 'ok' | TaskBlockReason;
} {
  if (block === 'ok_unlimited') return { generate: true, consumeLessons: 0, reason: 'ok' };
  if (block === 'ok_free') return { generate: true, consumeLessons: 1, reason: 'ok' };
  if (block === 'pilot_expired') return { generate: false, consumeLessons: 0, reason: 'pilot_expired' };
  if (block === 'missing') return { generate: false, consumeLessons: 0, reason: 'missing' };
  return { generate: false, consumeLessons: 0, reason: 'free_limit' };
}

export function isPracticePiece(value: unknown): value is PracticePiece {
  const raw = asRecord(value);
  if (!raw || typeof raw.story !== 'string' || raw.story.trim().length < 20) return false;
  if (raw.format !== 'text' && raw.format !== 'dialogue') return false;
  return true;
}

export function practiceHasQuiz(value: unknown): boolean {
  const raw = asRecord(value);
  return Array.isArray(raw?.quiz) && raw.quiz.length > 0;
}

export function isGrammarPiece(value: unknown): value is GrammarPiece {
  const raw = asRecord(value);
  if (!raw || !Array.isArray(raw.items) || raw.items.length === 0) return false;
  return GRAMMAR_LEVELS.has(raw.level as TaskGrammarLevel) && GRAMMAR_EXERCISES.has(raw.exercise as TaskGrammarExercise);
}

export function nextTaskStep(pack: { reading: unknown; listening: unknown; grammar: unknown }): TaskStep {
  if (!isPracticePiece(pack.reading)) return 'reading-story';
  if (!practiceHasQuiz(pack.reading)) return 'reading-quiz';
  if (!isPracticePiece(pack.listening)) return 'listening-story';
  if (!practiceHasQuiz(pack.listening)) return 'listening-quiz';
  if (!isGrammarPiece(pack.grammar)) return 'grammar';
  return 'done';
}

export function taskStepLabel(step: TaskStep): string {
  if (step === 'reading-story') return 'Preparing your reading...';
  if (step === 'reading-quiz') return 'Preparing the reading questions...';
  if (step === 'listening-story') return 'Preparing your listening...';
  if (step === 'listening-quiz') return 'Preparing the listening questions...';
  if (step === 'grammar') return 'Preparing your grammar...';
  return 'Your tasks are ready.';
}

export function taskBlockMessage(reason: TaskBlockReason): string {
  if (reason === 'pilot_expired') {
    return 'This academy pilot has ended. Saved lessons and progress are still available. New tasks are paused.';
  }
  if (reason === 'missing') return 'Tasks are not available for this account yet.';
  return 'You have used your 3 free lessons. Premium is 3 € per month. These 3 lessons do not expire.';
}

export type TaskEmailInput = {
  baseUrl: string;
  token: string;
  frequency: TaskFrequency;
  periodKey: string;
};

/** HTML and plain text for the pack reminder. The link turns tasks and reminders off. */
export function taskReminderMessage(input: TaskEmailInput): { subject: string; html: string; text: string } {
  const base = input.baseUrl.replace(/\/+$/, '');
  const openUrl = `${base}/tasks`;
  const offUrl = `${base}/api/tasks-unsubscribe?token=${encodeURIComponent(input.token)}`;
  const when = input.frequency === 'weekly' ? 'this week' : 'today';
  const subject = 'Your English tasks are ready';
  const text = [
    `Your English tasks for ${when} are ready.`,
    'The pack has one reading exercise, one listening exercise, and one grammar exercise.',
    `Open them: ${openUrl}`,
    `Turn tasks off and stop these emails: ${offUrl}`,
  ].join('\n\n');
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:24px;background:#f1f5f9;color:#0f172a;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;padding:24px;">
    <p style="margin:0;font-size:20px;font-weight:700;">Daily English Test</p>
    <h1 style="margin:16px 0 8px;font-size:24px;">Your tasks are ready</h1>
    <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">Your pack for ${when} is waiting. It has one reading exercise, one listening exercise, and one grammar exercise.</p>
    <p style="margin:20px 0;"><a href="${openUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;">Open tasks</a></p>
    <p style="margin:0;font-size:14px;line-height:1.5;color:#334155;">If you do not want these emails, <a href="${offUrl}">turn tasks off</a>. You can turn them on again from the Tasks page after you sign in.</p>
  </div>
</body>
</html>`;
  return { subject, html, text };
}

export function topicChoices() {
  return TOPICS.map((topic) => ({ value: topic.value, label: topic.label }));
}

export function unsubscribeResultHtml(state: 'ok' | 'invalid' | 'unavailable'): string {
  const title = state === 'ok' ? 'Tasks are off' : state === 'unavailable' ? 'Try again later' : 'This link is not valid';
  const body = state === 'ok'
    ? 'Tasks are turned off, and reminder emails will stop. You can turn them on again from the Tasks page after you sign in.'
    : state === 'unavailable'
      ? 'Tasks could not be changed just now. Open the link again in a few minutes.'
      : 'This link is not valid. Open Tasks after you sign in and turn them off there.';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:24px;background:#f1f5f9;color:#0f172a;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;padding:24px;">
    <p style="margin:0;font-size:20px;font-weight:700;">Daily English Test</p>
    <h1 style="margin:16px 0 8px;font-size:24px;">${title}</h1>
    <p style="margin:0;font-size:16px;line-height:1.5;">${body}</p>
    <p style="margin:20px 0 0;"><a href="/tasks">Go to Tasks</a></p>
  </div>
</body>
</html>`;
}

export { WILDCARD_TOPIC };
