import { useEffect, useMemo, useState } from 'react';
import { loadChallengeBoard, loadChallengePack, submitChallenge, type ChallengePack, type ChallengeQuiz } from '../dailyChallengeClient';
import { challengeRank, formatDuration, type ChallengeEntry, type ChallengeLevel, type ChallengeReportItem } from '../dailyChallenge';
import { weightedPercent } from '../scoreboard';
import { recordScoredLesson } from '../legendsRecord';
import type { GrammarItem } from '../grammarSet';
import { BackButton } from './BackButton';
import { ChallengeRankTable } from './ChallengeRankTable';

type PartId = 'reading' | 'listening' | 'grammar';

type PreviewPack = {
  day: string;
  level: ChallengeLevel;
  startedAt: string;
  reading: { title: string; topic: string; story: string; quiz: ChallengeQuiz[] };
  listening: { title: string; topic: string; audioUrl: string | null; quiz: ChallengeQuiz[] };
  grammar: { title: string; exercise: string; items: GrammarItem[] };
  result?: {
    correct: number;
    total: number;
    seconds: number;
    position: number | null;
    missing: boolean;
    report?: ChallengeReportItem[] | null;
  };
  ranking?: ChallengeEntry[];
};

function placeLabel(position: number): string {
  if (position === 1) return '1st';
  if (position === 2) return '2nd';
  if (position === 3) return '3rd';
  return `${position}th`;
}

function shuffle<T>(items: readonly T[], seed: string): T[] {
  const copy = [...items];
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    const held = copy[index];
    copy[index] = copy[swap];
    copy[swap] = held;
  }
  return copy;
}

function ChoiceList({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      {options.map((option) => (
        <label key={option} className="flex min-h-11 items-start gap-2 border-2 border-slate-900 bg-white px-3 py-2 text-base text-slate-900">
          <input type="radio" name={name} checked={value === option} onChange={() => onChange(option)} />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}

export function DailyChallengePage({
  onBack,
  preview,
  startPart = null,
}: {
  onBack?: () => void;
  preview?: PreviewPack;
  startPart?: PartId | null;
}) {
  const [pack, setPack] = useState<ChallengePack | null>(preview ? {
    ok: true,
    missing: false,
    day: preview.day,
    level: preview.level,
    startedAt: preview.startedAt,
    submitted: preview.result ? {
      correct: preview.result.correct,
      total: preview.result.total,
      seconds: preview.result.seconds,
      readingCorrect: 0,
      listeningCorrect: 0,
      grammarCorrect: 0,
      readingTotal: preview.reading.quiz.length,
      listeningTotal: preview.listening.quiz.length,
      grammarTotal: preview.grammar.items.length,
      position: preview.result.position,
      report: preview.result.report ?? null,
      answersStored: Boolean(preview.result.report?.length),
    } : null,
    reading: preview.reading,
    listening: preview.listening,
    grammar: preview.grammar,
  } : null);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<PartId | null>(startPart);
  const [readingAnswers, setReadingAnswers] = useState<string[]>([]);
  const [listeningAnswers, setListeningAnswers] = useState<string[]>([]);
  const [grammarAnswers, setGrammarAnswers] = useState<(string | string[])[]>([]);
  const [finished, setFinished] = useState<Record<PartId, boolean>>({ reading: false, listening: false, grammar: false });
  const [partScores, setPartScores] = useState<Record<PartId, number>>({ reading: 0, listening: 0, grammar: 0 });
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [localResult, setLocalResult] = useState<PreviewPack['result'] | null>(preview?.result ?? null);
  const [ranking, setRanking] = useState<ChallengeEntry[]>(preview?.ranking ?? []);
  const [rankingMissing, setRankingMissing] = useState(false);

  useEffect(() => {
    if (preview) return undefined;
    let ignore = false;
    loadChallengePack().then((next) => {
      if (ignore) return;
      if (!next.ok) {
        setMessage(next.message);
        return;
      }
      setPack(next);
      if (next.submitted) {
        setLocalResult({
          correct: next.submitted.correct,
          total: next.submitted.total,
          seconds: next.submitted.seconds,
          position: next.submitted.position,
          missing: next.missing,
          report: next.submitted.report,
        });
      }
    }).catch(() => {
      if (!ignore) setMessage('The challenge could not be loaded.');
    });
    return () => { ignore = true; };
  }, [preview]);

  useEffect(() => {
    if (preview) {
      setRanking(preview.ranking ?? []);
      setRankingMissing(false);
      return undefined;
    }
    if (!pack?.level) return undefined;
    let ignore = false;
    loadChallengeBoard(pack.level).then((next) => {
      if (ignore) return;
      setRanking(next.rows);
      setRankingMissing(next.missing);
    }).catch(() => {
      if (!ignore) setRankingMissing(true);
    });
    return () => { ignore = true; };
  }, [preview, pack?.level, localResult]);

  useEffect(() => {
    if (preview || rankingMissing || !localResult || localResult.position != null) return;
    const place = challengeRank(ranking);
    if (place == null) return;
    setLocalResult((current) => (current && current.position == null ? { ...current, position: place } : current));
  }, [preview, ranking, rankingMissing, localResult]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const startedAt = pack?.startedAt;
  useEffect(() => {
    if (preview || !pack || pack.startedAt || !pack.day) return;
    const key = `daily-challenge-start:${pack.day}`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, new Date().toISOString());
  }, [pack, preview]);

  const clockStart = startedAt || (pack ? localStorage.getItem(`daily-challenge-start:${pack.day}`) : null);
  const liveSeconds = clockStart ? Math.max(0, Math.floor((now - Date.parse(clockStart)) / 1000)) : 0;
  const orderSeeds = useMemo(() => pack?.day ?? 'day', [pack?.day]);

  if (!pack) {
    return (
      <div className="challenge-flow">
        {onBack && <BackButton onClick={onBack} />}
        <h1>Daily challenge</h1>
        <p className="mt-3">{message ?? 'Loading today’s challenge...'}</p>
      </div>
    );
  }

  const reading = pack.reading;
  const listening = pack.listening;
  const grammar = pack.grammar;
  if (!reading || !listening || !grammar) {
    return (
      <div className="challenge-flow">
        {onBack && <BackButton onClick={onBack} />}
        <h1>Daily challenge</h1>
        <p className="mt-3">{message ?? "Today's challenge is not ready yet."}</p>
      </div>
    );
  }

  const result = localResult;
  const allDone = finished.reading && finished.listening && finished.grammar;

  const finishReading = () => {
    if (readingAnswers.length < reading.quiz.length || readingAnswers.some((answer) => !answer)) return;
    const score = reading.quiz.reduce((sum, item, index) => sum + (readingAnswers[index] === item.correctAnswer ? 1 : 0), 0);
    setPartScores((current) => ({ ...current, reading: score }));
    setFinished((current) => ({ ...current, reading: true }));
    setOpen(null);
  };
  const finishListening = () => {
    if (listeningAnswers.length < listening.quiz.length || listeningAnswers.some((answer) => !answer)) return;
    const score = listening.quiz.reduce((sum, item, index) => sum + (listeningAnswers[index] === item.correctAnswer ? 1 : 0), 0);
    setPartScores((current) => ({ ...current, listening: score }));
    setFinished((current) => ({ ...current, listening: true }));
    setOpen(null);
  };
  const finishGrammar = () => {
    const complete = grammar.items.every((item, index) => {
      const answer = grammarAnswers[index];
      if (item.kind === 'order') return Array.isArray(answer) && answer.length === item.chunks.length;
      return typeof answer === 'string' && answer.length > 0;
    });
    if (!complete) return;
    let score = 0;
    grammar.items.forEach((item, index) => {
      const answer = grammarAnswers[index];
      if (item.kind === 'order') {
        const chosen = Array.isArray(answer) ? answer : [];
        if (chosen.length === item.chunks.length && chosen.every((text, place) => text === item.chunks[place])) score += 1;
      } else if (answer === item.correctAnswer) score += 1;
    });
    setPartScores((current) => ({ ...current, grammar: score }));
    setFinished((current) => ({ ...current, grammar: true }));
    setOpen(null);
  };

  const save = async () => {
    if (preview) return;
    setSaving(true);
    const saved = await submitChallenge({ reading: readingAnswers, listening: listeningAnswers, grammar: grammarAnswers });
    setSaving(false);
    if (!saved.ok) {
      setMessage(saved.message ?? 'The result could not be saved.');
      return;
    }
    let position = saved.position;
    if (!saved.missing) {
      const board = await loadChallengeBoard(pack.level);
      if (!board.missing) {
        setRanking(board.rows);
        setRankingMissing(false);
        position = challengeRank(board.rows) ?? position;
      }
    }
    setLocalResult({
      correct: saved.correct,
      total: saved.total,
      seconds: saved.missing ? liveSeconds : saved.seconds,
      position,
      missing: saved.missing,
      report: saved.report ?? null,
    });
    if (saved.recorded) {
      void recordScoredLesson('reading', reading.quiz.map((item) => `${item.question}\n${item.correctAnswer}`), saved.readingCorrect, saved.readingTotal);
      void recordScoredLesson('listening', listening.quiz.map((item) => `${item.question}\n${item.correctAnswer}`), saved.listeningCorrect, saved.listeningTotal);
      void recordScoredLesson('grammar', grammar.items.map((item) => (
        item.kind === 'order' ? `${item.prompt}\n${item.chunks.join(' ')}` : `${item.prompt}\n${item.correctAnswer}`
      )), saved.grammarCorrect, saved.grammarTotal);
    }
  };

  if (result) {
    const percent = weightedPercent(result.correct, result.total);
    return (
      <div className="challenge-flow">
        {onBack && <BackButton onClick={onBack} />}
        <h1>Daily challenge</h1>
        <p className="mt-2">{pack.level} · {pack.day}</p>
        <section className="mt-4 border-2 border-slate-900 bg-white p-4 text-slate-900" aria-label="Challenge result">
          <p className="text-3xl font-bold">You scored {result.correct} out of {result.total}{percent == null ? '' : ` (${percent}%)`}.</p>
          <p className="mt-2">Time {formatDuration(result.seconds)}.</p>
          {result.position != null ? (
            <p className="mt-2">You are {placeLabel(result.position)} at {pack.level} today.</p>
          ) : result.missing || rankingMissing ? (
            <p className="mt-2">Your place on the board will show after the database update.</p>
          ) : null}
          <p className="mt-3">This is practice. It is not a certificate.</p>
          {result.report?.length ? (
            <ol className="mt-4 flex list-none flex-col gap-4 p-0">
              {result.report.map((item, index) => (
                <li key={`${item.part}-${index}`} className={`border-2 p-3 ${item.correct ? 'border-green-700' : 'border-red-700'}`}>
                  <p className="font-bold">{index + 1}. {item.part[0].toUpperCase()}{item.part.slice(1)}</p>
                  <p className="mt-1">{item.question}</p>
                  <p className="mt-2">Your answer: {item.userAnswer}</p>
                  <p>Correct answer: {item.correctAnswer}</p>
                  <p className="font-bold">{item.correct ? 'Correct' : 'Incorrect'}</p>
                  {item.why && <p className="mt-2">Why: {item.why}</p>}
                </li>
              ))}
            </ol>
          ) : result.missing ? (
            <p className="mt-3">The question-by-question report will be kept after the database update.</p>
          ) : null}
        </section>
        <ChallengeRankTable rows={ranking} level={pack.level} missing={rankingMissing} />
      </div>
    );
  }

  return (
    <div className="challenge-flow">
      {onBack && open == null && <BackButton onClick={onBack} />}
      {open != null && <BackButton onClick={() => setOpen(null)} />}
      <h1 className="text-2xl font-bold">Daily challenge</h1>
      <p className="mt-2 text-base">{pack.level} · {pack.day} · {formatDuration(liveSeconds)}</p>
      <p className="mt-2 text-sm">One scored attempt today. The clock starts when you open the challenge and does not reset if you refresh.</p>
      {pack.missing && (
        <p className="mt-3 border-2 border-slate-900 bg-amber-100 px-3 py-2 text-base text-slate-900" role="note">
          The official attempt will be saved after the database update. You can still try today's three parts.
        </p>
      )}
      {open == null && (
        <div className="mt-4 flex flex-col gap-3">
          {([
            ['reading', 'Reading', reading.title, false, finished.reading],
            ['listening', 'Listening', listening.title, !finished.reading, finished.listening],
            ['grammar', 'Grammar', grammar.title, !finished.listening, finished.grammar],
          ] as const).map(([id, label, title, locked, done], index) => (
            <button
              key={id}
              type="button"
              disabled={locked}
              onClick={() => setOpen(id)}
              className="flex min-h-11 flex-col items-start border-2 border-slate-900 bg-white px-3 py-3 text-left text-slate-900 disabled:opacity-60"
            >
              <span className="text-lg font-bold">{index + 1}. {label}</span>
              <span className="text-base">{title}</span>
              <span className="text-sm">{done ? `Done · ${partScores[id]} correct` : locked ? 'Locked' : 'Ready'}</span>
            </button>
          ))}
          {allDone && !preview && (
            <button type="button" disabled={saving} onClick={() => { void save(); }} className="min-h-11 bg-blue-700 px-3 py-3 text-lg font-bold text-white disabled:opacity-60">
              {saving ? 'Saving...' : 'See result'}
            </button>
          )}
          <ChallengeRankTable rows={ranking} level={pack.level} missing={rankingMissing} />
        </div>
      )}
      {open === 'reading' && (
        <section className="mt-4" aria-label="Reading challenge">
          <h2 className="text-xl font-bold">{reading.title}</h2>
          <p className="mt-1 text-sm">{reading.topic}</p>
          <p className="mt-3 whitespace-pre-wrap text-base">{reading.story}</p>
          {reading.quiz.map((item, index) => (
            <fieldset key={item.question} className="mt-4">
              <legend className="text-base font-semibold">{index + 1}. {item.question}</legend>
              <ChoiceList name={`reading-${index}`} options={item.options} value={readingAnswers[index] ?? ''} onChange={(next) => {
                setReadingAnswers((current) => {
                  const copy = [...current];
                  copy[index] = next;
                  return copy;
                });
              }} />
            </fieldset>
          ))}
          <button type="button" onClick={finishReading} className="mt-4 min-h-11 w-full bg-blue-700 py-3 text-lg font-bold text-white">Finish reading</button>
        </section>
      )}
      {open === 'listening' && (
        <section className="mt-4" aria-label="Listening challenge">
          <h2 className="text-xl font-bold">{listening.title}</h2>
          <p className="mt-1 text-sm">{listening.topic}</p>
          {listening.audioUrl ? (
            <audio className="mt-3 w-full" controls src={listening.audioUrl} />
          ) : (
            <p className="mt-3 text-base">The audio is not ready.</p>
          )}
          {listening.quiz.map((item, index) => (
            <fieldset key={item.question} className="mt-4">
              <legend className="text-base font-semibold">{index + 1}. {item.question}</legend>
              <ChoiceList name={`listening-${index}`} options={item.options} value={listeningAnswers[index] ?? ''} onChange={(next) => {
                setListeningAnswers((current) => {
                  const copy = [...current];
                  copy[index] = next;
                  return copy;
                });
              }} />
            </fieldset>
          ))}
          <button type="button" onClick={finishListening} className="mt-4 min-h-11 w-full bg-blue-700 py-3 text-lg font-bold text-white">Finish listening</button>
        </section>
      )}
      {open === 'grammar' && (
        <section className="mt-4" aria-label="Grammar challenge">
          <h2 className="text-xl font-bold">{grammar.title}</h2>
          {grammar.items.map((item, index) => (
            <fieldset key={item.prompt} className="mt-4">
              <legend className="text-base font-semibold">{index + 1}. {item.prompt}</legend>
              {item.kind === 'order' ? (
                <OrderAnswer
                  seed={`${orderSeeds}-${index}`}
                  chunks={item.chunks}
                  value={Array.isArray(grammarAnswers[index]) ? grammarAnswers[index] as string[] : []}
                  onChange={(next) => {
                    setGrammarAnswers((current) => {
                      const copy = [...current];
                      copy[index] = next;
                      return copy;
                    });
                  }}
                />
              ) : (
                <ChoiceList
                  name={`grammar-${index}`}
                  options={item.options}
                  value={typeof grammarAnswers[index] === 'string' ? grammarAnswers[index] as string : ''}
                  onChange={(next) => {
                    setGrammarAnswers((current) => {
                      const copy = [...current];
                      copy[index] = next;
                      return copy;
                    });
                  }}
                />
              )}
            </fieldset>
          ))}
          <button type="button" onClick={finishGrammar} className="mt-4 min-h-11 w-full bg-blue-700 py-3 text-lg font-bold text-white">Finish grammar</button>
        </section>
      )}
    </div>
  );
}

function OrderAnswer({
  seed,
  chunks,
  value,
  onChange,
}: {
  seed: string;
  chunks: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const pool = useMemo(() => shuffle(chunks, seed).filter((chunk) => !value.includes(chunk) || value.filter((item) => item === chunk).length < chunks.filter((item) => item === chunk).length), [chunks, seed, value]);
  const remaining = chunks.filter((chunk) => {
    const used = value.filter((item) => item === chunk).length;
    const have = chunks.filter((item) => item === chunk).length;
    return used < have;
  });
  return (
    <div className="mt-2">
      <p className="min-h-11 border-2 border-slate-900 bg-white px-3 py-2 text-base text-slate-900">{value.join(' ') || 'Tap the pieces in order.'}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {remaining.map((chunk, index) => (
          <button key={`${chunk}-${index}`} type="button" onClick={() => onChange([...value, chunk])} className="border-2 border-slate-900 bg-white px-3 py-2 text-base text-slate-900">
            {chunk}
          </button>
        ))}
      </div>
      {value.length > 0 && (
        <button type="button" onClick={() => onChange(value.slice(0, -1))} className="mt-2 text-sm font-semibold underline">Undo</button>
      )}
      <span className="sr-only">{pool.length}</span>
    </div>
  );
}
