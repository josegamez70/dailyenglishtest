/** Shown once for a new account. Start uses the usual lesson defaults. */
export function WelcomeGuide({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="mx-auto mb-6 w-full max-w-2xl rounded-xl border-4 border-blue-800 bg-white p-4 text-slate-900 dark:border-blue-300 dark:bg-slate-800 dark:text-slate-50" role="region" aria-label="Welcome">
      <h2 className="text-2xl font-bold">Welcome</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-base">
        <li>Choose Reading or Listening.</li>
        <li>Tap words in the text to learn them.</li>
        <li>Review them in Vocabulary and Task packs.</li>
      </ol>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={onStart} className="rounded-lg bg-blue-700 px-4 py-3 text-lg font-bold text-white hover:bg-blue-800">
          Start
        </button>
        <button type="button" onClick={onSkip} className="rounded-lg border-2 border-slate-900 px-4 py-3 text-lg font-bold dark:border-slate-100">
          Skip
        </button>
      </div>
    </div>
  );
}
