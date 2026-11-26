import { useState } from 'react';
import { leaveAcademy } from '../academy';
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
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

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
        <p className="text-base">Your account is an individual learner. Progress, results, vocabulary, and badges stay here. Academy owners use the academy entrance.</p>
      )}
      {note && <p className="text-base">{note}</p>}
      {plan !== 'academy' && <AcademyContact />}
    </section>
  );
}
