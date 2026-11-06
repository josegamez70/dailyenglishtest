import React, { useEffect, useState } from 'react';
import { savedLessonBadges, type SavedLessonBadge } from '../savedLessonMeta';
import { listSavedLessons, type SavedLessonRow } from '../studyStore';

function badgeClass(badge: SavedLessonBadge): string {
  if (badge.kind === 'level') return 'border-blue-600 text-blue-700 dark:border-blue-300 dark:text-blue-300';
  if (badge.kind === 'format') return 'border-slate-500 text-slate-800 dark:border-slate-400 dark:text-slate-100';
  if (badge.label === 'Audio') return 'border-purple-600 text-purple-700 dark:border-purple-300 dark:text-purple-300';
  return 'border-teal-600 text-teal-700 dark:border-teal-300 dark:text-teal-300';
}

function badgePrefix(kind: SavedLessonBadge['kind']): string {
  if (kind === 'level') return 'Level: ';
  if (kind === 'format') return 'Format: ';
  return 'Type: ';
}

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
        {rows.map((row) => {
          const badges = savedLessonBadges(row.lesson);
          return (
            <li key={row.id} className="flex flex-col gap-3 rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-base font-semibold">{row.title}</p>
                {badges.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {badges.map((badge) => (
                      <span
                        key={`${badge.kind}-${badge.label}`}
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClass(badge)}`}
                      >
                        <span className="sr-only">{badgePrefix(badge.kind)}</span>
                        {badge.label}
                      </span>
                    ))}
                  </p>
                )}
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{new Date(row.created_at).toLocaleString()}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpen(row.lesson)}
                className="w-full rounded-lg bg-blue-700 px-4 py-2 text-base font-bold text-white hover:bg-blue-800 sm:w-auto"
              >
                Open
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
