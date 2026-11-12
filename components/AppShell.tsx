import React, { useState } from 'react';
import { AcademyBadge } from './AcademyBadge';
import HomeIcon from './icons/HomeIcon';

export type ShellItem = 'lesson' | 'grammar' | 'tasks' | 'packs' | 'progress' | 'saved' | 'academy' | 'profile' | 'join';

const baseItems: { id: ShellItem; label: string; path: string }[] = [
  { id: 'lesson', label: 'Reading / Listening', path: '/' },
  { id: 'grammar', label: 'Grammar', path: '/grammar' },
  { id: 'tasks', label: 'Tasks', path: '/tasks' },
  { id: 'packs', label: 'Task packs', path: '/task-packs' },
  { id: 'progress', label: 'My progress', path: '/progress' },
  { id: 'saved', label: 'Saved lessons', path: '/saved' },
  { id: 'profile', label: 'Profile', path: '/profile' },
];

function NavLinks({
  active,
  onNavigate,
  onSignOut,
  signingOut,
  email,
  status,
  showAcademy,
  academyName,
  academyRole,
  displayName,
}: {
  active: ShellItem;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
  signingOut: boolean;
  email: string | null;
  status: string | null;
  showAcademy: boolean;
  academyName?: string | null;
  academyRole?: 'owner' | 'student' | null;
  displayName?: string | null;
}) {
  const profile = baseItems[baseItems.length - 1];
  const items = showAcademy
    ? [
      ...baseItems.slice(0, -1),
      { id: 'academy' as const, label: 'My academy', path: '/academy' },
      profile,
    ]
    : baseItems;
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4">
        <p className="text-lg font-fun leading-tight">
          <span className="text-blue-800 dark:text-blue-300">Daily </span>
          <span className="text-red-700 dark:text-red-400">English Test</span>
        </p>
        {email && (
          <p className="mt-3 truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{email}</p>
        )}
        {academyName != null ? (
          <div className="mt-3">
            <AcademyBadge name={academyName} displayName={displayName} email={email} compact role={academyRole === 'student' ? 'student' : 'owner'} person={academyRole === 'student'} />
          </div>
        ) : status ? (
          <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">{status}</p>
        ) : null}
      </div>
      <nav className="mt-4 flex flex-col gap-1 px-2" aria-label="App">
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={selected ? 'page' : undefined}
              onClick={() => onNavigate(item.path)}
              className={
                selected
                  ? 'rounded-lg bg-blue-700 px-3 py-3 text-left text-base font-bold text-white'
                  : 'rounded-lg px-3 py-3 text-left text-base font-semibold text-slate-900 hover:bg-slate-100 dark:text-slate-50 dark:hover:bg-slate-700'
              }
            >
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-slate-300 px-4 py-4 dark:border-slate-600">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Help / Legal</p>
        <div className="mt-2 flex flex-col gap-1 text-sm">
          <a href="/help" className="underline">How it works</a>
          <a href="/legal" className="underline">Legal Notice</a>
          <a href="/privacy" className="underline">Privacy</a>
          <a href="/terms" className="underline">Terms</a>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          aria-busy={signingOut}
          className="mt-4 w-full rounded-lg border-2 border-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-100 dark:text-white dark:hover:bg-slate-700"
        >
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

export function AppShell({
  active,
  onNavigate,
  onSignOut,
  onHome,
  email,
  status,
  showAcademy,
  academyName,
  academyRole,
  displayName,
  children,
}: {
  active: ShellItem;
  onNavigate: (path: string) => void;
  onSignOut: () => void | Promise<void>;
  onHome?: () => void;
  email: string | null;
  status: string | null;
  showAcademy: boolean;
  /** Set when this person belongs to an academy. Empty still shows a short Academy badge. */
  academyName?: string | null;
  academyRole?: 'owner' | 'student' | null;
  displayName?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const go = (path: string) => {
    setOpen(false);
    onNavigate(path);
  };
  const leave = () => {
    if (signingOut) return;
    setSigningOut(true);
    void Promise.resolve(onSignOut()).finally(() => setSigningOut(false));
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-50 md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800 md:flex">
        <NavLinks active={active} onNavigate={go} onSignOut={leave} signingOut={signingOut} email={email} status={status} showAcademy={showAcademy} academyName={academyName} academyRole={academyRole} displayName={displayName} />
      </aside>
      <div className="flex min-h-screen flex-col">
        <div className={`sticky top-0 z-20 flex items-center gap-2 border-b border-slate-300 bg-slate-100 px-3 py-2 dark:border-slate-600 dark:bg-slate-900 ${onHome ? '' : 'md:hidden'}`}>
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 dark:border-slate-100 md:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <p className="min-w-0 flex-1 truncate font-fun text-base leading-tight sm:text-lg md:hidden">
            <span className="text-blue-800 dark:text-blue-300">Daily </span>
            <span className="text-red-700 dark:text-red-400">English Test</span>
          </p>
          {(academyName != null || onHome) && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {academyName != null && <AcademyBadge name={academyName} displayName={displayName} email={email} compact role={academyRole === 'student' ? 'student' : 'owner'} />}
              {onHome && (
                <button
                  type="button"
                  onClick={onHome}
                  aria-label="Go to home screen"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-red-800"
                >
                  <HomeIcon className="h-4 w-4" />
                  <span>Home</span>
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col px-3 py-4 sm:px-5">{children}</div>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            data-press="off"
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-800">
            <NavLinks active={active} onNavigate={go} onSignOut={leave} signingOut={signingOut} email={email} status={status} showAcademy={showAcademy} academyName={academyName} academyRole={academyRole} displayName={displayName} />
          </aside>
        </div>
      )}
    </div>
  );
}
