import React, { useEffect, useState } from 'react';
import { createAcademy, loadAcademyStudents, loadOwnedAcademy, regenerateInviteCode, removeStudent, type AcademyStudent, type OwnedAcademy } from '../academy';
import { countTestsThisWeek } from '../academyStats';
import { averagePercent, formatResultDate } from '../progressStats';

const SHARE_ORIGIN = 'https://dailyenglishtest.es/join?code=';

function studentLabel(student: AcademyStudent): string {
  return student.displayName.trim() || student.email || 'Student';
}

function percent(score: number, total: number): number {
  return total ? Math.round((score / total) * 100) : 0;
}

export function AcademyPage() {
  const [academy, setAcademy] = useState<OwnedAcademy | null>(null);
  const [students, setStudents] = useState<AcademyStudent[]>([]);
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openTestId, setOpenTestId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = async () => {
    const owned = await loadOwnedAcademy();
    if (owned.missing) {
      setMissing(true);
      setReady(true);
      return;
    }
    setAcademy(owned.academy);
    if (!owned.academy) {
      setStudents([]);
      setReady(true);
      return;
    }
    const roster = await loadAcademyStudents(owned.academy.id);
    setStudents(roster.students);
    setMissing(roster.missing);
    setReady(true);
  };

  useEffect(() => {
    let ignore = false;
    load().catch(() => {
      if (!ignore) setReady(true);
    });
    return () => { ignore = true; };
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    const result = await createAcademy(name.trim());
    setBusy(false);
    if (result === 'ok') {
      setName('');
      await load();
      return;
    }
    if (result === 'name_required') setNote('Enter a name for your academy.');
    else if (result === 'not_academy_plan') setNote('Only an academy account can create an academy.');
    else if (result === 'already_exists') setNote('You already have an academy.');
    else if (result === 'missing') setNote('This will work after the database update.');
    else setNote('Could not create the academy. Try again.');
  };

  const copyCode = async () => {
    if (!academy) return;
    try {
      await navigator.clipboard.writeText(academy.inviteCode);
      setNote('Copied.');
    } catch {
      setNote('Select the code and copy it.');
    }
  };

  const regenerate = async () => {
    setBusy(true);
    setNote(null);
    const result = await regenerateInviteCode();
    setBusy(false);
    if (result.length >= 6 && result !== 'not_owner' && result !== 'missing' && result !== 'error' && result !== 'code_unavailable' && result !== 'auth_required') {
      setAcademy((current) => current ? { ...current, inviteCode: result } : current);
      setNote('New code ready.');
      return;
    }
    setNote(result === 'missing' ? 'This will work after the database update.' : 'Could not make a new code. Try again.');
  };

  const remove = async (userId: string) => {
    setBusy(true);
    const result = await removeStudent(userId);
    setBusy(false);
    setConfirmId(null);
    if (result === 'ok') {
      setOpenId(null);
      await load();
      return;
    }
    setNote('Could not remove that student. Try again.');
  };

  if (!ready) return <p className="text-base">Loading...</p>;
  if (missing) return <p className="text-base">Academy tools will appear after the database update.</p>;

  if (!academy) {
    return (
      <form onSubmit={create} className="mx-auto w-full max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">My academy</h1>
        <p className="text-base">Create your academy, then share the invite code with your students.</p>
        <label className="block text-sm font-semibold" htmlFor="academy-name">Academy name</label>
        <input
          id="academy-name"
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, 60))}
          className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-50"
        />
        <button type="submit" disabled={busy} className="rounded-lg bg-blue-700 px-4 py-3 text-base font-bold text-white hover:bg-blue-800 disabled:opacity-60">
          {busy ? 'Creating...' : 'Create academy'}
        </button>
        {note && <p className="text-base">{note}</p>}
      </form>
    );
  }

  const allTests = students.flatMap((student) => student.tests);
  const weekCount = countTestsThisWeek(allTests.map((item) => new Date(item.createdAt)));
  const shareLink = `${SHARE_ORIGIN}${academy.inviteCode}`;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-bold">My academy</h1>
      <p className="mt-2 text-base font-semibold">{academy.name}</p>
      <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
        <p className="text-sm font-semibold">Invite code</p>
        <p className="mt-1 text-2xl font-bold tracking-widest">{academy.inviteCode}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => { void copyCode(); }} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800">
            Copy
          </button>
          <button type="button" onClick={() => { void regenerate(); }} disabled={busy} className="rounded-lg border-2 border-slate-700 px-4 py-2 text-sm font-semibold dark:border-slate-200">
            New code
          </button>
        </div>
        <p className="mt-3 break-all text-sm text-slate-700 dark:text-slate-200">{shareLink}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {[
          ['Students', `${students.length} of ${academy.maxStudents}`],
          ['Tests this week', String(weekCount)],
          ['Academy average', `${averagePercent(allTests.map((item) => ({ score: item.score, total: item.total })))}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-300 bg-white p-3 dark:border-slate-600 dark:bg-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-300">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      {note && <p className="mt-3 text-base">{note}</p>}
      {students.length === 0 && <p className="mt-6 text-base">No students yet. Share the invite code.</p>}
      <ul className="mt-6 space-y-3">
        {students.map((student) => {
          const open = openId === student.userId;
          const latest = student.tests[0];
          const scores = student.tests.map((item) => ({ score: item.score, total: item.total }));
          return (
            <li key={student.userId} className="rounded-xl border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800">
              <button type="button" onClick={() => setOpenId(open ? null : student.userId)} className="w-full px-4 py-3 text-left">
                <span className="block text-base font-semibold">{studentLabel(student)}</span>
                <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">
                  {student.tests.length} tests · average {averagePercent(scores)}%
                  {latest ? ` · last ${formatResultDate(latest.createdAt)} · ${percent(latest.score, latest.total)}%` : ''}
                </span>
              </button>
              {open && (
                <div className="space-y-3 border-t border-slate-200 px-4 py-3 dark:border-slate-600">
                  {student.email && student.displayName.trim() && (
                    <p className="text-sm text-slate-600 dark:text-slate-300">{student.email}</p>
                  )}
                  {student.tests.length === 0 && <p className="text-sm">No tests yet.</p>}
                  {student.tests.map((item) => {
                    const testOpen = openTestId === item.id;
                    return (
                      <div key={item.id} className="rounded-lg border border-slate-200 dark:border-slate-600">
                        <button type="button" onClick={() => setOpenTestId(testOpen ? null : item.id)} className="w-full px-3 py-2 text-left text-sm">
                          <span className="block text-slate-600 dark:text-slate-300">{formatResultDate(item.createdAt)}</span>
                          <span className="mt-1 block font-semibold">{item.title || item.topic} · {item.level} · {item.score}/{item.total} ({percent(item.score, item.total)}%)</span>
                        </button>
                        {testOpen && (
                          <div className="space-y-2 border-t border-slate-200 px-3 py-2 text-sm dark:border-slate-600">
                            {item.wrongAnswers.length === 0 && <p>No wrong answers.</p>}
                            {item.wrongAnswers.map((answer, index) => (
                              <p key={index}>
                                <span className="font-semibold">{answer.question}</span>
                                <br />
                                Their answer: {answer.userAnswer || '—'}
                                <br />
                                Correct answer: {answer.correctAnswer}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {confirmId === student.userId ? (
                    <div className="flex flex-wrap gap-2">
                      <p className="w-full text-sm">Remove this student?</p>
                      <button type="button" disabled={busy} onClick={() => { void remove(student.userId); }} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white">
                        Remove
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)} className="rounded-lg border-2 border-slate-700 px-3 py-2 text-sm font-semibold dark:border-slate-200">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmId(student.userId)} className="rounded-lg border-2 border-red-700 px-3 py-2 text-sm font-semibold text-red-800 dark:text-red-300">
                      Remove student
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
