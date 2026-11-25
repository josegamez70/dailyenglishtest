import { loadAcademyStudents, loadOwnedAcademy } from './academy.ts';
import { getSupabase } from './auth.ts';
import { demoRows, publicAlias, rowFromAttempts, withRemoteAlias, type BoardLevel, type ModeTotals, type ScoreAttempt, type ScorePeriod, type ScoreRow } from './scoreboard.ts';
import { listTestResults } from './studyStore.ts';

export type ScoreboardSource = 'live' | 'owner' | 'demo' | 'self-only';

export type ScoreboardLoad = {
  source: ScoreboardSource;
  /** True when the viewer belongs to an academy or owns one. */
  inAcademy: boolean;
  selfAlias: string;
  selfAttempts: ScoreAttempt[];
  /** Set when the ranking function is installed or the viewer already owns the academy. */
  liveRows: ScoreRow[] | null;
  /** The installed function still treats yesterday as all time. */
  yesterdayPending: boolean;
  /** live: the level function filtered the board. pending: that function is not installed yet. off: demo rows are not split by level. */
  levelFilter: 'live' | 'pending' | 'off';
};

function sameTotals(left: ModeTotals, right: ModeTotals): boolean {
  return left.done === right.done && left.correct === right.correct && left.answered === right.answered;
}

function sameScore(left: ScoreRow, right: ScoreRow): boolean {
  return sameTotals(left.reading, right.reading)
    && sameTotals(left.listening, right.listening)
    && sameTotals(left.grammar, right.grammar);
}

type RpcRow = {
  alias?: unknown;
  is_self?: unknown;
  reading_done?: unknown;
  reading_correct?: unknown;
  reading_answered?: unknown;
  listening_done?: unknown;
  listening_correct?: unknown;
  listening_answered?: unknown;
  grammar_done?: unknown;
  grammar_correct?: unknown;
  grammar_answered?: unknown;
};

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fromRpc(row: RpcRow): ScoreRow {
  return {
    alias: publicAlias(String(row.alias ?? ''), row.is_self === true),
    isSelf: row.is_self === true,
    demo: false,
    reading: { done: num(row.reading_done), correct: num(row.reading_correct), answered: num(row.reading_answered) },
    listening: { done: num(row.listening_done), correct: num(row.listening_correct), answered: num(row.listening_answered) },
    grammar: { done: num(row.grammar_done), correct: num(row.grammar_correct), answered: num(row.grammar_answered) },
  };
}

export function boardRows(load: ScoreboardLoad, period: ScorePeriod, now = new Date()): ScoreRow[] {
  if (load.liveRows) {
    return load.liveRows;
  }
  const self = rowFromAttempts(load.selfAlias, load.selfAttempts, period, now, true);
  return [...demoRows(period), self];
}

function attemptFrom(row: { mode: ScoreAttempt['mode']; score: number; total: number; createdAt: string; level?: string }): ScoreAttempt {
  return {
    mode: row.mode,
    score: row.score,
    total: row.total,
    createdAt: row.createdAt,
    level: row.level,
  };
}

export async function loadScoreboard(displayName: string, period: ScorePeriod, level: BoardLevel): Promise<ScoreboardLoad> {
  const selfAlias = publicAlias(displayName, true);
  const saved = await listTestResults();
  const selfAttempts: ScoreAttempt[] = saved.rows.map((row) => attemptFrom({
    mode: row.mode,
    score: row.score,
    total: row.total,
    createdAt: row.created_at,
    level: row.level,
  }));
  const periodArg = period === 'daily' ? 'daily' : period;
  const supabase = getSupabase();
  if (supabase) {
    const levelRpc = await supabase.rpc('scoreboard_board_level', { p_period: periodArg, p_level: level });
    const rpc = !levelRpc.error && Array.isArray(levelRpc.data)
      ? levelRpc
      : await supabase.rpc('scoreboard_board', { p_period: periodArg });
    const levelFilter = !levelRpc.error && Array.isArray(levelRpc.data) ? 'live' : 'pending';
    if (!rpc.error && Array.isArray(rpc.data)) {
      const liveRows = (rpc.data as RpcRow[]).map(fromRpc);
      const owned = await loadOwnedAcademy();
      const membership = await supabase.from('academy_members').select('academy_id').limit(1);
      const inAcademy = Boolean(owned.academy) || (!membership.error && (membership.data?.length ?? 0) > 0);
      if (period === 'yesterday') {
        const local = rowFromAttempts(
          selfAlias,
          selfAttempts,
          'yesterday',
          new Date(),
          true,
          levelFilter === 'live' ? level : null,
        );
        const remote = liveRows.find((row) => row.isSelf);
        if (!remote || !sameScore(remote, local)) {
          return {
            source: 'self-only',
            inAcademy,
            selfAlias,
            selfAttempts,
            liveRows: [withRemoteAlias(local, remote?.alias)],
            yesterdayPending: true,
            levelFilter,
          };
        }
      }
      return { source: 'live', inAcademy, selfAlias, selfAttempts, liveRows, yesterdayPending: false, levelFilter };
    }
    const owned = await loadOwnedAcademy();
    if (owned.academy) {
      const students = await loadAcademyStudents(owned.academy.id);
      const { data: userData } = await supabase.auth.getUser();
      const selfId = userData.user?.id ?? '';
      const liveRows = students.students.map((student) => rowFromAttempts(
        publicAlias(student.displayName, student.userId === selfId),
        student.tests.map((test) => ({
          mode: test.mode,
          score: test.score,
          total: test.total,
          createdAt: test.createdAt,
          level: test.level,
        })),
        period,
        new Date(),
        student.userId === selfId,
        level,
      ));
      if (!liveRows.some((row) => row.isSelf)) {
        liveRows.push(rowFromAttempts(selfAlias, selfAttempts, period, new Date(), true, level));
      }
      return { source: 'owner', inAcademy: true, selfAlias, selfAttempts, liveRows, yesterdayPending: false, levelFilter: 'live' };
    }
    const membership = await supabase.from('academy_members').select('academy_id').limit(1);
    return {
      source: 'demo',
      inAcademy: !membership.error && (membership.data?.length ?? 0) > 0,
      selfAlias,
      selfAttempts,
      liveRows: null,
      yesterdayPending: false,
      levelFilter: 'off',
    };
  }
  return { source: 'demo', inAcademy: false, selfAlias, selfAttempts, liveRows: null, yesterdayPending: false, levelFilter: 'off' };
}
