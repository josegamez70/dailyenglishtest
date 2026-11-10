import React, { useEffect, useState } from 'react';
import { accessToken, sendMagicLink } from '../auth';
import { formatEuro, inclusiveVatBreakdown } from '../billingPlans';
import { PILOT_COHORT_LIMIT, PILOT_DAYS, PILOT_SEATS, PILOT_STORAGE_KEY, isPilotCode, pilotDaysLeft } from '../pilotAccess';

const EXAMPLE_CODE = 'EXAMPLE-NOT-A-REAL-INVITE';
const CONTACT = 'info@dailyenglishtest.es';
const price = inclusiveVatBreakdown(3000);

function storeCode(code: string) {
  try { localStorage.setItem(PILOT_STORAGE_KEY, code); } catch { /* ignore */ }
}

function readStoredCode(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('code')?.trim() || '';
    if (fromUrl) {
      storeCode(fromUrl);
      return fromUrl;
    }
    return localStorage.getItem(PILOT_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function ExpiredPilotNotice() {
  return (
    <div className="mt-4 rounded-xl border border-teal-700/40 bg-white px-4 py-3 text-base dark:bg-[#22304a]" role="status">
      <p className="font-bold">This academy pilot has ended.</p>
      <p className="mt-2">Saved lessons and progress are still available. New lessons are paused. The 3 free lessons do not start again.</p>
      <p className="mt-2">
        Academy up to 20 students later: {formatEuro(price.totalCents)} per month, 21% VAT included ({formatEuro(price.baseCents)} + {formatEuro(price.vatCents)} VAT). No payment is started from this page.
      </p>
      <p className="mt-2">
        <a className="underline" href={`mailto:${CONTACT}`}>Contact us</a>
        {' · '}
        <a className="underline" href="/profile#plans">See plans</a>
      </p>
    </div>
  );
}

export function PilotRedeemPage({ signedIn }: { signedIn: boolean }) {
  const example = new URLSearchParams(window.location.search).get('example');
  const [code, setCode] = useState(readStoredCode);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pilot, setPilot] = useState<{ status: string; endsAt?: string | null; daysLeft?: number } | null>(null);

  useEffect(() => {
    if (!signedIn || example) return undefined;
    const controller = new AbortController();
    const load = async () => {
      const token = await accessToken();
      if (!token) return;
      const response = await fetch('/api/pilot-redeem', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      if (!response.ok) return;
      const body = await response.json() as { pilot?: { status: string; endsAt?: string | null; daysLeft?: number } };
      if (!controller.signal.aborted) setPilot(body.pilot ?? null);
    };
    void load();
    return () => controller.abort();
  }, [signedIn, example]);

  const shown = example === 'active'
    ? { status: 'active', daysLeft: 12, endsAt: '2026-11-27T00:00:00.000Z' }
    : example === 'expired'
      ? { status: 'expired', daysLeft: 0, endsAt: '2026-11-01T00:00:00.000Z' }
      : pilot;

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <p className="text-sm font-bold uppercase tracking-wide text-teal-800 dark:text-teal-200">Private academy pilot</p>
      <h1 className="mt-2 text-3xl font-bold">Activate one academy</h1>
      <p className="mt-3 text-base">
        One invitation starts one academy for up to {PILOT_SEATS} students, for {PILOT_DAYS} days from the moment it is activated. No card and no automatic charge.
      </p>
      {example && (
        <p className="mt-3 rounded-xl border border-teal-700 px-3 py-2 text-sm font-semibold" role="status">
          Example — not a real invitation. Code {EXAMPLE_CODE}.
        </p>
      )}
      {!signedIn && !example && (
        <form
          className="mt-4 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = code.trim();
            storeCode(next);
            const email = (event.currentTarget.elements.namedItem('email') as HTMLInputElement).value;
            void sendMagicLink(email, `${window.location.origin}/pilot?code=${encodeURIComponent(next)}`)
              .then(() => setNote('Check your email. This invitation code is saved on this device and in the link.'))
              .catch(() => setNote('The email could not be sent. Try again.'));
          }}
        >
          <label className="block text-sm font-semibold" htmlFor="pilot-email">Email</label>
          <input id="pilot-email" name="email" type="email" required autoComplete="email" className="w-full rounded-lg border border-slate-400 px-3 py-3 text-base dark:border-slate-500 dark:bg-slate-900" />
          <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-3 text-base font-bold text-white">Email me a sign-in link</button>
        </form>
      )}
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (example) {
            setNote('Example only. This is not a real invitation and nothing was activated.');
            return;
          }
          const next = code.trim();
          storeCode(next);
          if (!isPilotCode(next)) {
            setNote('Enter the full invitation code.');
            return;
          }
          if (!signedIn) {
            setNote('Sign in with the form above. The code stays on this page.');
            return;
          }
          setBusy(true);
          void (async () => {
            try {
              const token = await accessToken();
              const response = await fetch('/api/pilot-redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ code: next }),
              });
              const body = await response.json() as { ok?: boolean; pilot?: { status: string; endsAt?: string | null; daysLeft?: number }; message?: string };
              if (body.ok && body.pilot) {
                setPilot(body.pilot);
                setNote(body.pilot.status === 'active' ? 'Your academy pilot is active.' : null);
              } else setNote(body.message || 'The invitation could not be used.');
            } catch {
              setNote('The invitation could not be used.');
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label className="block text-sm font-semibold" htmlFor="pilot-code">Invitation code</label>
        <input
          id="pilot-code"
          value={example ? EXAMPLE_CODE : code}
          onChange={(event) => { setCode(event.target.value.trim()); storeCode(event.target.value.trim()); }}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-slate-400 px-3 py-3 text-base dark:border-slate-500 dark:bg-slate-900"
        />
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-teal-700 px-4 py-3 text-base font-bold text-white disabled:opacity-60 dark:bg-teal-400 dark:text-slate-950">
          {busy ? 'Checking…' : 'Activate academy'}
        </button>
      </form>
      {shown?.status === 'active' && (
        <p className="mt-4 rounded-xl border border-teal-700/40 bg-white px-4 py-3 dark:bg-[#22304a]" role="status">
          Academy pilot is active. {shown.daysLeft ?? pilotDaysLeft(Date.now(), shown.endsAt ? Date.parse(shown.endsAt) : null)} days left. Up to {PILOT_SEATS} students. Open My academy to name it and invite students.
        </p>
      )}
      {shown?.status === 'expired' && <ExpiredPilotNotice />}
      {note && <p className="mt-3 text-base font-semibold" role="status">{note}</p>}
    </main>
  );
}

type AdminInvite = {
  id: string;
  label: string;
  code: string;
  path: string;
  status: string;
  createdAt: string;
  activatedAt: string | null;
  endsAt: string | null;
};

const EXAMPLE_ROWS: AdminInvite[] = [
  { id: 'example-created', label: 'Example academy A', code: EXAMPLE_CODE, path: '/pilot', status: 'created', createdAt: '2026-11-07T12:00:00.000Z', activatedAt: null, endsAt: null },
  { id: 'example-active', label: 'Example academy B', code: EXAMPLE_CODE, path: '/pilot', status: 'activated', createdAt: '2026-11-01T12:00:00.000Z', activatedAt: '2026-11-02T12:00:00.000Z', endsAt: '2026-11-22T12:00:00.000Z' },
];

export function PilotAdminPage({ signedIn }: { signedIn: boolean }) {
  const example = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('example') === 'admin';
  const [rows, setRows] = useState<AdminInvite[]>(example ? EXAMPLE_ROWS : []);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState<string | null>(example ? 'Example — not a real invitation. Nothing is stored.' : null);
  const [denied, setDenied] = useState(false);
  const [limit, setLimit] = useState(PILOT_COHORT_LIMIT);

  useEffect(() => {
    if (example) return;
    const run = async () => {
      const token = await accessToken();
      if (!token || !signedIn) {
        setDenied(true);
        return;
      }
      const response = await fetch('/api/pilot-admin', { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 403 || response.status === 401 || response.status === 503) {
        setDenied(response.status !== 503);
        if (response.status === 503) setNote('Invitations are not available until the admin setting is configured.');
        return;
      }
      const body = await response.json() as { invitations?: AdminInvite[]; cohortLimit?: number };
      setRows(body.invitations ?? []);
      setLimit(body.cohortLimit ?? PILOT_COHORT_LIMIT);
      setDenied(false);
    };
    void run();
  }, [example, signedIn]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNote(example ? 'Example only. Nothing was copied to a real academy.' : 'Copied.');
    } catch {
      setNote('Copy was blocked by the browser.');
    }
  };

  if (!example && denied) {
    return <main className="mx-auto max-w-xl px-4 py-8"><h1 className="text-2xl font-bold">Not available</h1></main>;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="text-sm font-bold uppercase tracking-wide text-teal-800 dark:text-teal-200">Private</p>
      <h1 className="mt-2 text-3xl font-bold">Academy pilot invitations</h1>
      <p className="mt-2 text-base">Create a code and send it yourself. This page does not email anyone. Cohort limit: {limit}. Each code activates one academy, up to 20 students, for 20 days after redemption.</p>
      {example && <p className="mt-3 rounded-xl border border-teal-700 px-3 py-2 text-sm font-semibold">Example — not a real invitation.</p>}
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (example) {
            setNote('Example only. No invitation was created.');
            return;
          }
          void (async () => {
            const token = await accessToken();
            const response = await fetch('/api/pilot-admin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
              body: JSON.stringify({ action: 'create', label }),
            });
            if (!response.ok) {
              setNote('Could not create an invitation.');
              return;
            }
            setLabel('');
            const listed = await fetch('/api/pilot-admin', { headers: { Authorization: `Bearer ${token ?? ''}` } });
            if (listed.ok) {
              const body = await listed.json() as { invitations?: AdminInvite[] };
              setRows(body.invitations ?? []);
            }
          })();
        }}
      >
        <label className="sr-only" htmlFor="pilot-label">Label</label>
        <input id="pilot-label" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={60} placeholder="Label, for example North academy" className="w-full rounded-lg border border-slate-400 px-3 py-3 text-base dark:border-slate-500 dark:bg-slate-900" />
        <button type="submit" className="rounded-lg bg-teal-700 px-4 py-3 text-base font-bold text-white dark:bg-teal-400 dark:text-slate-950">Create</button>
      </form>
      <ul className="mt-6 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-teal-700/40 bg-white p-4 dark:bg-[#22304a]">
            <p className="text-lg font-bold">{row.label}</p>
            <p className="text-sm uppercase tracking-wide text-teal-800 dark:text-teal-200">{row.status}</p>
            <p className="mt-1 text-sm">Created {row.createdAt.slice(0, 10)}{row.activatedAt ? ` · Activated ${row.activatedAt.slice(0, 10)}` : ''}{row.endsAt ? ` · Ends ${row.endsAt.slice(0, 10)}` : ''}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button type="button" className="rounded-lg border-2 border-slate-700 px-3 py-2 text-sm font-semibold dark:border-slate-200" onClick={() => { void copy(example ? EXAMPLE_CODE : row.code); }}>Copy code</button>
              <button type="button" className="rounded-lg border-2 border-slate-700 px-3 py-2 text-sm font-semibold dark:border-slate-200" onClick={() => { void copy(`${window.location.origin}${row.path}?code=${encodeURIComponent(example ? EXAMPLE_CODE : row.code)}`); }}>Copy link</button>
              {row.status === 'created' && (
                <button
                  type="button"
                  className="rounded-lg border-2 border-red-800 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-300 dark:text-red-200"
                  onClick={() => {
                    if (example) {
                      setNote('Example only. Nothing was revoked.');
                      return;
                    }
                    void (async () => {
                      const token = await accessToken();
                      await fetch('/api/pilot-admin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        body: JSON.stringify({ action: 'revoke', id: row.id }),
                      });
                      const listed = await fetch('/api/pilot-admin', { headers: { Authorization: `Bearer ${token ?? ''}` } });
                      if (listed.ok) {
                        const body = await listed.json() as { invitations?: AdminInvite[] };
                        setRows(body.invitations ?? []);
                      }
                    })();
                  }}
                >
                  Revoke unused
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {note && <p className="mt-4 text-base font-semibold" role="status">{note}</p>}
    </main>
  );
}

export function PilotStatusBanner() {
  const [pilot, setPilot] = useState<{ status: string; daysLeft?: number; endsAt?: string | null } | null>(null);
  useEffect(() => {
    const load = async () => {
      const token = await accessToken();
      if (!token) return;
      const response = await fetch('/api/pilot-redeem', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const body = await response.json() as { pilot?: { status: string; daysLeft?: number; endsAt?: string | null } };
      setPilot(body.pilot ?? null);
    };
    void load();
  }, []);
  if (!pilot || pilot.status === 'none') return null;
  if (pilot.status === 'expired') return <ExpiredPilotNotice />;
  if (pilot.status !== 'active') return null;
  const end = pilot.endsAt ? new Date(pilot.endsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return (
    <p className="mb-4 rounded-xl border border-teal-700/40 bg-white px-4 py-3 text-base dark:bg-[#22304a]" role="status">
      Academy pilot: {pilot.daysLeft} days left{end ? `. Ends ${end}` : ''}. Up to 20 students.
    </p>
  );
}
