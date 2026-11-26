import { useState } from 'react';
import { translateToSpanish } from '../contextDefine';

/** English line shown as soon as an answer is checked. */
export function answerStatus(correct: boolean, answer?: string): string {
  if (correct) return 'Correct.';
  return answer ? `Incorrect. The answer is ${answer}.` : 'Incorrect.';
}

/** On-demand Spanish for one explanation. A successful line is cached. A failure can be tried again. */
export function SpanishWhy({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [spanish, setSpanish] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const request = () => {
    setBusy(true);
    setFailed(false);
    setOpen(true);
    void translateToSpanish(text).then((line) => {
      if (line) {
        setSpanish(line);
        setFailed(false);
      } else {
        setSpanish(null);
        setFailed(true);
      }
      setBusy(false);
    });
  };

  const toggle = () => {
    if (busy) return;
    if (open && spanish) {
      setOpen(false);
      return;
    }
    if (spanish) {
      setOpen(true);
      return;
    }
    request();
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-busy={busy}
        className="rounded-lg border-2 border-slate-900 px-3 py-2 text-base font-bold disabled:opacity-70 dark:border-slate-100"
      >
        {busy ? 'Translating...' : open && spanish ? 'Hide Spanish' : failed ? 'Try again' : 'Ver en español'}
      </button>
      {open && busy && <p className="mt-2 text-base" role="status">Translating...</p>}
      {open && spanish && <p className="mt-2 text-base">{spanish}</p>}
      {open && failed && !busy && <p className="mt-2 text-base" role="alert">Could not translate this. Try again.</p>}
    </div>
  );
}
