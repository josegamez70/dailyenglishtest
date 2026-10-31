import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { averagePercent, bestPercent, chartX, chartY, dayStreak, formatResultDate } from '../progressStats';
import { listTestResults, type TestResultRow } from '../studyStore';

const GUIDE_SCORES = [100, 50, 0];

export function ScoreChart({ scores }: { scores: number[] }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = plotRef.current;
    if (!el) return undefined;
    const apply = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      setBox((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    apply();
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', apply);
      return () => window.removeEventListener('resize', apply);
    }
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!scores.length) return null;
  const { width, height } = box;
  const line = width > 0 && height > 0
    ? scores.map((score, index) => `${(chartX(index, scores.length) / 100) * width},${(chartY(score) / 100) * height}`).join(' ')
    : '';

  return (
    <div className="relative mt-3 h-40 w-full" role="img" aria-label={`Last 10 scores: ${scores.join(', ')}`}>
      <div className="absolute inset-y-0 left-0 w-10">
        {GUIDE_SCORES.map((mark) => (
          <span
            key={mark}
            className="absolute right-1 -translate-y-1/2 text-[11px] leading-none text-slate-500 dark:text-slate-400"
            style={{ top: `${chartY(mark)}%` }}
          >
            {mark}%
          </span>
        ))}
      </div>
      <div ref={plotRef} className="absolute inset-y-0 left-10 right-0">
        {width > 0 && height > 0 && (
          <svg viewBox={`0 0 ${width} ${height}`} className="block h-full w-full">
            {GUIDE_SCORES.map((mark) => {
              const y = (chartY(mark) / 100) * height;
              return (
                <line
                  key={mark}
                  x1="0"
                  x2={width}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-slate-300 dark:text-slate-600"
                />
              );
            })}
            {scores.length > 1 && (
              <polyline
                fill="none"
                points={line}
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                className="text-blue-700 dark:text-blue-300"
              />
            )}
          </svg>
        )}
        {scores.map((score, index) => {
          const x = chartX(index, scores.length);
          const y = chartY(score);
          return (
            <div key={`${index}-${score}`}>
              <span
                className="absolute z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-700 dark:bg-blue-300"
                style={{ left: `${x}%`, top: `${y}%` }}
              />
              <span
                className="absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap pb-1 text-[11px] font-semibold leading-none text-slate-800 dark:text-slate-100"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                {score}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProgressPage({ onCreate }: { onCreate: () => void }) {
  const [rows, setRows] = useState<TestResultRow[]>([]);
  const [missing, setMissing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let ignore = false;
    listTestResults().then((result) => {
      if (ignore) return;
      setRows(result.rows);
      setMissing(result.missing);
      setReady(true);
    }).catch(() => {
      if (!ignore) setReady(true);
    });
    return () => { ignore = true; };
  }, []);

  const dates = rows.map((row) => new Date(row.created_at));
  const lastTen = [...rows].slice(0, 10).reverse();
  const scores = lastTen.map((row) => (row.total ? Math.round((row.score / row.total) * 100) : 0));

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-bold">My progress</h1>
      {missing && <p className="mt-3 text-base">Progress will appear after the database update.</p>}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Tests done', String(rows.length)],
          ['Average score', `${averagePercent(rows)}%`],
          ['Day streak', String(dayStreak(dates))],
          ['Best score', `${bestPercent(rows)}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-300 bg-white p-3 dark:border-slate-600 dark:bg-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-300">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      {scores.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
          <p className="text-sm font-semibold">Last 10 scores</p>
          <ScoreChart scores={scores} />
        </div>
      )}
      {!ready ? <p className="mt-6 text-base">Loading...</p> : null}
      {ready && rows.length === 0 && !missing && (
        <div className="mt-6">
          <p className="text-base">You have not finished a test yet.</p>
          <button type="button" onClick={onCreate} className="mt-3 rounded-lg bg-blue-700 px-4 py-3 text-base font-bold text-white hover:bg-blue-800">
            Create a lesson
          </button>
        </div>
      )}
      <ul className="mt-6 space-y-3">
        {rows.map((row) => {
          const percent = row.total ? Math.round((row.score / row.total) * 100) : 0;
          const open = openId === row.id;
          return (
            <li key={row.id} className="rounded-xl border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : row.id)}
                className="w-full px-4 py-3 text-left"
              >
                <span className="block text-sm text-slate-600 dark:text-slate-300">{formatResultDate(row.created_at)}</span>
                <span className="mt-1 block text-base font-semibold">{row.title || row.topic} · {row.level} · {row.score}/{row.total} ({percent}%)</span>
              </button>
              {open && (
                <div className="space-y-2 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-600">
                  {row.wrong_answers.length === 0 && <p>No wrong answers.</p>}
                  {row.wrong_answers.map((item, index) => (
                    <p key={index}>
                      <span className="font-semibold">{item.question}</span>
                      <br />
                      Your answer: {item.userAnswer || '—'}
                      <br />
                      Correct answer: {item.correctAnswer}
                    </p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
