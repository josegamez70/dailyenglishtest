import { useState } from 'react';
import { translateToSpanish } from '../contextDefine';

/** On-demand Spanish for one explanation. The text is cached after the first request. */
export function SpanishWhy({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [spanish, setSpanish] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (spanish != null) {
      setOpen(true);
      return;
    }
    setBusy(true);
    void translateToSpanish(text).then((line) => {
      setSpanish(line || 'No translation yet.');
      setOpen(true);
      setBusy(false);
    });
  };
  return (
    <div className="mt-3">
      <button type="button" onClick={toggle} className="rounded-lg border-2 border-slate-900 px-3 py-2 text-base font-bold dark:border-slate-100">
        {busy ? 'Translating...' : open ? 'Hide Spanish' : 'Ver en español'}
      </button>
      {open && spanish && <p className="mt-2 text-base">{spanish}</p>}
    </div>
  );
}
