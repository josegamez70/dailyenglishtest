import React, { useEffect, useState } from 'react';
import { listSavedLessons, type SavedLessonRow } from '../studyStore';

export function SavedLessonsPage({ onOpen, onCreate }: { onOpen: (lesson: Record<string, unknown>) => void; onCreate: () => void }) {
  const [rows, setRows] = useState<SavedLessonRow[]>([]);
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let ignore = false;
    listSavedLessons().then((result) => {
      if (ignore) return;
      setRows(result.rows);
      setMissing(result.missing);
      setReady(true);
    }).catch(() => {
      if (!ignore) setReady(true);
    });
    return () => { ignore = true; };
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-bold">Saved lessons</h1>
      <p className="mt-2 text-base">Your latest 5 lessons. Opening one does not use a free lesson.</p>
      {missing && <p className="mt-3 text-base">Saved lessons will appear after the database update.</p>}
      {!ready ? <p className="mt-6 text-base">Loading...</p> : null}
      {ready && rows.length === 0 && !missing && (
        <button type="button" onClick={onCreate} className="mt-4 rounded-lg bg-blue-700 px-4 py-3 text-base font-bold text-white hover:bg-blue-800">
          Create a lesson
        </button>
      )}
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-2 rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold">{row.title}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{new Date(row.created_at).toLocaleString()}</p>
            </div>
            <button
              type="button"
              onClick={() => onOpen(row.lesson)}
              className="rounded-lg bg-blue-700 px-4 py-2 text-base font-bold text-white hover:bg-blue-800"
            >
              Open
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
