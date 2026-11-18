import { useEffect, useState } from 'react';
import { boardRows, loadScoreboard, type ScoreboardLoad } from '../scoreboardLoad';
import {
  formatPercent,
  presentBoard,
  SCOREBOARD_MIN,
  type PresentedRow,
  type ScorePeriod,
  type ScoreRank,
} from '../scoreboard';
import { BackButton } from './BackButton';

function medal(rank: number | null): string {
  if (rank === 1) return 'scoreboard-gold';
  if (rank === 2) return 'scoreboard-silver';
  if (rank === 3) return 'scoreboard-bronze';
  return '';
}

function Pair({ done, correct, answered }: { done: number; correct: number; answered: number }) {
  return (
    <>
      <td className="px-2 py-2 text-right">{done}</td>
      <td className="px-2 py-2 text-right">{formatPercent(correct, answered, answered > 0)}</td>
    </>
  );
}

function Row({ row, rank }: { row: PresentedRow; rank: ScoreRank }) {
  return (
    <tr className={`${medal(row.rank)} ${row.isSelf ? 'scoreboard-you' : ''} ${row.demo ? 'scoreboard-demo' : ''}`}>
      <td className="px-2 py-2 font-bold">{row.rank ?? '—'}</td>
      <td className="px-2 py-2">
        <span className="block font-semibold">{row.alias}</span>
        {row.demo && <span className="block text-xs">Fictitious</span>}
        {row.isSelf && <span className="block text-xs">Your row</span>}
        {rank === 'percent' && !row.qualified && <span className="block text-xs">Not yet qualified</span>}
      </td>
      <Pair done={row.reading.done} correct={row.reading.correct} answered={row.reading.answered} />
      <Pair done={row.listening.done} correct={row.listening.correct} answered={row.listening.answered} />
      <Pair done={row.grammar.done} correct={row.grammar.correct} answered={row.grammar.answered} />
      <Pair done={row.totalDone} correct={row.totalCorrect} answered={row.totalAnswered} />
    </tr>
  );
}

export function ScoreboardPage({ displayName, onBack }: { displayName: string; onBack?: () => void }) {
  const [period, setPeriod] = useState<ScorePeriod>('all');
  const [rank, setRank] = useState<ScoreRank>('percent');
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
  const board = presentBoard(rows, rank, minimum);
  const demo = load?.source === 'demo';

  return (
    <div className="mx-auto w-full max-w-5xl">
      {onBack && <BackButton onClick={onBack} />}
      <h1 className="text-2xl font-bold">Scoreboard</h1>
      <p className="mt-2 text-base">Correct answers divided by questions.</p>
      {demo && (
        <p className="mt-3 border-2 border-slate-900 bg-amber-100 px-3 py-2 text-base text-slate-900" role="note">
          Fictitious demo. The names marked Fictitious are not students. Your row uses only your own saved results.
        </p>
      )}
      {load?.source === 'live' && load.inAcademy && (
        <p className="mt-3 text-base">Your academy only. A chosen public name is shown.</p>
      )}
      {load?.source === 'live' && !load.inAcademy && (
        <p className="mt-3 text-base">Individual learners share one scoreboard. Only a chosen alias is shown.</p>
      )}
      {load?.source === 'owner' && (
        <p className="mt-3 text-base">Your academy only. A chosen public name is shown.</p>
      )}
      {load?.yesterdayPending && (
        <p className="mt-3 border-2 border-slate-900 bg-amber-100 px-3 py-2 text-base text-slate-900" role="note">
          Yesterday for the whole board needs the database update. This tab shows only your own yesterday until then.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Scoreboard period">
        {([
          ['all', 'All time'],
          ['daily', 'Today'],
          ['yesterday', 'Yesterday'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={period === id} onClick={() => setPeriod(id)} className="px-4 py-2 text-base font-bold">
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm">
        {period === 'all' ? 'Every saved result.' : period === 'daily' ? 'Today in Spain.' : 'Yesterday in Spain.'}
        {' '}The date follows Europe/Madrid, including the clock change.
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Ranking">
        {([
          ['exercises', 'Más ejercicios'],
          ['percent', 'Mejor %'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={rank === id} onClick={() => setRank(id)} className={`border-2 border-slate-900 px-4 py-2 text-base font-bold ${rank === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`}>
            {label}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-base font-semibold" htmlFor="scoreboard-min">
        Minimum exercises
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
      {!ready && <p className="mt-4 text-base">Loading...</p>}
      {ready && (
        <div className="scoreboard-scroll mt-4 overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left text-base">
            <caption className="sr-only">{rank === 'exercises' ? 'Ranked by total exercises, then by total percent.' : 'Ranked by total percent among learners who reached the minimum, then by total exercises.'} Swipe sideways to see every column.</caption>
            <thead className="scoreboard-head">
              <tr>
                <th className="px-2 py-2" rowSpan={2}>#</th>
                <th className="px-2 py-2" rowSpan={2}>Student</th>
                <th className="px-2 py-2 text-center" colSpan={2}>Reading</th>
                <th className="px-2 py-2 text-center" colSpan={2}>Listening</th>
                <th className="px-2 py-2 text-center" colSpan={2}>Grammar</th>
                <th className="px-2 py-2 text-center" colSpan={2}>Total</th>
              </tr>
              <tr>
                {['Reading', 'Listening', 'Grammar', 'Total'].flatMap((group) => [
                  <th key={`${group}-n`} className="px-2 py-1 text-right">#</th>,
                  <th key={`${group}-p`} className="px-2 py-1 text-right">%</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {board.top.map((row) => <Row key={`${row.alias}-top`} row={row} rank={rank} />)}
              {board.self && <Row key="self-outside" row={board.self} rank={rank} />}
              {board.unqualified.map((row) => <Row key={`${row.alias}-out`} row={row} rank={rank} />)}
            </tbody>
          </table>
          <p className="mt-2 text-sm">Swipe sideways to see every column. Gold, silver, and bronze mark the first three. Mejor % leaves out learners under the minimum.</p>
        </div>
      )}
    </div>
  );
}
