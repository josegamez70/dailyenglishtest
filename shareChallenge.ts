import { profileHandle } from './profileHandle.ts';

export type ShareMode = 'reading' | 'listening' | 'grammar' | 'vocabulary';

export type ShareCard = {
  v: 1;
  mode: ShareMode;
  title: string;
  handle: string;
  percent: number | null;
  senderCorrect: number | null;
  senderTotal: number | null;
  senderSeconds: number | null;
  lesson: Record<string, unknown>;
};

const MODES = new Set<ShareMode>(['reading', 'listening', 'grammar', 'vocabulary']);
const MAX_LINK = 12000;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function percentOf(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isInteger(number) || number < 0 || number > 100) return null;
  return number;
}

function quizOf(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return null;
  const quiz: Record<string, unknown>[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Record<string, unknown>;
    const question = text(item.question, 400);
    const options = Array.isArray(item.options)
      ? item.options.filter((option): option is string => typeof option === 'string').slice(0, 6).map((option) => option.slice(0, 240))
      : [];
    const correctAnswer = text(item.correctAnswer, 240);
    if (!question || options.length < 2 || !options.includes(correctAnswer)) return null;
    quiz.push({ question, options, correctAnswer, explanation: text(item.explanation, 400) });
  }
  return quiz;
}

function dialogueOf(value: unknown): { speaker: string; line: string }[] {
  if (!Array.isArray(value)) return [];
  const turns: { speaker: string; line: string }[] = [];
  for (const entry of value.slice(0, 40)) {
    if (!entry || typeof entry !== 'object') continue;
    const turn = entry as Record<string, unknown>;
    const speaker = text(turn.speaker, 40);
    const line = text(turn.line, 400);
    if (speaker && line) turns.push({ speaker, line });
  }
  return turns;
}

function grammarItems(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) return null;
  const items: Record<string, unknown>[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Record<string, unknown>;
    const prompt = text(item.prompt, 400);
    const explanation = text(item.explanation, 400);
    if (!prompt || !explanation) return null;
    if (item.kind === 'order') {
      const chunks = Array.isArray(item.chunks)
        ? item.chunks.map((chunk) => typeof chunk === 'string' ? chunk : text((chunk as { text?: unknown })?.text, 120)).filter(Boolean).slice(0, 12)
        : [];
      if (chunks.length < 2) return null;
      items.push({ kind: 'order', prompt, chunks, explanation });
      continue;
    }
    const options = Array.isArray(item.options)
      ? item.options.filter((option): option is string => typeof option === 'string').slice(0, 6).map((option) => option.slice(0, 160))
      : [];
    const correctAnswer = text(item.correctAnswer, 160);
    if (options.length < 2 || !options.includes(correctAnswer)) return null;
    items.push({ kind: 'choice', prompt, options, correctAnswer, explanation });
  }
  return items;
}

function vocabQuestions(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) return null;
  const questions: Record<string, unknown>[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Record<string, unknown>;
    const prompt = text(item.prompt, 300);
    const choices = Array.isArray(item.choices)
      ? item.choices.filter((choice): choice is string => typeof choice === 'string').slice(0, 6).map((choice) => choice.slice(0, 200))
      : [];
    const answer = text(item.answer, 200);
    if (!prompt || choices.length < 2 || !choices.includes(answer)) return null;
    questions.push({
      term: text(item.term, 80),
      prompt,
      choices,
      answer,
      explanation: text(item.explanation, 300),
    });
  }
  return questions;
}

/** Keep only the exercise a recipient needs. Drop answers the sender chose, grades, and any address. */
export function publicLesson(mode: ShareMode, lesson: Record<string, unknown>): Record<string, unknown> | null {
  if (mode === 'grammar') {
    const items = grammarItems(lesson.items);
    if (!items) return null;
    const exercise = lesson.exercise === 'phrasal' || lesson.exercise === 'blanks' || lesson.exercise === 'order' ? lesson.exercise : 'blanks';
    return {
      mode: 'grammar',
      title: text(lesson.title, 80) || 'Grammar',
      level: text(lesson.level, 8),
      exercise,
      topic: text(lesson.topic, 80),
      items,
    };
  }
  if (mode === 'vocabulary') {
    const questions = vocabQuestions(lesson.questions);
    if (!questions) return null;
    return { mode: 'vocabulary', title: text(lesson.title, 80) || 'Vocabulary', questions };
  }
  const quiz = quizOf(lesson.quiz);
  const story = text(lesson.story, 5000);
  const dialogue = dialogueOf(lesson.dialogue);
  if (!quiz || (!story && dialogue.length === 0)) return null;
  const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : '';
  const savedLessonId = uuid(lesson.savedLessonId);
  const bankId = uuid(lesson.bankId);
  return {
    mode,
    title: text(lesson.title, 80) || (mode === 'listening' ? 'Listening' : 'Reading'),
    level: text(lesson.level, 40),
    format: lesson.format === 'dialogue' ? 'dialogue' : 'text',
    story,
    dialogue,
    quiz,
    ...(mode === 'listening' && savedLessonId ? { savedLessonId } : {}),
    ...(mode === 'listening' && bankId ? { bankId } : {}),
  };
}

export function challengeLine(percent: number | null, handle: string): string {
  const who = handle || '';
  if (percent == null) return who ? `Can you try this exercise? — ${who}` : 'Can you try this exercise?';
  return who ? `I scored ${percent}% — can you beat it? — ${who}` : `I scored ${percent}% — can you beat it?`;
}

function whole(value: unknown, max: number): number | null {
  const number = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isInteger(number) || number < 0 || number > max) return null;
  return number;
}

export function formatShareTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** The line shown before the recipient starts. Omits a result the sender does not have. */
export function senderResultLine(input: {
  handle: string;
  correct: number | null;
  total: number | null;
  seconds: number | null;
}): string {
  const who = input.handle || '';
  const known = input.correct != null && input.total != null && input.total > 0 && input.correct <= input.total;
  if (!known) return who ? `Can you try this exercise? — ${who}` : 'Can you try this exercise?';
  const time = input.seconds != null ? ` in ${formatShareTime(input.seconds)}` : '';
  const actor = who || 'The sender';
  return `${actor} got ${input.correct}/${input.total}${time} — can you beat it?`;
}

/** Correct answers and time, side by side, after the recipient finishes. */
export function resultComparison(input: {
  handle: string;
  yoursCorrect: number;
  yoursTotal: number;
  yoursSeconds: number;
  senderCorrect: number | null;
  senderTotal: number | null;
  senderSeconds: number | null;
}): string {
  const you = `You got ${input.yoursCorrect}/${input.yoursTotal} in ${formatShareTime(input.yoursSeconds)}.`;
  const known = input.senderCorrect != null && input.senderTotal != null && input.senderTotal > 0;
  if (!known) return you;
  const who = input.handle || 'The sender';
  const time = input.senderSeconds != null ? ` in ${formatShareTime(input.senderSeconds)}` : '';
  return `${you} ${who} got ${input.senderCorrect}/${input.senderTotal}${time}.`;
}

export function encodeShare(card: ShareCard): string {
  const bytes = new TextEncoder().encode(JSON.stringify(card));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeShare(token: string): ShareCard | null {
  if (!token || token.length > MAX_LINK) return null;
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (token.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    if (parsed.v !== 1 || typeof parsed.mode !== 'string' || !MODES.has(parsed.mode as ShareMode)) return null;
    const mode = parsed.mode as ShareMode;
    const lesson = parsed.lesson && typeof parsed.lesson === 'object' ? publicLesson(mode, parsed.lesson as Record<string, unknown>) : null;
    if (!lesson) return null;
    const handle = profileHandle(typeof parsed.handle === 'string' ? parsed.handle.replace(/^@/, '') : '');
    const senderCorrect = whole(parsed.senderCorrect, 1000);
    const senderTotal = whole(parsed.senderTotal, 1000);
    return {
      v: 1,
      mode,
      title: text(parsed.title, 80) || text(lesson.title, 80),
      handle,
      percent: percentOf(parsed.percent),
      senderCorrect: senderCorrect != null && senderTotal != null && senderCorrect <= senderTotal ? senderCorrect : null,
      senderTotal: senderCorrect != null && senderTotal != null && senderCorrect <= senderTotal ? senderTotal : null,
      senderSeconds: whole(parsed.senderSeconds, 86400),
      lesson,
    };
  } catch {
    return null;
  }
}

const SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function shareIdFromPath(path: string): string {
  const match = path.replace(/\/+$/, '').match(/^\/s\/([0-9a-f-]{36})$/i);
  return match && SHARE_ID.test(match[1]) ? match[1] : '';
}

/** A link another person can open. Null when the exercise cannot fit in a link. */
export function buildShareLink(origin: string, input: {
  mode: ShareMode;
  title: string;
  handle: string;
  percent: number | null;
  senderCorrect?: number | null;
  senderTotal?: number | null;
  senderSeconds?: number | null;
  lesson: Record<string, unknown>;
}): { line: string; url: string } | null {
  const lesson = publicLesson(input.mode, input.lesson);
  if (!lesson) return null;
  const handle = profileHandle(input.handle);
  const percent = percentOf(input.percent);
  const senderCorrect = whole(input.senderCorrect, 1000);
  const senderTotal = whole(input.senderTotal, 1000);
  const known = senderCorrect != null && senderTotal != null && senderTotal > 0 && senderCorrect <= senderTotal;
  const card: ShareCard = {
    v: 1,
    mode: input.mode,
    title: text(input.title, 80) || text(lesson.title, 80),
    handle,
    percent,
    senderCorrect: known ? senderCorrect : null,
    senderTotal: known ? senderTotal : null,
    senderSeconds: known ? whole(input.senderSeconds, 86400) : null,
    lesson,
  };
  const token = encodeShare(card);
  if (token.length > MAX_LINK) return null;
  const base = origin.replace(/\/+$/, '');
  const line = known
    ? senderResultLine({ handle, correct: card.senderCorrect, total: card.senderTotal, seconds: card.senderSeconds })
    : challengeLine(percent, handle);
  return { line, url: `${base}/share#${token}` };
}

/** Correct answers already stored on a saved lesson. A finished listening stores shareResult, including the time. */
export function savedSenderResult(lesson: Record<string, unknown>): { correct: number; total: number; seconds: number | null } | null {
  const stored = lesson.shareResult;
  if (stored && typeof stored === 'object') {
    const record = stored as Record<string, unknown>;
    const correct = whole(record.correct, 1000);
    const total = whole(record.total, 1000);
    if (correct != null && total != null && total > 0 && correct <= total) {
      return { correct, total, seconds: whole(record.seconds, 86400) };
    }
  }
  if (!Array.isArray(lesson.grades) || lesson.grades.length === 0) return null;
  let correct = 0;
  for (const entry of lesson.grades) {
    if (entry && typeof entry === 'object' && (entry as { correct?: unknown }).correct === true) correct += 1;
  }
  return { correct, total: lesson.grades.length, seconds: null };
}

/** Percent from a saved grammar set, when the learner already checked it. */
export function savedChallengePercent(lesson: Record<string, unknown>): number | null {
  if (!Array.isArray(lesson.grades) || lesson.grades.length === 0) return null;
  let correct = 0;
  for (const entry of lesson.grades) {
    if (entry && typeof entry === 'object' && (entry as { correct?: unknown }).correct === true) correct += 1;
  }
  return Math.round((correct / lesson.grades.length) * 100);
}
