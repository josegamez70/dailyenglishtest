import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { bankChallengeIndex, bankUnavailable, grammarSetFromBankPayload, listeningLessonFromBankPayload, readingLessonFromBankPayload } from '../exerciseBank.ts';
import { signListeningAudio } from '../exerciseBankServer.ts';
import {
  challengeLevel,
  elapsedSeconds,
  gradeGrammarItems,
  gradeQuestions,
  listeningLevelForChallenge,
  todayMadrid,
  type ChallengeLevel,
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

function readingOf(row: BankRow) {
  const dims = row.dimensions && typeof row.dimensions === 'object' ? row.dimensions as { topic?: unknown } : {};
  const lesson = readingLessonFromBankPayload(row.payload, String(dims.topic ?? ''));
  if (!lesson) return null;
  return {
    title: lesson.title,
    topic: lesson.topicLabel,
    story: lesson.story,
    quiz: lesson.quiz.map((item) => ({
      question: item.question,
      options: item.options,
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
    })),
  };
}

function listeningOf(row: BankRow) {
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
    })),
  };
}

function grammarOf(row: BankRow) {
  const set = grammarSetFromBankPayload(row.payload, {
    level: row.level as GrammarLevel,
    exercise: row.exercise_type as GrammarExerciseType,
    topic: '',
  });
  if (!set) return null;
  return { title: set.title, exercise: set.exercise, items: set.items };
}

async function piecesFor(admin: SupabaseClient, day: string, level: ChallengeLevel) {
  const [readingRows, listeningRows, grammarRows] = await Promise.all([
    pool(admin, 'reading', level),
    pool(admin, 'listening', listeningLevelForChallenge(level)),
    pool(admin, 'grammar', level),
  ]);
  if (!readingRows || !listeningRows || !grammarRows) return null;
  const readingRow = readingRows[bankChallengeIndex(day, level, 'reading', readingRows.length)];
  const listeningRow = listeningRows[bankChallengeIndex(day, level, 'listening', listeningRows.length)];
  const grammarRow = grammarRows[bankChallengeIndex(day, level, 'grammar', grammarRows.length)];
  const reading = readingRow ? readingOf(readingRow) : null;
  const listening = listeningRow ? listeningOf(listeningRow) : null;
  const grammar = grammarRow ? grammarOf(grammarRow) : null;
  return { reading, listening, grammar };
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
};

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return bankUnavailable(error);
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

  const existing = await admin
    .from('daily_challenge_attempts')
    .select('level, started_at, submitted_at, correct, total, reading_correct, listening_correct, grammar_correct, reading_total, listening_total, grammar_total')
    .eq('user_id', userId)
    .eq('madrid_day', day)
    .maybeSingle();
  const tableMissing = Boolean(existing.error && missingTable(existing.error));
  let attempt = (existing.data ?? null) as AttemptRow | null;
  let level = attempt ? challengeLevel(attempt.level) : profileLevel;

  if (!tableMissing && !attempt && body.action !== 'submit') {
    const inserted = await admin.from('daily_challenge_attempts').insert({
      user_id: userId,
      madrid_day: day,
      level,
    }).select('level, started_at, submitted_at, correct, total, reading_correct, listening_correct, grammar_correct, reading_total, listening_total, grammar_total').maybeSingle();
    if (inserted.error && !missingTable(inserted.error)) {
      const again = await admin
        .from('daily_challenge_attempts')
        .select('level, started_at, submitted_at, correct, total, reading_correct, listening_correct, grammar_correct, reading_total, listening_total, grammar_total')
        .eq('user_id', userId)
        .eq('madrid_day', day)
        .maybeSingle();
      attempt = (again.data ?? null) as AttemptRow | null;
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
      });
    }
    const submittedAt = new Date().toISOString();
    const saved = await admin.from('daily_challenge_attempts').update({
      submitted_at: submittedAt,
      correct,
      total,
      reading_correct: readingCorrect,
      listening_correct: listeningCorrect,
      grammar_correct: grammarCorrect,
      reading_total: readingTotal,
      listening_total: listeningTotal,
      grammar_total: grammarTotal,
    }).eq('user_id', userId).eq('madrid_day', day).is('submitted_at', null).select('started_at, submitted_at').maybeSingle();
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
    } : null,
    ...pack,
  });
};

export const config = {
  path: '/api/daily-challenge',
};
