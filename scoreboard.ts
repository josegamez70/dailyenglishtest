import { madridDayKey, shiftMadridDay } from './tasks.ts';

export const SCOREBOARD_MIN = 3;
export const SCOREBOARD_TOP = 10;

export type ScoreMode = 'reading' | 'listening' | 'grammar';
export type ScorePeriod = 'daily' | 'yesterday' | 'all';
export type BoardLevel = 'B1' | 'B2' | 'C1';
export type ScoreMetric = 'accuracy' | 'volume';

export type ModeTotals = {
  done: number;
  correct: number;
  answered: number;
};

export type ScoreAttempt = {
  mode: ScoreMode | null;
  score: number;
  total: number;
  createdAt: string;
  /** Saved lesson level. Blank when the result has none. */
  level?: string;
};

export type ScoreRow = {
  alias: string;
  isSelf: boolean;
  /** True when the row was invented for the preview, not read from Supabase. */
  demo: boolean;
  reading: ModeTotals;
  listening: ModeTotals;
  grammar: ModeTotals;
};

export type PresentedRow = ScoreRow & {
  rank: number | null;
  qualified: boolean;
  totalDone: number;
  totalCorrect: number;
  totalAnswered: number;
};

const EMPTY: ModeTotals = { done: 0, correct: 0, answered: 0 };

export function emptyTotals(): ModeTotals {
  return { ...EMPTY };
}

/** Keep a public ranking alias when the local fallback would say You. */
export function withRemoteAlias(local: ScoreRow, remoteAlias: string | undefined): ScoreRow {
  const alias = (remoteAlias ?? '').trim();
  if (!alias || alias.includes('@') || alias === 'You' || alias === 'Learner') return local;
  return { ...local, alias };
}

/** A public label. An email, or a blank name, never becomes the label. */
export function publicAlias(displayName: string, self = false): string {
  const name = displayName.trim().slice(0, 40);
  if (name && !name.includes('@')) return name;
  return self ? 'You' : 'Learner';
}

/** A saved lesson level the board can filter. Unknown or blank text stays out. */
export function storedBoardLevel(level: string | null | undefined): BoardLevel | null {
  const key = String(level ?? '').trim().toUpperCase();
  if (key === 'C1' || key === 'C2' || key === 'ADVANCED') return 'C1';
  if (key === 'B2' || key === 'INTERMEDIATE') return 'B2';
  if (key === 'B1' || key === 'A1' || key === 'A2' || key === 'BEGINNER') return 'B1';
  return null;
}

export function rankLabel(rank: number | null): string {
  if (rank === 1) return '1ST';
  if (rank === 2) return '2ND';
  if (rank === 3) return '3RD';
  if (rank == null) return '—';
  return String(rank);
}

export function weightedPercent(correct: number, answered: number): number | null {
  if (answered <= 0) return null;
  return Math.round((correct / answered) * 100);
}

export function formatPercent(correct: number, answered: number, qualified: boolean): string {
  if (!qualified) return '—';
  const percent = weightedPercent(correct, answered);
  return percent == null ? '—' : `${percent}%`;
}

function totalsOf(row: ScoreRow, mode: ScoreMode | 'total'): ModeTotals {
  if (mode === 'total') {
    return {
      done: row.reading.done + row.listening.done + row.grammar.done,
      correct: row.reading.correct + row.listening.correct + row.grammar.correct,
      answered: row.reading.answered + row.listening.answered + row.grammar.answered,
    };
  }
  return row[mode];
}

export function periodDay(period: ScorePeriod, now = new Date()): string | null {
  const today = madridDayKey(now);
  if (period === 'daily') return today;
  if (period === 'yesterday') return shiftMadridDay(today, -1);
  return null;
}

export function rowFromAttempts(
  alias: string,
  attempts: readonly ScoreAttempt[],
  period: ScorePeriod,
  now = new Date(),
  isSelf = false,
  boardLevel: BoardLevel | null = null,
): ScoreRow {
  const day = periodDay(period, now);
  const row: ScoreRow = {
    alias,
    isSelf,
    demo: false,
    reading: emptyTotals(),
    listening: emptyTotals(),
    grammar: emptyTotals(),
  };
  for (const attempt of attempts) {
    if (attempt.mode !== 'reading' && attempt.mode !== 'listening' && attempt.mode !== 'grammar') continue;
    if (attempt.total <= 0) continue;
    if (boardLevel && storedBoardLevel(attempt.level) !== boardLevel) continue;
    if (day && madridDayKey(new Date(attempt.createdAt)) !== day) continue;
    const bucket = row[attempt.mode];
    bucket.done += 1;
    bucket.correct += Math.max(0, attempt.score);
    bucket.answered += attempt.total;
  }
  return row;
}

function byAlias(left: ScoreRow, right: ScoreRow): number {
  return left.alias.localeCompare(right.alias) || Number(right.isSelf) - Number(left.isSelf);
}

/** Accuracy ranks weighted percent among learners who reached the minimum. Volume ranks finished exercises, then percent. */
export function presentBoard(rows: readonly ScoreRow[], minimum = SCOREBOARD_MIN, metric: ScoreMetric = 'accuracy'): {
  top: PresentedRow[];
  self: PresentedRow | null;
  unqualified: PresentedRow[];
} {
  const min = Math.max(1, Math.floor(minimum) || SCOREBOARD_MIN);
  const decorated = rows.map((row) => {
    const total = totalsOf(row, 'total');
    const qualified = metric === 'volume' ? total.done >= 1 : total.done >= min;
    return {
      ...row,
      rank: null as number | null,
      qualified,
      totalDone: total.done,
      totalCorrect: total.correct,
      totalAnswered: total.answered,
    };
  });
  const competing = decorated.filter((row) => row.qualified);
  const sittingOut = decorated.filter((row) => !row.qualified);
  const ratio = (row: PresentedRow) => (row.totalAnswered > 0 ? row.totalCorrect / row.totalAnswered : -1);
  competing.sort((left, right) => {
    const primary = metric === 'volume' ? right.totalDone - left.totalDone : ratio(right) - ratio(left);
    if (primary) return primary;
    const secondary = metric === 'volume' ? ratio(right) - ratio(left) : right.totalDone - left.totalDone;
    if (secondary) return secondary;
    return byAlias(left, right);
  });
  competing.forEach((row, index) => {
    row.rank = index + 1;
  });
  sittingOut.sort(byAlias);
  const top = competing.slice(0, SCOREBOARD_TOP);
  const self = competing.find((row) => row.isSelf && row.rank != null && row.rank > SCOREBOARD_TOP) ?? null;
  return {
    top,
    self,
    unqualified: sittingOut,
  };
}

/** Fixed preview rows. Every alias says Demo. None of these people are in Supabase. */
export function demoRows(period: ScorePeriod): ScoreRow[] {
  const all: ScoreRow[] = [
    demo('Demo Alba', 40, 36, 40, 36, 32, 36, 30, 28, 36),
    demo('Demo Bruno', 36, 30, 36, 32, 26, 36, 28, 22, 36),
    demo('Demo Celia', 34, 28, 36, 30, 22, 36, 26, 18, 36),
    demo('Demo Diego', 32, 24, 32, 28, 18, 32, 24, 16, 32),
    demo('Demo Elena', 30, 22, 30, 26, 16, 30, 22, 14, 30),
    demo('Demo Farid', 28, 18, 30, 24, 14, 28, 20, 12, 28),
    demo('Demo Gema', 26, 16, 28, 22, 12, 26, 18, 10, 26),
    demo('Demo Hugo', 24, 14, 26, 20, 10, 24, 16, 8, 24),
    demo('Demo Ines', 24, 12, 24, 18, 8, 24, 14, 8, 24),
    demo('Demo Juan', 24, 16, 24, 16, 10, 24, 12, 8, 24),
    demo('Demo Ken', 1, 1, 5, 0, 0, 0, 0, 0, 0),
    demo('Demo Lola', 0, 0, 0, 1, 0, 5, 0, 0, 0),
  ];
  if (period === 'all') return all;
  if (period === 'yesterday') {
    return [
      demo('Demo Alba', 1, 4, 5, 1, 3, 5, 1, 4, 5),
      demo('Demo Bruno', 1, 3, 5, 1, 2, 5, 1, 2, 5),
      demo('Demo Celia', 1, 2, 5, 0, 0, 0, 1, 1, 5),
      demo('Demo Ken', 1, 0, 5, 0, 0, 0, 0, 0, 0),
    ];
  }
  return [
    demo('Demo Alba', 2, 8, 10, 1, 4, 5, 1, 5, 6),
    demo('Demo Bruno', 1, 4, 5, 2, 6, 10, 1, 3, 5),
    demo('Demo Celia', 1, 3, 5, 1, 3, 5, 2, 6, 10),
    demo('Demo Diego', 2, 6, 10, 1, 2, 5, 1, 2, 5),
    demo('Demo Elena', 1, 2, 5, 1, 2, 5, 1, 2, 5),
    demo('Demo Farid', 1, 1, 5, 1, 1, 5, 1, 1, 5),
    demo('Demo Gema', 1, 2, 5, 1, 2, 5, 1, 2, 5),
    demo('Demo Hugo', 2, 3, 10, 1, 1, 5, 1, 1, 5),
    demo('Demo Ines', 1, 1, 5, 2, 2, 10, 1, 1, 5),
    demo('Demo Juan', 1, 1, 5, 1, 1, 5, 2, 2, 10),
    demo('Demo Ken', 1, 0, 5, 0, 0, 0, 0, 0, 0),
  ];
}

function demo(
  alias: string,
  readingDone: number,
  readingCorrect: number,
  readingAnswered: number,
  listeningDone: number,
  listeningCorrect: number,
  listeningAnswered: number,
  grammarDone: number,
  grammarCorrect: number,
  grammarAnswered: number,
): ScoreRow {
  return {
    alias,
    isSelf: false,
    demo: true,
    reading: { done: readingDone, correct: readingCorrect, answered: readingAnswered },
    listening: { done: listeningDone, correct: listeningCorrect, answered: listeningAnswered },
    grammar: { done: grammarDone, correct: grammarCorrect, answered: grammarAnswered },
  };
}
