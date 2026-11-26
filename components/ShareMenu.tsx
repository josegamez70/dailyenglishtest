import { useEffect, useRef, useState } from 'react';
import { claimUsername } from '../usernameClaim';
import { profileHandle } from '../profileHandle';

export type ShareLink = { line: string; url: string };

/** Share stays closed until the learner has a saved unique @. Nothing is sent by this site. */
export function ShareMenu({
  handle,
  onHandle,
  linkFor,
  prepare,
}: {
  handle: string;
  onHandle: (handle: string) => void;
  linkFor: (handle: string) => ShareLink | null;
  /** Stores this exercise's audio before the link is offered. */
  prepare?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState(!prepare);
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const prepareOnce = useRef(false);
  const saved = profileHandle(handle);
  useEffect(() => {
    if (!open) {
      prepareOnce.current = false;
      return;
    }
    if (!saved) return;
    const run = prepareRef.current;
    if (!run) {
      setPrepared(true);
      return;
    }
    if (prepareOnce.current) return;
    prepareOnce.current = true;
    setPrepared(false);
    void run().finally(() => setPrepared(true));
  }, [open, saved]);
  const ready = open && saved && prepared ? linkFor(saved) : null;
  const whatsApp = ready ? `https://wa.me/?text=${encodeURIComponent(`${ready.line}\n${ready.url}`)}` : '';
  const email = ready ? `mailto:?subject=${encodeURIComponent('Can you beat my English score?')}&body=${encodeURIComponent(`${ready.line}\n\n${ready.url}`)}` : '';
  const native = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const saveName = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const result = await claimUsername(draft);
    setBusy(false);
    if (!result.ok) {
      setNote(result.message);
      return;
    }
    onHandle(result.handle);
    setDraft('');
    setNote(null);
  };

  return (
    <div className="share-menu">
      <button
        type="button"
        onClick={() => { setOpen((current) => !current); setNote(null); }}
        className="w-full rounded-lg border-2 border-slate-900 bg-white px-4 py-3 text-lg font-bold text-slate-900 hover:bg-slate-100 dark:border-slate-100 dark:bg-slate-900 dark:text-slate-50"
      >
        {open ? 'Hide share' : 'Share'}
      </button>
      {open && !saved && (
        <form className="mt-2 flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); void saveName(); }}>
          <label className="text-base font-bold" htmlFor="share-username">Choose a username</label>
          <p className="text-base">You need a unique @ before you can share. Use 3 to 24 letters, numbers, or underscores.</p>
          <input
            id="share-username"
            value={draft}
            maxLength={24}
            autoComplete="off"
            placeholder="JmgamezBest"
            onChange={(event) => setDraft(event.target.value.slice(0, 24))}
            className="w-full rounded-lg border-2 border-slate-900 px-3 py-3 text-lg text-slate-900"
          />
          <button type="submit" disabled={busy} className="rounded-lg bg-blue-700 px-4 py-3 text-lg font-bold text-white disabled:opacity-60">
            {busy ? 'Saving...' : 'Save username'}
          </button>
          {note && <p className="text-base" role="alert">{note}</p>}
        </form>
      )}
      {open && saved && !prepared && <p className="mt-2 text-base">Preparing the audio...</p>}
      {open && saved && prepared && !ready && <p className="mt-2 text-base">This exercise is too long to share as a link.</p>}
      {open && ready && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-base">{ready.line}</p>
          {native && (
            <button
              type="button"
              onClick={() => {
                void navigator.share({ title: 'Daily English Test', text: ready.line, url: ready.url }).catch((error: unknown) => {
                  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: string }).name) : '';
                  if (name === 'AbortError') return;
                  setNote('Use WhatsApp or email instead.');
                });
              }}
              className="rounded-lg bg-blue-700 px-4 py-3 text-lg font-bold text-white hover:bg-blue-800"
            >
              Share on this phone
            </button>
          )}
          <a href={whatsApp} target="_blank" rel="noreferrer" className="rounded-lg bg-green-700 px-4 py-3 text-center text-lg font-bold text-white hover:bg-green-800">
            WhatsApp
          </a>
          <a href={email} className="rounded-lg border-2 border-slate-900 px-4 py-3 text-center text-lg font-bold text-slate-900 hover:bg-slate-100 dark:border-slate-100 dark:text-slate-50">
            Email
          </a>
          {note && <p className="text-base" role="status">{note}</p>}
        </div>
      )}
    </div>
  );
}
