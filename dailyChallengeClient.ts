import { accessToken, getSupabase } from './auth';
import type { ChallengeEntry, ChallengeLevel } from './dailyChallenge';
import type { GrammarItem } from './grammarSet';

export type ChallengeQuiz = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

export type ChallengePack = {
  ok: true;
  missing: boolean;
  day: string;
  level: ChallengeLevel;
  startedAt: string | null;
  submitted: {
    correct: number;
    total: number;
    seconds: number;
    readingCorrect: number;
    listeningCorrect: number;
    grammarCorrect: number;
    readingTotal: number;
    listeningTotal: number;
    grammarTotal: number;
    position: number | null;
  } | null;
  reading: { title: string; topic: string; story: string; quiz: ChallengeQuiz[] } | null;
  listening: { title: string; topic: string; audioUrl: string | null; quiz: ChallengeQuiz[] } | null;
  grammar: { title: string; exercise: string; items: GrammarItem[] } | null;
};

export type ChallengeSubmit = {
  ok: boolean;
  missing: boolean;
  recorded: boolean;
  correct: number;
  total: number;
  seconds: number;
  readingCorrect: number;
  listeningCorrect: number;
  grammarCorrect: number;
  readingTotal: number;
  listeningTotal: number;
  grammarTotal: number;
  position: number | null;
  message?: string;
};

async function postChallenge(body: unknown): Promise<unknown> {
  const token = await accessToken();
  const response = await fetch('/api/daily-challenge', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

export async function loadChallengePack(): Promise<ChallengePack | { ok: false; message: string }> {
  try {
    const body = await postChallenge({ action: 'load' }) as ChallengePack & { ok?: boolean; message?: string };
    if (!body || body.ok !== true) return { ok: false, message: body?.message || 'The challenge could not be loaded.' };
    return body;
  } catch {
    return { ok: false, message: 'The challenge could not be loaded.' };
  }
}

export async function submitChallenge(answers: {
  reading: string[];
  listening: string[];
  grammar: (string | string[])[];
}): Promise<ChallengeSubmit> {
  try {
    const body = await postChallenge({ action: 'submit', ...answers }) as ChallengeSubmit;
    if (!body || body.ok !== true) {
      return {
        ok: false,
        missing: false,
        recorded: false,
        correct: 0,
        total: 0,
        seconds: 0,
        readingCorrect: 0,
        listeningCorrect: 0,
        grammarCorrect: 0,
        readingTotal: 0,
        listeningTotal: 0,
        grammarTotal: 0,
        position: null,
        message: 'The result could not be saved.',
      };
    }
    return body;
  } catch {
    return {
      ok: false,
      missing: false,
      recorded: false,
      correct: 0,
      total: 0,
      seconds: 0,
      readingCorrect: 0,
      listeningCorrect: 0,
      grammarCorrect: 0,
      readingTotal: 0,
      listeningTotal: 0,
      grammarTotal: 0,
      position: null,
      message: 'The result could not be saved.',
    };
  }
}

export async function loadChallengeBoard(level: ChallengeLevel): Promise<{ missing: boolean; rows: ChallengeEntry[] }> {
  const supabase = getSupabase();
  if (!supabase) return { missing: true, rows: [] };
  const rpc = await supabase.rpc('daily_challenge_board', { p_level: level });
  if (rpc.error || !Array.isArray(rpc.data)) return { missing: true, rows: [] };
  const rows = (rpc.data as {
    alias?: unknown;
    is_self?: unknown;
    correct?: unknown;
    total?: unknown;
    seconds?: unknown;
  }[]).map((row) => ({
    alias: String(row.alias ?? 'Learner'),
    isSelf: row.is_self === true,
    demo: false,
    correct: Number(row.correct ?? 0),
    total: Number(row.total ?? 0),
    seconds: Number(row.seconds ?? 0),
  }));
  return { missing: false, rows };
}
