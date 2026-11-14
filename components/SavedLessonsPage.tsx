import React, { useEffect, useState } from 'react';
import {
  filterSavedLessons,
  parseSavedGrammarLesson,
  SAVED_LESSON_FILTERS,
  SAVED_LESSON_LIMIT,
  savedLessonBadges,
  type SavedLessonBadge,
  type SavedLessonFilter,
} from '../savedLessonMeta';
import { listSavedLessons, type SavedLessonRow } from '../studyStore';
import { BackButton } from './BackButton';

function badgeClass(badge: SavedLessonBadge): string {
  if (badge.kind === 'task') return 'border-amber-600 text-amber-800 dark:border-amber-300 dark:text-amber-200';
  if (badge.kind === 'level') return 'border-blue-600 text-blue-700 dark:border-blue-300 dark:text-blue-300';
  if (badge.kind === 'format' || badge.kind === 'subtype') return 'border-slate-500 text-slate-800 dark:border-slate-400 dark:text-slate-100';
  if (badge.label === 'Audio') return 'border-purple-600 text-purple-700 dark:border-purple-300 dark:text-purple-300';
  if (badge.label === 'Grammar') return 'border-emerald-600 text-emerald-700 dark:border-emerald-300 dark:text-emerald-300';
  return 'border-teal-600 text-teal-700 dark:border-teal-300 dark:text-teal-300';
}

function badgePrefix(kind: SavedLessonBadge['kind']): string {
  if (kind === 'task') return 'Source: ';
  if (kind === 'level') return 'Level: ';
  if (kind === 'format') return 'Format: ';
  if (kind === 'subtype') return 'Exercise: ';
  return 'Type: ';
}

export function SavedLessonsPage({
  onOpen,
  onCreate,
  onPracticeGrammar,
  onBack,
  initialRows,
}: {
  onOpen: (row: SavedLessonRow) => void;
  onCreate: () => void;
  onPracticeGrammar: () => void;
  onBack?: () => void;
  /** When set, show these rows and skip the database load. */
  initialRows?: SavedLessonRow[];
}) {
  const provided = initialRows != null;
  const [rows, setRows] = useState<SavedLessonRow[]>(initialRows ?? []);
  const [missing, setMissing] = useState(false);
  const [grammarMissing, setGrammarMissing] = useState(false);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [ready, setReady] = useState(provided);
  const [filter, setFilter] = useState<SavedLessonFilter>('all');
  const visible = filterSavedLessons(rows, filter);
  const emptyCopy = SAVED_LESSON_FILTERS.find((item) => item.id === filter)?.empty ?? '';
  const showLessonAction = ready && visible.length === 0 && !missing && filter !== 'grammar';
  const showGrammarAction = ready && visible.length === 0 && !missing && !grammarMissing && filter !== 'reading' && filter !== 'listening';

  useEffect(() => {
    if (provided) return;
    let ignore = false;
    listSavedLessons().then((result) => {
      if (ignore) return;
      setRows(result.rows);
      setMissing(result.missing);
      setGrammarMissing(result.grammarMissing);
      setReady(true);
    }).catch(() => {
      if (!ignore) setReady(true);
    });
    return () => { ignore = true; };
  }, [provided]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      {onBack && <BackButton onClick={onBack} />}
      <h1 className="text-2xl font-bold">Saved lessons</h1>
      <p className="mt-2 text-base">Your latest {SAVED_LESSON_LIMIT} reading and listening lessons, and your latest {SAVED_LESSON_LIMIT} grammar sets. Filter them below. A lesson from Tasks is marked Task. Opening one does not use a free lesson.</p>
      {missing && <p className="mt-3 text-base">Saved lessons will appear after the database update.</p>}
      {grammarMissing && !missing && (
        <p className="mt-3 text-base">Grammar sets will appear here after the database update. Reading and listening lessons are unchanged.</p>
      )}
      {openNote && <p className="mt-3 text-base" role="alert">{openNote}</p>}
      {!ready ? <p className="mt-6 text-base">Loading...</p> : null}
      {ready && (
        <div
          role="tablist"
          aria-label="Saved lesson type"
          className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-slate-300 bg-white p-1 dark:border-slate-600 dark:bg-slate-900 sm:grid-cols-4"
        >
          {SAVED_LESSON_FILTERS.map((item) => {
            const selected = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`saved-filter-${item.id}`}
                aria-selected={selected}
                aria-controls="saved-lesson-panel"
                onClick={() => {
                  setFilter(item.id);
                  setOpenNote(null);
                }}
                className={
                  selected
                    ? 'min-h-11 whitespace-nowrap rounded-lg bg-blue-700 px-2 py-2 text-sm font-bold text-white'
                    : 'min-h-11 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800'
                }
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
      <div id="saved-lesson-panel" role="tabpanel" aria-labelledby={`saved-filter-${filter}`}>
        {ready && visible.length === 0 && !missing && (
          <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
            <p className="text-base">{emptyCopy}</p>
            {(showLessonAction || showGrammarAction) && (
              <div className="mt-3 flex flex-col gap-2">
                {showLessonAction && (
                  <button type="button" onClick={onCreate} className="rounded-lg bg-blue-700 px-4 py-3 text-base font-bold text-white hover:bg-blue-800">
                    Create a lesson
                  </button>
                )}
                {showGrammarAction && (
                  <button type="button" onClick={onPracticeGrammar} className="rounded-lg border-2 border-emerald-700 px-4 py-3 text-base font-bold text-emerald-800 hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-950">
                    Practice grammar
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {visible.length > 0 && (
        <ul className="mt-4 space-y-3">
          {visible.map((row) => {
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
                  onClick={() => {
                    if (row.lesson.mode === 'grammar' && !parseSavedGrammarLesson(row.lesson)) {
                      setOpenNote('This grammar set could not be opened.');
                      return;
                    }
                    setOpenNote(null);
                    onOpen(row);
                  }}
                  className="w-full rounded-lg bg-blue-700 px-4 py-2 text-base font-bold text-white hover:bg-blue-800 sm:w-auto"
                >
                  Open
                </button>
              </li>
            );
          })}
        </ul>
        )}
      </div>
    </div>
  );
}
