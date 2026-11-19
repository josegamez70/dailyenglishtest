import { useEffect, useState } from 'react';
import { boardRows, loadScoreboard, type ScoreboardLoad } from '../scoreboardLoad';
import {
  formatPercent,
  presentBoard,
  SCOREBOARD_MIN,
  type PresentedRow,
  type ScorePeriod,
  type ScoreRow,
} from '../scoreboard';
import {
  type ChallengeEntry,
  type ChallengeLevel,
} from '../dailyChallenge';
import { loadChallengeBoard } from '../dailyChallengeClient';
import { BackButton } from './BackButton';
import { ChallengeRankTable } from './ChallengeRankTable';
import { PixelArt } from './PixelArt';

const RANKING_LINE = 'Ranked by % correct among learners with at least 3 exercises; ties go to whoever did more.';

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

function Row({ row }: { row: PresentedRow }) {
  return (
    <tr className={`${medal(row.rank)} ${row.isSelf ? 'scoreboard-you' : ''} ${row.demo ? 'scoreboard-demo' : ''}`}>
      <td className="px-2 py-2 font-bold">{row.rank ?? '—'}</td>
      <td className="px-2 py-2">
        <span className="block font-semibold">{row.alias}</span>
        {row.demo && <span className="block text-xs">Fictitious</span>}
        {row.isSelf && <span className="block text-xs">Your row</span>}
        {!row.qualified && <span className="block text-xs">Not yet qualified</span>}
      </td>
      <Pair done={row.reading.done} correct={row.reading.correct} answered={row.reading.answered} />
      <Pair done={row.listening.done} correct={row.listening.correct} answered={row.listening.answered} />
      <Pair done={row.grammar.done} correct={row.grammar.correct} answered={row.grammar.answered} />
      <Pair done={row.totalDone} correct={row.totalCorrect} answered={row.totalAnswered} />
    </tr>
  );
}

export type ScoreboardFixture = {
  rows: ScoreRow[];
  source?: ScoreboardLoad['source'];
  challengeRows?: ChallengeEntry[];
  challengeMissing?: boolean;
  initialView?: ScorePeriod | 'challenge';
};

export function ScoreboardPage({
  displayName,
  onBack,
  profileLevel = 'B1',
  fixture,
}: {
  displayName: string;
  onBack?: () => void;
  profileLevel?: string | null;
  fixture?: ScoreboardFixture;
}) {
  const initialLevel: ChallengeLevel = profileLevel === 'B2' || profileLevel === 'C1' ? profileLevel : 'B1';
  const [view, setView] = useState<ScorePeriod | 'challenge'>(fixture?.initialView ?? 'challenge');
  const [level, setLevel] = useState<ChallengeLevel>(initialLevel);
  const [load, setLoad] = useState<ScoreboardLoad | null>(null);
  const [ready, setReady] = useState(Boolean(fixture));
  const [challengeRows, setChallengeRows] = useState<ChallengeEntry[]>(fixture?.challengeRows ?? []);
  const [challengeMissing, setChallengeMissing] = useState(fixture?.challengeMissing ?? false);
  const [challengeReady, setChallengeReady] = useState(Boolean(fixture));

  const period: ScorePeriod = view === 'challenge' ? 'all' : view;

  useEffect(() => {
    if (fixture) return undefined;
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
  }, [displayName, period, fixture]);

  useEffect(() => {
    if (fixture || view !== 'challenge') return undefined;
    let ignore = false;
    setChallengeReady(false);
    loadChallengeBoard(level).then((next) => {
      if (ignore) return;
      setChallengeRows(next.rows);
      setChallengeMissing(next.missing);
      setChallengeReady(true);
    }).catch(() => {
      if (!ignore) {
        setChallengeMissing(true);
        setChallengeReady(true);
      }
    });
    return () => { ignore = true; };
  }, [fixture, view, level]);

  const rows = fixture ? fixture.rows : load ? boardRows(load, period) : [];
  const board = presentBoard(rows, SCOREBOARD_MIN);
  const demo = fixture ? fixture.source !== 'live' : load?.source === 'demo';

  return (
    <div className="mx-auto w-full max-w-5xl">
      {onBack && <BackButton onClick={onBack} />}
      <h1 className="text-2xl font-bold">Scoreboard</h1>
      <p className="mt-2 text-base">Correct answers divided by questions.</p>
      {demo && view !== 'challenge' && (
        <p className="mt-3 border-2 border-slate-900 bg-amber-100 px-3 py-2 text-base text-slate-900" role="note">
          Fictitious demo. The names marked Fictitious are not students. Your row uses only your own saved results.
        </p>
      )}
      {load?.source === 'live' && load.inAcademy && (
        <p className="mt-3 text-base">Your academy only. A chosen public name is shown.</p>
      )}
      {load?.source === 'live' && !load.inAcademy && (
        <p className="mt-3 text-base">Individual learners share one scoreboard. Your display name from Profile is shown (never your email).</p>
      )}
      {load?.source === 'owner' && (
        <p className="mt-3 text-base">Your academy only. A chosen public name is shown.</p>
      )}
      {load?.yesterdayPending && view === 'yesterday' && (
        <p className="mt-3 border-2 border-slate-900 bg-amber-100 px-3 py-2 text-base text-slate-900" role="note">
          Yesterday for the whole board needs the database update. This tab shows only your own yesterday until then.
        </p>
      )}
      <div className="scoreboard-tabs mt-4" role="tablist" aria-label="Scoreboard period">
        <button type="button" role="tab" aria-selected={view === 'challenge'} onClick={() => setView('challenge')} className={view === 'challenge' ? 'scoreboard-tab-challenge is-selected' : 'scoreboard-tab-challenge'}>
          <PixelArt src="/icons/daily_challenge.png" size={24} />
          Daily challenge
        </button>
        <div className="scoreboard-tab-row">
          {([
            ['daily', 'Today'],
            ['yesterday', 'Yesterday'],
            ['all', 'All time'],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={view === id ? 'is-selected' : undefined}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {view !== 'challenge' && (
        <p className="mt-2 text-sm">
          {period === 'all' ? 'Every saved result.' : period === 'daily' ? 'Today in Spain.' : 'Yesterday in Spain.'}
          {' '}The date follows Europe/Madrid, including the clock change.
        </p>
      )}
      {view === 'challenge' && (
        <>
          <p className="mt-2 text-sm">Today's daily challenge at this level, in Spain time. Ranked by percent, so an earlier attempt with a different number of questions still compares fairly. A shorter time breaks a tie.</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Challenge level">
            {(['B1', 'B2', 'C1'] as const).map((id) => (
              <button key={id} type="button" aria-pressed={level === id} onClick={() => setLevel(id)} className={`choice-pill border-2 border-slate-900 px-4 py-2 text-base font-bold ${level === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`}>
                {id}
              </button>
            ))}
          </div>
          {challengeReady && <ChallengeRankTable rows={challengeRows} level={level} missing={challengeMissing} heading={false} />}
        </>
      )}
      {view !== 'challenge' && !ready && <p className="mt-4 text-base">Loading...</p>}
      {view !== 'challenge' && ready && (
        <div className="scoreboard-scroll mt-4 overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left text-base">
            <caption className="sr-only">{RANKING_LINE}</caption>
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
              {board.top.map((row) => <Row key={`${row.alias}-top`} row={row} />)}
              {board.self && <Row key="self-outside" row={board.self} />}
              {board.unqualified.map((row) => <Row key={`${row.alias}-out`} row={row} />)}
            </tbody>
          </table>
          <p className="mt-2 text-sm">{RANKING_LINE}</p>
        </div>
      )}
    </div>
  );
}
