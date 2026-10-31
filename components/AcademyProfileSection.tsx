import React, { useState } from 'react';
import { joinAcademy, leaveAcademy } from '../academy';
import { ACADEMY_INVITE_KEY, joinResultMessage, normalizeInviteCode } from '../academyStats';
import { AcademyContact } from './JoinAcademyPage';

export function AcademyProfileSection({
  plan,
  academyRole,
  academyName,
  onChanged,
}: {
  plan: string | null;
  academyRole: 'owner' | 'student' | null;
  academyName: string | null;
  onChanged: () => void;
}) {
  const [code, setCode] = useState(() => {
    try {
      return normalizeInviteCode(localStorage.getItem(ACADEMY_INVITE_KEY) || '');
    } catch {
      return '';
    }
  });
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    const next = normalizeInviteCode(code);
    if (!next) {
      setNote('Enter the 6 to 8 character code from your academy.');
      return;
    }
    setBusy(true);
    setNote(null);
    const result = await joinAcademy(next);
    setBusy(false);
    if (result === 'ok') {
      try { localStorage.removeItem(ACADEMY_INVITE_KEY); } catch { /* ignore */ }
      onChanged();
      return;
    }
    setNote(joinResultMessage(result));
  };

  const leave = async () => {
    setBusy(true);
    const result = await leaveAcademy();
    setBusy(false);
    setConfirmLeave(false);
    if (result === 'ok') {
      onChanged();
      return;
    }
    setNote(result === 'missing' ? 'This will work after the database update.' : 'Could not leave the academy. Try again.');
  };

  return (
    <section className="mx-auto mt-8 w-full max-w-xl space-y-3 border-t border-slate-300 pt-6 dark:border-slate-600">
      <h2 className="text-xl font-bold">Academy</h2>
      {plan === 'academy' && (
        <p className="text-base">You run an academy. Open My academy in the menu.</p>
      )}
      {academyRole === 'student' && (
        <>
          <p className="text-base">Academy: {academyName || 'Your academy'}</p>
          {confirmLeave ? (
            <div className="flex flex-wrap gap-2">
              <p className="w-full text-sm">Leave this academy?</p>
              <button type="button" disabled={busy} onClick={() => { void leave(); }} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white">
                Leave
              </button>
              <button type="button" onClick={() => setConfirmLeave(false)} className="rounded-lg border-2 border-slate-700 px-3 py-2 text-sm font-semibold dark:border-slate-200">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmLeave(true)} className="rounded-lg border-2 border-slate-700 px-4 py-2 text-sm font-semibold dark:border-slate-200">
              Leave
            </button>
          )}
        </>
      )}
      {plan !== 'academy' && academyRole !== 'student' && (
        <form onSubmit={join} className="space-y-3">
          <label className="block text-sm font-semibold" htmlFor="academy-code">Invite code</label>
          <input
            id="academy-code"
            value={code}
            maxLength={12}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-base uppercase text-slate-900 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-50"
          />
          <button type="submit" disabled={busy} className="rounded-lg bg-blue-700 px-4 py-3 text-base font-bold text-white hover:bg-blue-800 disabled:opacity-60">
            {busy ? 'Joining...' : 'Join'}
          </button>
        </form>
      )}
      {note && <p className="text-base">{note}</p>}
      {plan !== 'academy' && <AcademyContact />}
    </section>
  );
}
