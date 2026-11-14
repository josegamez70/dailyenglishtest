import React from 'react';

/** Returns to the previous screen in the app. The browser Back button is separate. */
export function BackButton({
  onClick,
  label = 'Back',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 inline-flex items-center gap-2 rounded-lg border-2 border-slate-900 bg-white px-3 py-2 text-base font-bold text-slate-900 hover:bg-slate-100 dark:border-slate-100 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
    >
      <span aria-hidden="true">←</span>
      {label}
    </button>
  );
}
