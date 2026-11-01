import React, { useEffect, useState } from 'react';
import { joinAcademy, lookupAcademyName } from '../academy';
import { joinResultMessage } from '../academyStats';

export function JoinAcademyPage({
  code,
  onJoined,
  onNotNow,
}: {
  code: string;
  onJoined: () => void;
  onNotNow: () => void;
}) {
  const [name, setName] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    lookupAcademyName(code).then((result) => {
      if (ignore) return;
      setName(result.name);
      setMissing(result.missing);
      setReady(true);
    }).catch(() => {
      if (!ignore) setReady(true);
    });
    return () => { ignore = true; };
  }, [code]);

  const join = async () => {
    setBusy(true);
    setNote(null);
    const result = await joinAcademy(code);
    setBusy(false);
    if (result === 'ok') {
      onJoined();
      return;
    }
    setNote(joinResultMessage(result));
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="text-2xl font-bold">Join an academy</h1>
      {!ready && <p className="mt-3 text-base">Loading...</p>}
      {ready && missing && <p className="mt-3 text-base">Academy joining will work after the database update.</p>}
      {ready && !missing && !name && <p className="mt-3 text-base">That code does not match an academy.</p>}
      {ready && name && (
        <>
          <p className="mt-3 text-lg">Join {name}?</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => { void join(); }} className="rounded-lg bg-blue-700 px-4 py-3 text-base font-bold text-white hover:bg-blue-800 disabled:opacity-60">
              {busy ? 'Joining...' : 'Join'}
            </button>
            <button type="button" onClick={onNotNow} className="rounded-lg border-2 border-slate-700 px-4 py-3 text-base font-semibold dark:border-slate-200">
              Not now
            </button>
          </div>
        </>
      )}
      {note && <p className="mt-3 text-base">{note}</p>}
    </div>
  );
}

export function AcademyContact() {
  return (
    <p className="text-center text-sm text-slate-700 dark:text-slate-300">
      Are you an academy? <a className="underline" href="mailto:josegamez70@hotmail.com">Contact us</a>
    </p>
  );
}
