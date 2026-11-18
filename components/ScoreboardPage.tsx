import { useEffect, useState } from 'react';
import { boardRows, loadScoreboard, type ScoreboardLoad } from '../scoreboardLoad';
import {
  formatPercent,
  presentBoard,
  SCOREBOARD_MIN,
  type PresentedRow,
  type ScorePeriod,
  type ScoreSort,
} from '../scoreboard';
import { BackButton } from './BackButton';

const SORTS: { id: ScoreSort; label: string }[] = [
  { id: 'total-percent', label: 'Global percent' },
  { id: 'total-count', label: 'Total exercises' },
  { id: 'reading-percent', label: 'Reading percent' },
  { id: 'reading-count', label: 'Reading exercises' },
  { id: 'listening-percent', label: 'Listening percent' },
  { id: 'listening-count', label: 'Listening exercises' },
  { id: 'grammar-percent', label: 'Grammar percent' },
  { id: 'grammar-count', label: 'Grammar exercises' },
];

function medal(rank: number | null): string {
  if (rank === 1) return 'scoreboard-gold';
  if (rank === 2) return 'scoreboard-silver';
  if (rank === 3) return 'scoreboard-bronze';
  return '';
}

function Cell({ done, correct, answered, qualified }: { done: number; correct: number; answered: number; qualified: boolean }) {
  return (
    <td className="px-2 py-2 text-right align-top">
      <span className="block font-bold">{done}</span>
      <span className="block">{formatPercent(correct, answered, qualified)}</span>
    </td>
  );
}

function Row({ row }: { row: PresentedRow }) {
  const place = medal(row.rank);
  return (
    <tr className={`${place} ${row.isSelf ? 'scoreboard-you' : ''} ${row.demo ? 'scoreboard-demo' : ''}`}>
      <td className="px-2 py-2 font-bold">{row.rank ?? '—'}</td>
      <td className="px-2 py-2">
        <span className="block font-semibold">{row.alias}</span>
        {row.demo && <span className="block text-xs">Fictitious</span>}
        {row.isSelf && <span className="block text-xs">Your row</span>}
        {!row.qualified && <span className="block text-xs">Not yet qualified</span>}
      </td>
      <Cell done={row.reading.done} correct={row.reading.correct} answered={row.reading.answered} qualified={row.qualified} />
      <Cell done={row.listening.done} correct={row.listening.correct} answered={row.listening.answered} qualified={row.qualified} />
      <Cell done={row.grammar.done} correct={row.grammar.correct} answered={row.grammar.answered} qualified={row.qualified} />
      <Cell done={row.totalDone} correct={row.totalCorrect} answered={row.totalAnswered} qualified={row.qualified} />
    </tr>
  );
}

export function ScoreboardPage({ displayName, onBack }: { displayName: string; onBack?: () => void }) {
  const [period, setPeriod] = useState<ScorePeriod>('all');
  const [sort, setSort] = useState<ScoreSort>('total-percent');
  const [minimum, setMinimum] = useState(SCOREBOARD_MIN);
  const [load, setLoad] = useState<ScoreboardLoad | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let ignore = false;
    setReady(false);
    loadScoreboard(displayName, period).then((next) => {
      if (ignore) return;
      setLoad(next);
      setReady(true);
    }).catch(() => {
      if (!ignore) setReady(true);
    });
    return () => { ignore = true; };
  }, [displayName, period]);

  const rows = load ? boardRows(load, period) : [];
  const board = presentBoard(rows, sort, minimum);
  const demo = load?.source === 'demo';

  return (
    <div className="mx-auto w-full max-w-5xl">
      {onBack && <BackButton onClick={onBack} />}
      <h1 className="text-2xl font-bold">Scoreboard</h1>
      <p className="mt-2 text-base">Reading, Listening, and Grammar. The percent is correct answers divided by questions.</p>
      {demo && (
        <p className="mt-3 border-2 border-slate-900 bg-amber-100 px-3 py-2 text-base text-slate-900" role="note">
          Fictitious demo. The names marked Fictitious are not students.
          {' '}Your row uses only your own saved results.
          {load?.inAcademy
            ? ' Classmate rankings stay hidden until the database update in this pull request is applied. It is not applied on this preview.'
            : ' You are not in an academy, so a live board would show only you.'}
        </p>
      )}
      {load?.source === 'owner' && (
        <p className="mt-3 text-base">Your academy only. Names are the public display name.</p>
      )}
      {load?.source === 'live' && (
        <p className="mt-3 text-base">Your academy only. A learner without an academy sees only their own row.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Scoreboard period">
        {([
          ['all', 'All time'],
          ['daily', 'Daily'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={period === id}
            onClick={() => setPeriod(id)}
            className="px-4 py-2 text-base font-bold"
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm">{period === 'daily' ? 'Today in Spain (Europe/Madrid), including the clock change.' : 'Every saved result.'}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="text-base font-semibold" htmlFor="scoreboard-sort">
          Sort
          <select
            id="scoreboard-sort"
            className="mt-1 block w-full border-2 border-slate-900 bg-white px-2 py-2 text-base text-slate-900"
            value={sort}
            onChange={(event) => setSort(event.target.value as ScoreSort)}
          >
            {SORTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-base font-semibold" htmlFor="scoreboard-min">
          Minimum exercises to rank by percent
          <input
            id="scoreboard-min"
            type="number"
            min={1}
            max={50}
            value={minimum}
            onChange={(event) => setMinimum(Math.max(1, Math.min(50, Number(event.target.value) || SCOREBOARD_MIN)))}
            className="mt-1 block w-28 border-2 border-slate-900 bg-white px-2 py-2 text-base text-slate-900"
          />
        </label>
      </div>
      {!ready && <p className="mt-4 text-base">Loading...</p>}
      {ready && (
        <div className="scoreboard-scroll mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-base">
            <caption className="sr-only">Academic scoreboard. Swipe sideways on a phone to see every column.</caption>
            <thead className="scoreboard-head">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Student</th>
                <th className="px-2 py-2 text-right">Reading</th>
                <th className="px-2 py-2 text-right">Listening</th>
                <th className="px-2 py-2 text-right">Grammar</th>
                <th className="px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {board.top.map((row) => <Row key={`${row.alias}-top`} row={row} />)}
              {board.self && <Row key="self-outside" row={board.self} />}
              {board.unqualified.map((row) => <Row key={`${row.alias}-out`} row={row} />)}
            </tbody>
          </table>
          <p className="mt-2 text-sm">Swipe sideways to see every column. Gold, silver, and bronze mark the first three. A percent is hidden until the minimum is met.</p>
        </div>
      )}
    </div>
  );
}
