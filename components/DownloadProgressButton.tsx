import React, { useEffect, useState } from 'react';
import type { ReportTest } from '../progressReport';

export function DownloadProgressButton({
  studentName,
  profileLevel,
  tests,
  disabled = false,
}: {
  studentName: string;
  profileLevel?: string | null;
  tests: ReportTest[];
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void import('../progressPdf');
  }, []);

  const onClick = () => {
    if (busy || disabled) return;
    setBusy(true);
    setFailed(false);
    void import('../progressPdf')
      .then(({ downloadProgressPdf }) => downloadProgressPdf({ studentName, profileLevel, tests }))
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-700 px-4 py-2.5 text-base font-bold text-white hover:bg-blue-800 disabled:opacity-60 sm:w-auto"
      >
        {busy ? 'Preparing PDF...' : 'Download PDF'}
      </button>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-red-800 dark:text-red-300">
          Could not create the PDF. Try again.
        </p>
      )}
    </div>
  );
}
