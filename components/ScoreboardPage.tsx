import { useEffect, useState } from 'react';
import { boardRows, loadScoreboard, type ScoreboardLoad } from '../scoreboardLoad';
import {
  formatPercent,
  presentBoard,
  rankLabel,
  SCOREBOARD_MIN,
  type PresentedRow,
  type ScoreMetric,
  type ScorePeriod,
  type ScoreRow,
  scoreboardPeriodChoice,
  scoreboardViewFromBrowser,
} from '../scoreboard';
import {
  formatDuration,
  presentChallenge,
  type ChallengeEntry,
  type ChallengeLevel,
} from '../dailyChallenge';
import { loadChallengeBoard } from '../dailyChallengeClient';
import { BackButton } from './BackButton';

const ACCURACY_LINE = `Highest % uses correct answers divided by questions. Only learners with ${SCOREBOARD_MIN} exercises appear. A tie goes to whoever did more.`;
const VOLUME_LINE = 'Most exercises counts finished Reading, Listening, and Grammar exercises. A tie goes to the higher percent.';

function Row({ row, metric }: { row: PresentedRow; metric: ScoreMetric }) {
  const primary = metric === 'volume'
    ? String(row.totalDone)
    : formatPercent(row.totalCorrect, row.totalAnswered, row.qualified);
  const secondary = metric === 'volume'
    ? formatPercent(row.totalCorrect, row.totalAnswered, row.totalAnswered > 0)
    : `${row.totalDone}`;
  return (
    <li className={`arcade-row ${row.isSelf ? 'is-you' : ''} ${row.demo ? 'is-demo' : ''}`}>
      <span className={`arcade-rank${row.rank && row.rank <= 3 ? ` is-${row.rank}` : ''}`}>{rankLabel(row.rank)}</span>
      <span className="arcade-who">
        <span className="arcade-name">{row.alias}</span>
        <span className="arcade-meta">
          R {row.reading.done} · L {row.listening.done} · G {row.grammar.done}
          {row.demo ? ' · Fictitious' : ''}
          {row.isSelf ? ' · You' : ''}
        </span>
      </span>
      <span className="arcade-score">
        <span className="arcade-score-main">{primary}</span>
        <span className="arcade-score-sub">{metric === 'volume' ? secondary : `${secondary} done`}</span>
      </span>
    </li>
  );
}

export type ScoreboardFixture = {
  rows: ScoreRow[];
  source?: ScoreboardLoad['source'];
  challengeRows?: ChallengeEntry[];
  challengeMissing?: boolean;
  initialView?: ScorePeriod | 'challenge';
  levelFilter?: ScoreboardLoad['levelFilter'];
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
  const [view, setView] = useState<'daily' | 'yesterday' | 'challenge'>(() => (
    fixture ? scoreboardPeriodChoice(fixture.initialView) : scoreboardViewFromBrowser()
  ));
  const [level, setLevel] = useState<ChallengeLevel>(initialLevel);
  const [metric, setMetric] = useState<ScoreMetric>('accuracy');
  const [load, setLoad] = useState<ScoreboardLoad | null>(null);
  const [ready, setReady] = useState(Boolean(fixture));
  const [challengeRows, setChallengeRows] = useState<ChallengeEntry[]>(fixture?.challengeRows ?? []);
  const [challengeMissing, setChallengeMissing] = useState(fixture?.challengeMissing ?? false);
  const [challengeReady, setChallengeReady] = useState(Boolean(fixture));

  const period: ScorePeriod = view === 'yesterday' ? 'yesterday' : 'daily';

  useEffect(() => {
    if (fixture || view === 'challenge') return undefined;
    let ignore = false;
    setReady(false);
    loadScoreboard(displayName, period, level).then((next) => {
      if (ignore) return;
      setLoad(next);
      setReady(true);
    }).catch(() => {
      if (!ignore) setReady(true);
    });
    return () => { ignore = true; };
  }, [displayName, period, level, fixture, view]);

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
  const board = presentBoard(rows, SCOREBOARD_MIN, metric);
  const challenge = presentChallenge(fixture ? (fixture.challengeRows ?? []) : challengeRows);
  const demo = fixture ? fixture.source !== 'live' : load?.source === 'demo';
  const levelFilter = fixture?.levelFilter ?? load?.levelFilter ?? 'off';
  const periodLabel = view === 'daily' ? 'Today' : view === 'yesterday' ? 'Yesterday' : 'Daily challenge';
  const metricLabel = metric === 'volume' ? 'Most exercises' : 'Highest %';
  const ownGap = board.unqualified.find((row) => row.isSelf);
  const exercisesLeft = ownGap
    ? Math.max(1, (metric === 'volume' ? 1 : SCOREBOARD_MIN) - ownGap.totalDone)
    : 0;

  return (
    <div className="mx-auto w-full max-w-5xl">
      {onBack && <BackButton onClick={onBack} />}
      <div className="arcade-board">
      <p className="arcade-kicker">Recreativa</p>
      <h1 className="arcade-title">High scores</h1>
      <div className="scoreboard-tabs" role="tablist" aria-label="Daily challenge">
        <button type="button" role="tab" aria-selected={view === 'challenge'} onClick={() => setView('challenge')} className={view === 'challenge' ? 'scoreboard-tab-challenge is-selected' : 'scoreboard-tab-challenge'}>
          Daily challenge
        </button>
      </div>
      <div className="arcade-levels" role="group" aria-label="Level">
        {(['B1', 'B2', 'C1'] as const).map((id) => (
          <button key={id} type="button" aria-pressed={level === id} onClick={() => setLevel(id)}>{id}</button>
        ))}
      </div>
      <div className="scoreboard-tabs arcade-tabs" role="tablist" aria-label="Scoreboard period">
        <div className="scoreboard-tab-row">
          {([
            ['daily', 'Today'],
            ['yesterday', 'Yesterday'],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={view === id ? 'is-selected' : undefined}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="arcade-metrics" role="group" aria-label="Ranking">
        <button type="button" aria-pressed={metric === 'volume'} disabled={view === 'challenge'} onClick={() => setMetric('volume')}>Most exercises</button>
        <button type="button" aria-pressed={metric === 'accuracy'} disabled={view === 'challenge'} onClick={() => setMetric('accuracy')}>Highest %</button>
      </div>
      <p className="arcade-marquee">{periodLabel} · {level}{view === 'challenge' ? '' : ` · ${metricLabel}`}</p>
      <div className="arcade-screen">
        {view === 'challenge' && !challengeReady && <p className="arcade-hint">Loading...</p>}
        {view === 'challenge' && challengeReady && challengeMissing && (
          <p className="arcade-note" role="note">Today's challenge ranking will appear after the database update.</p>
        )}
        {view === 'challenge' && challengeReady && !challengeMissing && challenge.top.length === 0 && (
          <p className="arcade-hint">No scores yet — be the first!</p>
        )}
        {view === 'challenge' && challengeReady && !challengeMissing && challenge.top.length > 0 && (
          <ol className="arcade-list">
            {challenge.top.map((row) => (
              <li key={`${row.alias}-challenge`} className={`arcade-row ${row.isSelf ? 'is-you' : ''} ${row.demo ? 'is-demo' : ''}`}>
                <span className={`arcade-rank${row.rank <= 3 ? ` is-${row.rank}` : ''}`}>{rankLabel(row.rank)}</span>
                <span className="arcade-who">
                  <span className="arcade-name">{row.alias}</span>
                  <span className="arcade-meta">
                    {row.correct}/{row.total} · {formatDuration(row.seconds)}
                    {row.demo ? ' · Fictitious' : ''}
                    {row.isSelf ? ' · You' : ''}
                  </span>
                </span>
                <span className="arcade-score">
                  <span className="arcade-score-main">{formatPercent(row.correct, row.total, true)}</span>
                </span>
              </li>
            ))}
            {challenge.self && (
              <li className="arcade-row is-you">
                <span className="arcade-rank">{rankLabel(challenge.self.rank)}</span>
                <span className="arcade-who">
                  <span className="arcade-name">{challenge.self.alias}</span>
                  <span className="arcade-meta">{challenge.self.correct}/{challenge.self.total} · {formatDuration(challenge.self.seconds)} · You</span>
                </span>
                <span className="arcade-score">
                  <span className="arcade-score-main">{formatPercent(challenge.self.correct, challenge.self.total, true)}</span>
                </span>
              </li>
            )}
          </ol>
        )}
        {view !== 'challenge' && !ready && <p className="arcade-hint">Loading...</p>}
        {view !== 'challenge' && ready && (
          <ol className="arcade-list">
            {board.top.map((row) => <Row key={`${row.alias}-top`} row={row} metric={metric} />)}
            {board.self && <Row key="self-outside" row={board.self} metric={metric} />}
            {board.top.length === 0 && !board.self && (
              <li className="arcade-hint">No scores yet — be the first!</li>
            )}
          </ol>
        )}
      </div>
      {demo && view !== 'challenge' && (
        <p className="arcade-note" role="note">
          Fictitious demo. The names marked Fictitious are not students. Your row uses only your own saved results. These demo rows are not split by level.
        </p>
      )}
      {levelFilter === 'pending' && view !== 'challenge' && (
        <p className="arcade-note" role="note">
          {level} is selected and stays selected on every tab. The shared board still includes every level until the database update for scoreboard_board_level is applied. Daily challenge already filters by level.
        </p>
      )}
      {load?.source === 'live' && load.inAcademy && (
        <p className="arcade-hint">Your academy only, including the owner. A chosen public name is shown.</p>
      )}
      {load?.source === 'live' && !load.inAcademy && (
        <p className="arcade-hint">Individual learners share one scoreboard. Your display name from Profile is shown (never your email).</p>
      )}
      {load?.source === 'owner' && (
        <p className="arcade-hint">Your academy only, including the owner. A chosen public name is shown. This list uses each saved result’s level.</p>
      )}
      {load?.yesterdayPending && view === 'yesterday' && (
        <p className="arcade-note" role="note">
          Yesterday for the whole board needs the database update. This tab shows only your own yesterday until then.
        </p>
      )}
      {view !== 'challenge' && exercisesLeft > 0 && (
        <p className="arcade-hint">Finish {exercisesLeft} more {exercisesLeft === 1 ? 'exercise' : 'exercises'} to appear.</p>
      )}
      {view !== 'challenge' && (
        <p className="arcade-hint">
          {period === 'daily' ? 'Today in Spain.' : 'Yesterday in Spain.'}
          {' '}The date follows Europe/Madrid, including the clock change.
          {' '}{metric === 'accuracy' ? ACCURACY_LINE : VOLUME_LINE}
        </p>
      )}
      {view === 'challenge' && (
        <p className="arcade-hint">Today's daily challenge at {level}, in Spain time. Ranked by percent, then by a shorter time. Most exercises does not apply: each learner has one attempt.</p>
      )}
      </div>
    </div>
  );
}
