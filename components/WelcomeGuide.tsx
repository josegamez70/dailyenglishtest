/** Shown once for a new account. Start uses the usual lesson defaults. */
export function WelcomeGuide({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="mx-auto mb-6 w-full max-w-2xl rounded-xl border-4 border-blue-800 bg-white p-4 text-slate-900 dark:border-blue-300 dark:bg-slate-800 dark:text-slate-50" role="region" aria-label="Welcome">
      <h2 className="text-2xl font-bold">Bienvenida</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-base">
        <li>Elige Reading o Listening.</li>
        <li>Toca las palabras del texto para aprenderlas.</li>
        <li>Repásalas en Vocabulary y en Task packs.</li>
      </ol>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={onStart} className="rounded-lg bg-blue-700 px-4 py-3 text-lg font-bold text-white hover:bg-blue-800">
          Empezar
        </button>
        <button type="button" onClick={onSkip} className="rounded-lg border-2 border-slate-900 px-4 py-3 text-lg font-bold dark:border-slate-100">
          Saltar
        </button>
      </div>
    </div>
  );
}
