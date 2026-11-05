import React, { useEffect, useRef, useState } from 'react';
import { createAcademy, loadAcademyStudents, loadOwnedAcademy, regenerateInviteCode, removeStudent, type AcademyStudent, type OwnedAcademy } from '../academy';
import { copyInviteText, countPhrase, countTestsThisWeek, inviteLink } from '../academyStats';
import { averagePercent, formatResultDate } from '../progressStats';
import { scorePercent, studentIdFromSearch } from '../studentDetail';
import { StudentDetailView } from './StudentDetailView';

function studentLabel(student: AcademyStudent): string {
  return student.displayName.trim() || student.email || 'Student';
}

function readStudentParam(): string | null {
  if (typeof window === 'undefined') return null;
  return studentIdFromSearch(window.location.search);
}

function AcademyStudentButton({
  student,
  onOpen,
}: {
  student: AcademyStudent;
  onOpen: (userId: string) => void;
}) {
  const tests = [...student.tests].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const latest = tests[0];
  const scores = tests.map((item) => ({ score: item.score, total: item.total }));
  const latestPercent = latest ? scorePercent(latest.score, latest.total) : null;
  const name = studentLabel(student);
  return (
    <li className="rounded-xl border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800">
      <button
        type="button"
        onClick={() => onOpen(student.userId)}
        aria-label={`Open details for ${name}`}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">{name}</span>
          <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">
            {countPhrase(tests.length, 'test')} · average {tests.length ? `${averagePercent(scores)}%` : '—'}
          </span>
          {latest && (
            <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-300">
              Last {formatResultDate(latest.createdAt)} · {latestPercent == null ? '—' : `${latestPercent}%`}
            </span>
          )}
        </span>
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </li>
  );
}

export function AcademyPage() {
  const [academy, setAcademy] = useState<OwnedAcademy | null>(null);
  const [students, setStudents] = useState<AcademyStudent[]>([]);
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(readStudentParam);
  const pushed = useRef(false);

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

  useEffect(() => {
    const onPop = () => {
      pushed.current = false;
      setStudentId(readStudentParam());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openStudent = (userId: string) => {
    setNote(null);
    window.history.pushState({ student: userId }, '', `/academy?student=${encodeURIComponent(userId)}`);
    pushed.current = true;
    setStudentId(userId);
    window.scrollTo({ top: 0 });
  };

  const closeStudent = () => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
      return;
    }
    window.history.replaceState({}, '', '/academy');
    setStudentId(null);
    window.scrollTo({ top: 0 });
  };

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
    const link = inviteLink(window.location.origin, academy.inviteCode);
    const copied = await copyInviteText(link);
    setNote(copied ? 'Link copied.' : 'Select the link and copy it.');
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
    if (result === 'ok') {
      pushed.current = false;
      window.history.replaceState({}, '', '/academy');
      setStudentId(null);
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

  const selected = students.find((student) => student.userId === studentId) ?? null;
  if (studentId) {
    if (!selected) {
      return (
        <div className="mx-auto w-full max-w-md">
          <button type="button" onClick={closeStudent} className="text-base font-semibold text-teal-700 dark:text-teal-300">
            Back
          </button>
          <p className="mt-3 text-base">That student is not in your academy.</p>
        </div>
      );
    }
    return (
      <StudentDetailView
        key={selected.userId}
        student={selected}
        onBack={closeStudent}
        onRemove={() => { void remove(selected.userId); }}
        removing={busy}
        message={note}
      />
    );
  }

  const allTests = students.flatMap((student) => student.tests);
  const weekCount = countTestsThisWeek(allTests.map((item) => new Date(item.createdAt)));
  const shareLink = inviteLink(window.location.origin, academy.inviteCode);

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
        {students.map((student) => (
          <AcademyStudentButton key={student.userId} student={student} onOpen={openStudent} />
        ))}
      </ul>
    </div>
  );
}
