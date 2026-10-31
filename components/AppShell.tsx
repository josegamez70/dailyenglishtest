import React, { useState } from 'react';

export type ShellItem = 'lesson' | 'progress' | 'saved' | 'academy' | 'profile' | 'join';

const baseItems: { id: ShellItem; label: string; path: string }[] = [
  { id: 'lesson', label: 'New lesson', path: '/' },
  { id: 'progress', label: 'My progress', path: '/progress' },
  { id: 'saved', label: 'Saved lessons', path: '/saved' },
  { id: 'profile', label: 'Profile', path: '/profile' },
];

function NavLinks({
  active,
  onNavigate,
  onSignOut,
  email,
  status,
  showAcademy,
}: {
  active: ShellItem;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
  email: string | null;
  status: string | null;
  showAcademy: boolean;
}) {
  const items = showAcademy
    ? [
      baseItems[0],
      baseItems[1],
      baseItems[2],
      { id: 'academy' as const, label: 'My academy', path: '/academy' },
      baseItems[3],
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
        {status && (
          <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">{status}</p>
        )}
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
          <a href="/legal" className="underline">Legal Notice</a>
          <a href="/privacy" className="underline">Privacy</a>
          <a href="/terms" className="underline">Terms</a>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-4 w-full rounded-lg border-2 border-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 dark:border-slate-100 dark:text-white dark:hover:bg-slate-700"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export function AppShell({
  active,
  onNavigate,
  onSignOut,
  email,
  status,
  showAcademy,
  children,
}: {
  active: ShellItem;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
  email: string | null;
  status: string | null;
  showAcademy: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const go = (path: string) => {
    setOpen(false);
    onNavigate(path);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-50 md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800 md:flex">
        <NavLinks active={active} onNavigate={go} onSignOut={onSignOut} email={email} status={status} showAcademy={showAcademy} />
      </aside>
      <div className="flex min-h-screen flex-col">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-300 bg-slate-100 px-3 py-3 dark:border-slate-600 dark:bg-slate-900 md:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border-2 border-slate-900 dark:border-slate-100"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <p className="font-fun text-lg leading-tight">
            <span className="text-blue-800 dark:text-blue-300">Daily </span>
            <span className="text-red-700 dark:text-red-400">English Test</span>
          </p>
        </div>
        <div className="flex flex-1 flex-col px-3 py-4 sm:px-5">{children}</div>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-800">
            <NavLinks active={active} onNavigate={go} onSignOut={onSignOut} email={email} status={status} showAcademy={showAcademy} />
          </aside>
        </div>
      )}
    </div>
  );
}
