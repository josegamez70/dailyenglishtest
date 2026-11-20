import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { bankChallengeIndex, bankUnavailable, grammarSetFromBankPayload, listeningLessonFromBankPayload, readingLessonFromBankPayload } from '../exerciseBank.ts';
import { respeakStaleDialogue, signListeningAudio } from '../exerciseBankServer.ts';
import {
  buildChallengeReport,
  challengeLevel,
  challengeWhy,
  elapsedSeconds,
  firstChallengeItems,
  gradeGrammarItems,
  gradeQuestions,
  listeningLevelForChallenge,
  readingChallengeSlice,
  todayMadrid,
  type ChallengeLevel,
  type ChallengeReportItem,
} from '../dailyChallenge.ts';
import type { GrammarExerciseType, GrammarLevel } from '../grammarSet.ts';
import { readEnvValue, runtimeEnv } from '../taskMail.ts';

type BankRow = {
  id: string;
  level: string;
  exercise_type: string;
  payload: unknown;
  dimensions: unknown;
  content_hash: string;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function bearer(req: Request): string | null {
  const match = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? null;
}

async function pool(admin: SupabaseClient, kind: 'reading' | 'listening' | 'grammar', level: string): Promise<BankRow[] | null> {
  const listed = await admin
    .from('exercise_bank')
    .select('id, level, exercise_type, payload, dimensions, content_hash')
    .eq('kind', kind)
    .eq('active', true)
    .eq('level', level)
    .order('content_hash', { ascending: true })
    .limit(1000);
  if (listed.error) return null;
  return (listed.data ?? []) as BankRow[];
}

function readingWordCount(row: BankRow): number {
  const dims = row.dimensions && typeof row.dimensions === 'object' ? row.dimensions as { wordCount?: unknown } : {};
  const payload = row.payload && typeof row.payload === 'object' ? row.payload as { wordCount?: unknown } : {};
  const words = Number(dims.wordCount ?? payload.wordCount ?? 0);
  return Number.isFinite(words) ? words : 0;
}

function readingOf(row: BankRow) {
  const dims = row.dimensions && typeof row.dimensions === 'object' ? row.dimensions as { topic?: unknown } : {};
  const lesson = readingLessonFromBankPayload(row.payload, String(dims.topic ?? ''));
  if (!lesson) return null;
  const quiz = lesson.quiz.map((item) => ({
    question: item.question,
    options: item.options,
    correctAnswer: item.correctAnswer,
    explanation: item.explanation,
    supportingSentence: item.supportingSentence,
    why: challengeWhy(item),
  }));
  const slice = readingChallengeSlice(lesson.story, quiz);
  if (!slice) return null;
  return { title: lesson.title, topic: lesson.topicLabel, story: slice.story, quiz: slice.quiz };
}

function listeningParsed(row: BankRow) {
  const dims = row.dimensions && typeof row.dimensions === 'object' ? row.dimensions as { wordCount?: unknown; questionCount?: unknown } : {};
  const body = row.payload && typeof row.payload === 'object' ? row.payload as { level?: unknown; format?: unknown } : {};
  const lesson = listeningLessonFromBankPayload(row.payload, row.dimensions, {
    level: String(body.level ?? row.level),
    format: String(body.format ?? ''),
    topic: null,
    wordCount: Number(dims.wordCount),
    questionCount: Number(dims.questionCount),
  });
  if (!lesson) return null;
  return {
    title: lesson.title,
    topic: lesson.topicLabel,
    audioPath: String((row.dimensions as { audioPath?: unknown } | null)?.audioPath ?? ''),
    quiz: lesson.quiz.map((item) => ({
      question: item.question,
      options: item.options,
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
      supportingSentence: item.supportingSentence,
      why: challengeWhy(item),
    })),
  };
}

function listeningSlice(row: BankRow) {
  const full = listeningParsed(row);
  if (!full) return null;
  const quiz = firstChallengeItems(full.quiz);
  if (!quiz) return null;
  return { ...full, quiz };
}

function grammarOf(row: BankRow) {
  const set = grammarSetFromBankPayload(row.payload, {
    level: row.level as GrammarLevel,
    exercise: row.exercise_type as GrammarExerciseType,
    topic: '',
  });
  if (!set) return null;
  const items = firstChallengeItems(set.items);
  if (!items) return null;
  return {
    title: set.title,
    exercise: set.exercise,
    items: items.map((item) => (
      item.kind === 'choice'
        ? { ...item, options: [...item.options].sort((left, right) => left.localeCompare(right)) }
        : item
    )),
  };
}

async function piecesFor(admin: SupabaseClient, day: string, level: ChallengeLevel) {
  const [readingRows, listeningRows, grammarRows] = await Promise.all([
    pool(admin, 'reading', level),
    pool(admin, 'listening', listeningLevelForChallenge(level)),
    pool(admin, 'grammar', level),
  ]);
  if (!readingRows || !listeningRows || !grammarRows) return null;
  // Short practice texts stay out of this pool. The index is then the same as it was
  // when every reading row was a long piece, so today and tomorrow do not move.
  const longReadings = readingRows.filter((row) => readingWordCount(row) >= 200);
  const reading = takeFirst(longReadings, bankChallengeIndex(day, level, 'reading', longReadings.length), readingOf);
  const listeningIndex = bankChallengeIndex(day, level, 'listening', listeningRows.length);
  const listeningRow = matchingBankRow(listeningRows, listeningIndex, listeningSlice);
  if (listeningRow) await respeakStaleDialogue(admin, listeningRow);
  const listening = listeningRow ? listeningSlice(listeningRow) : null;
  const grammar = takeFirst(grammarRows, bankChallengeIndex(day, level, 'grammar', grammarRows.length), grammarOf);
  return { reading, listening, grammar };
}

function matchingBankRow(rows: BankRow[], start: number, parse: (row: BankRow) => unknown): BankRow | null {
  if (!rows.length) return null;
  for (let step = 0; step < rows.length; step += 1) {
    const row = rows[(start + step) % rows.length];
    if (parse(row)) return row;
  }
  return null;
}

function takeFirst<T>(rows: BankRow[], start: number, parse: (row: BankRow) => T | null): T | null {
  if (!rows.length) return null;
  for (let step = 0; step < rows.length; step += 1) {
    const parsed = parse(rows[(start + step) % rows.length]);
    if (parsed) return parsed;
  }
  return null;
}

type AttemptRow = {
  level: string;
  started_at: string;
  submitted_at: string | null;
  correct: number | null;
  total: number | null;
  reading_correct: number | null;
  listening_correct: number | null;
  grammar_correct: number | null;
  reading_total: number | null;
  listening_total: number | null;
  grammar_total: number | null;
  answers?: unknown;
};

const ATTEMPT_COLUMNS = 'level, started_at, submitted_at, correct, total, reading_correct, listening_correct, grammar_correct, reading_total, listening_total, grammar_total';

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return bankUnavailable(error);
}

function missingAnswersColumn(error: { code?: string; message?: string } | null): boolean {
  const message = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return message.includes('42703') || (message.includes('answers') && (message.includes('does not exist') || message.includes('schema cache') || message.includes('pgrst204')));
}

function storedReport(value: unknown): ChallengeReportItem[] | null {
  const record = value && typeof value === 'object' ? value as { report?: unknown } : null;
  if (!record || !Array.isArray(record.report)) return null;
  const rows = record.report.flatMap((item) => {
    const row = item && typeof item === 'object' ? item as ChallengeReportItem : null;
    if (!row || (row.part !== 'reading' && row.part !== 'listening' && row.part !== 'grammar')) return [];
    return [{
      part: row.part,
      question: String(row.question ?? ''),
      userAnswer: String(row.userAnswer ?? '—'),
      correctAnswer: String(row.correctAnswer ?? ''),
      correct: row.correct === true,
      why: String(row.why ?? ''),
    }];
  });
  return rows.length ? rows : null;
}

async function readAttempt(admin: SupabaseClient, userId: string, day: string): Promise<{
  attempt: AttemptRow | null;
  tableMissing: boolean;
  answersMissing: boolean;
}> {
  const withAnswers = await admin
    .from('daily_challenge_attempts')
    .select(`${ATTEMPT_COLUMNS}, answers`)
    .eq('user_id', userId)
    .eq('madrid_day', day)
    .maybeSingle();
  if (!withAnswers.error) {
    return { attempt: (withAnswers.data ?? null) as AttemptRow | null, tableMissing: false, answersMissing: false };
  }
  if (!missingAnswersColumn(withAnswers.error)) {
    return { attempt: null, tableMissing: missingTable(withAnswers.error), answersMissing: false };
  }
  const plain = await admin
    .from('daily_challenge_attempts')
    .select(ATTEMPT_COLUMNS)
    .eq('user_id', userId)
    .eq('madrid_day', day)
    .maybeSingle();
  return {
    attempt: (plain.data ?? null) as AttemptRow | null,
    tableMissing: Boolean(plain.error && missingTable(plain.error)),
    answersMissing: true,
  };
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') return json(200, { ok: true });
  if (req.method !== 'POST') return json(405, { ok: false, message: 'Method not allowed' });
  const token = bearer(req);
  if (!token) return json(401, { ok: false, message: 'Sign in to open the daily challenge.' });
  const env = runtimeEnv();
  const url = readEnvValue(env, 'SUPABASE_URL') || readEnvValue(env, 'VITE_SUPABASE_URL');
  const key = readEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json(500, { ok: false, message: 'The challenge is not available yet.' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const userResult = await admin.auth.getUser(token);
  const userId = userResult.data.user?.id;
  if (userResult.error || !userId) return json(401, { ok: false, message: 'Sign in to open the daily challenge.' });

  let body: { action?: string; reading?: unknown; listening?: unknown; grammar?: unknown } = {};
  try {
    body = await req.json() as typeof body;
  } catch {
    body = {};
  }
  const day = todayMadrid();
  const profile = await admin.from('profiles').select('default_level').eq('id', userId).maybeSingle();
  const profileLevel = challengeLevel(profile.data?.default_level == null ? 'B1' : String(profile.data.default_level));

  const loaded = await readAttempt(admin, userId, day);
  const tableMissing = loaded.tableMissing;
  let answersMissing = loaded.answersMissing;
  let attempt = loaded.attempt;
  let level = attempt ? challengeLevel(attempt.level) : profileLevel;

  if (!tableMissing && !attempt && body.action !== 'submit') {
    const inserted = await admin.from('daily_challenge_attempts').insert({
      user_id: userId,
      madrid_day: day,
      level,
    }).select(ATTEMPT_COLUMNS).maybeSingle();
    if (inserted.error && !missingTable(inserted.error)) {
      const again = await readAttempt(admin, userId, day);
      attempt = again.attempt;
      answersMissing = again.answersMissing;
    } else {
      attempt = (inserted.data ?? null) as AttemptRow | null;
    }
    if (attempt) level = challengeLevel(attempt.level);
  }

  const built = await piecesFor(admin, day, level);
  if (!built || !built.reading || !built.listening || !built.grammar) {
    return json(200, { ok: false, message: "Today's challenge is not ready yet." });
  }
  const audioUrl = built.listening.audioPath ? await signListeningAudio(admin, built.listening.audioPath) : null;

  const pack = {
    reading: { title: built.reading.title, topic: built.reading.topic, story: built.reading.story, quiz: built.reading.quiz },
    listening: { title: built.listening.title, topic: built.listening.topic, audioUrl, quiz: built.listening.quiz },
    grammar: built.grammar,
  };

  if (body.action === 'submit') {
    const readingAnswers = Array.isArray(body.reading) ? body.reading.map((item) => String(item ?? '')) : [];
    const listeningAnswers = Array.isArray(body.listening) ? body.listening.map((item) => String(item ?? '')) : [];
    const grammarAnswers = Array.isArray(body.grammar)
      ? body.grammar.map((item) => (Array.isArray(item) ? item.map((part) => String(part ?? '')) : String(item ?? '')))
      : [];
    const readingCorrect = gradeQuestions(built.reading.quiz, readingAnswers);
    const listeningCorrect = gradeQuestions(built.listening.quiz, listeningAnswers);
    const grammarCorrect = gradeGrammarItems(built.grammar.items, grammarAnswers);
    const report = buildChallengeReport({
      reading: built.reading.quiz,
      listening: built.listening.quiz,
      grammar: built.grammar.items,
      readingAnswers,
      listeningAnswers,
      grammarAnswers,
    });
    const readingTotal = built.reading.quiz.length;
    const listeningTotal = built.listening.quiz.length;
    const grammarTotal = built.grammar.items.length;
    const correct = readingCorrect + listeningCorrect + grammarCorrect;
    const total = readingTotal + listeningTotal + grammarTotal;
    if (attempt?.submitted_at) {
      return json(200, {
        ok: true,
        missing: false,
        recorded: false,
        correct: attempt.correct ?? correct,
        total: attempt.total ?? total,
        seconds: elapsedSeconds(attempt.started_at, attempt.submitted_at),
        readingCorrect: attempt.reading_correct ?? readingCorrect,
        listeningCorrect: attempt.listening_correct ?? listeningCorrect,
        grammarCorrect: attempt.grammar_correct ?? grammarCorrect,
        readingTotal: attempt.reading_total ?? readingTotal,
        listeningTotal: attempt.listening_total ?? listeningTotal,
        grammarTotal: attempt.grammar_total ?? grammarTotal,
        position: null,
        report: storedReport(attempt.answers),
        answersStored: storedReport(attempt.answers) != null,
      });
    }
    if (tableMissing || !attempt) {
      return json(200, {
        ok: true,
        missing: true,
        recorded: false,
        correct,
        total,
        seconds: 0,
        readingCorrect,
        listeningCorrect,
        grammarCorrect,
        readingTotal,
        listeningTotal,
        grammarTotal,
        position: null,
        report,
        answersStored: false,
      });
    }
    const submittedAt = new Date().toISOString();
    const scorePatch = {
      submitted_at: submittedAt,
      correct,
      total,
      reading_correct: readingCorrect,
      listening_correct: listeningCorrect,
      grammar_correct: grammarCorrect,
      reading_total: readingTotal,
      listening_total: listeningTotal,
      grammar_total: grammarTotal,
    };
    let saved = answersMissing
      ? { data: null as { started_at?: string; submitted_at?: string } | null, error: null as { code?: string; message?: string } | null }
      : await admin.from('daily_challenge_attempts').update({ ...scorePatch, answers: { report } }).eq('user_id', userId).eq('madrid_day', day).is('submitted_at', null).select('started_at, submitted_at').maybeSingle();
    let answersStored = Boolean(saved.data?.submitted_at) && !answersMissing;
    if (saved.error && missingAnswersColumn(saved.error)) {
      answersMissing = true;
      answersStored = false;
      saved = await admin.from('daily_challenge_attempts').update(scorePatch).eq('user_id', userId).eq('madrid_day', day).is('submitted_at', null).select('started_at, submitted_at').maybeSingle();
    }
    if (answersMissing && !saved.data && !saved.error) {
      saved = await admin.from('daily_challenge_attempts').update(scorePatch).eq('user_id', userId).eq('madrid_day', day).is('submitted_at', null).select('started_at, submitted_at').maybeSingle();
    }
    const recorded = Boolean(saved.data?.submitted_at);
    const startedAt = saved.data?.started_at ?? attempt.started_at;
    const finishedAt = saved.data?.submitted_at ?? submittedAt;
    return json(200, {
      ok: true,
      missing: Boolean(saved.error && missingTable(saved.error)),
      recorded,
      correct,
      total,
      seconds: elapsedSeconds(startedAt, finishedAt),
      readingCorrect,
      listeningCorrect,
      grammarCorrect,
      readingTotal,
      listeningTotal,
      grammarTotal,
      position: null,
      report,
      answersStored,
    });
  }

  return json(200, {
    ok: true,
    missing: tableMissing,
    day,
    level,
    startedAt: attempt?.started_at ?? null,
    submitted: attempt?.submitted_at ? {
      correct: attempt.correct ?? 0,
      total: attempt.total ?? 0,
      seconds: elapsedSeconds(attempt.started_at, attempt.submitted_at),
      readingCorrect: attempt.reading_correct ?? 0,
      listeningCorrect: attempt.listening_correct ?? 0,
      grammarCorrect: attempt.grammar_correct ?? 0,
      readingTotal: attempt.reading_total ?? 0,
      listeningTotal: attempt.listening_total ?? 0,
      grammarTotal: attempt.grammar_total ?? 0,
      position: null,
      report: storedReport(attempt.answers),
      answersStored: storedReport(attempt.answers) != null,
    } : null,
    ...pack,
  });
};

export const config = {
  path: '/api/daily-challenge',
};
