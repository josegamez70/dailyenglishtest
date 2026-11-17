import { FREE_LIMIT_MESSAGE } from '../freeLessons';

/** Shown before a lesson or task pack starts when a free account has nothing left. */
export function FreeLimitNotice({ onPlans }: { onPlans: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto mb-4 w-full max-w-2xl rounded-xl border-4 border-amber-800 bg-amber-50 px-4 py-4 text-slate-900"
    >
      <p className="text-xl font-bold">No free lessons left</p>
      <p className="mt-2 text-base">{FREE_LIMIT_MESSAGE}</p>
      <button
        type="button"
        onClick={onPlans}
        className="mt-4 rounded-lg bg-blue-700 px-4 py-3 text-lg font-bold text-white hover:bg-blue-800"
      >
        See plans
      </button>
    </div>
  );
}
