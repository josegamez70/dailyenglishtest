import React, { useEffect, useState } from 'react';
import { averagePercent, bestPercent, dayStreak } from '../progressStats';
import { listTestResults, type TestResultRow } from '../studyStore';

function ScoreChart({ scores }: { scores: number[] }) {
  if (!scores.length) return null;
  const width = 320;
  const height = 120;
  const step = scores.length === 1 ? 0 : width / (scores.length - 1);
  const points = scores.map((score, index) => {
    const x = index * step;
    const y = height - (Math.max(0, Math.min(100, score)) / 100) * (height - 8) - 4;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-32 w-full" role="img" aria-label="Last 10 scores">
      <polyline fill="none" stroke="currentColor" strokeWidth="3" points={points} className="text-blue-700 dark:text-blue-300" />
    </svg>
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
                <span className="block text-sm text-slate-600 dark:text-slate-300">{new Date(row.created_at).toLocaleString()}</span>
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
