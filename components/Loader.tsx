import React from 'react';

interface LoaderProps {
  elapsedSeconds: number;
  estimateSeconds: number;
  note?: string | null;
  onCancel: () => void;
}

function progressPercent(elapsedSeconds: number, estimateSeconds: number): number {
  const estimate = Math.max(estimateSeconds, 1);
  if (elapsedSeconds <= estimate) return Math.round((elapsedSeconds / estimate) * 85);
  return Math.min(96, 85 + Math.round((elapsedSeconds - estimate) * 2));
}

function phaseMessage(elapsedSeconds: number, estimateSeconds: number, note?: string | null): string {
  if (note) return note;
  const ratio = elapsedSeconds / Math.max(estimateSeconds, 1);
  if (ratio < 0.35) return 'Writing your story...';
  if (ratio < 0.75) return 'Writing the questions...';
  return 'Almost ready...';
}

const Loader: React.FC<LoaderProps> = ({ elapsedSeconds, estimateSeconds, note, onCancel }) => {
  const low = Math.max(8, estimateSeconds - 5);
  const high = estimateSeconds + 5;
  const percent = progressPercent(elapsedSeconds, estimateSeconds);

  return (
    <div
      className="fixed inset-0 bg-slate-900/80 flex flex-col items-center justify-center z-50 px-6"
      role="alertdialog"
      aria-busy="true"
      aria-label="Creating your lesson"
    >
      <div className="w-16 h-16 border-4 border-blue-300 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-white text-xl font-semibold mt-5 text-center">{phaseMessage(elapsedSeconds, estimateSeconds, note)}</p>
      <p className="text-slate-100 text-base mt-2 text-center">
        This usually takes about {low}–{high} seconds.
      </p>
      <p className="text-slate-100 text-base mt-1">Time so far: {elapsedSeconds}s</p>
      <div
        className="mt-4 w-full max-w-sm h-3 rounded-full bg-slate-700 overflow-hidden"
        role="progressbar"
        aria-label="Lesson progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full bg-blue-400 transition-all" style={{ width: `${percent}%` }}></div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="mt-6 bg-white text-slate-900 font-bold text-lg px-6 py-3 rounded-lg hover:bg-slate-100"
      >
        Cancel
      </button>
      <p className="text-slate-100 text-base mt-2 text-center">Cancel and return to the setup screen.</p>
    </div>
  );
};

export default Loader;
