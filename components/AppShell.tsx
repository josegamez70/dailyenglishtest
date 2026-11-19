import React, { useState } from 'react';
import { useRetroTheme } from '../retroTheme';
import { AcademyBadge } from './AcademyBadge';
import { PixelIcon } from './PixelIcon';
import { PixelArt } from './PixelArt';

export type ShellItem = 'lesson' | 'grammar' | 'tasks' | 'packs' | 'progress' | 'scoreboard' | 'saved' | 'vocabulary' | 'challenge' | 'academy' | 'profile' | 'join';

const baseItems: { id: ShellItem; label: string; path: string }[] = [
  { id: 'lesson', label: 'Reading / Listening', path: '/' },
  { id: 'grammar', label: 'Grammar', path: '/grammar' },
  { id: 'vocabulary', label: 'Vocabulary builder', path: '/vocabulary' },
  { id: 'challenge', label: 'Daily challenge', path: '/daily-challenge' },
  { id: 'tasks', label: 'Tasks', path: '/tasks' },
  { id: 'packs', label: 'Task packs', path: '/task-packs' },
  { id: 'progress', label: 'My progress', path: '/progress' },
  { id: 'scoreboard', label: 'Scoreboard', path: '/scoreboard' },
  { id: 'saved', label: 'Saved lessons', path: '/saved' },
  { id: 'profile', label: 'Profile', path: '/profile' },
];

const MENU_ICON: Record<string, string> = {
  lesson: 'reading_listening',
  grammar: 'grammar',
  vocabulary: 'vocabulary_builder',
  challenge: 'daily_challenge',
  tasks: 'tasks',
  packs: 'task_packs',
  progress: 'my_progress',
  scoreboard: 'scoreboard',
  saved: 'saved_lessons',
  profile: 'profile',
  academy: 'my_academy',
  help: 'how_it_works',
};

function Wordmark({ variant }: { variant: 'header' | 'side' }) {
  return (
    <p className={variant === 'header'
      ? 'retro-wordmark inline-flex min-w-0 flex-1 items-center gap-1 font-fun text-base leading-none md:hidden'
      : 'retro-side-mark inline-flex items-center gap-1 text-lg font-fun leading-tight'}>
      <PixelArt src="/icons/practice_reading.png" size={variant === 'header' ? 20 : 24} />
      <span>
        <span className="text-blue-800 dark:text-blue-300">Daily </span>
        <span className="text-red-700 dark:text-red-400">English Test</span>
      </span>
    </p>
  );
}

function MenuMark() {
  const retro = useRetroTheme();
  if (retro) return <PixelIcon name="menu" size={20} />;
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function HomeMark() {
  return <PixelArt src="/icons/home.png" size={24} />;
}

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
    <div className="flex min-h-full flex-col">
      <div className="px-4 pt-4">
        <Wordmark variant="side" />
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
                  ? 'inline-flex min-h-11 w-full items-center gap-2 rounded-lg bg-blue-700 px-3 py-3 text-left text-base font-bold text-white'
                  : 'inline-flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-base font-semibold text-slate-900 hover:bg-slate-100 dark:text-slate-50 dark:hover:bg-slate-700'
              }
            >
              <PixelArt src={`/icons/${MENU_ICON[item.id] ?? 'profile'}.png`} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-slate-300 px-4 py-4 dark:border-slate-600">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Help / Legal</p>
        <div className="mt-2 flex flex-col gap-1 text-sm">
          <a href="/help" className="inline-flex min-h-11 items-center gap-2 underline"><PixelArt src="/icons/how_it_works.png" size={24} />How it works</a>
          <a href="/legal" className="inline-flex min-h-11 items-center gap-2 underline"><PixelArt src="/icons/legal.png" size={24} />Legal Notice</a>
          <a href="/privacy" className="inline-flex min-h-11 items-center gap-2 underline"><PixelArt src="/icons/privacy.png" size={24} />Privacy</a>
          <a href="/terms" className="inline-flex min-h-11 items-center gap-2 underline"><PixelArt src="/icons/terms.png" size={24} />Terms</a>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          aria-busy={signingOut}
          className="mt-4 w-full rounded-lg border-2 border-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-100 dark:text-white dark:hover:bg-slate-700"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <PixelArt src="/icons/sign_out.png" size={24} />
            {signingOut ? 'Signing out...' : 'Sign out'}
          </span>
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
  const retro = useRetroTheme();
  const headerBadge = academyName != null
    ? <AcademyBadge name={academyName} displayName={displayName} email={email} compact fitWidth role={academyRole === 'student' ? 'student' : 'owner'} person={academyRole === 'student'} />
    : null;
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto overscroll-contain border-r border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800 md:flex">
        <NavLinks active={active} onNavigate={go} onSignOut={leave} signingOut={signingOut} email={email} status={status} showAcademy={showAcademy} academyName={academyName} academyRole={academyRole} displayName={displayName} />
      </aside>
      <div className="flex min-h-screen flex-col">
        <div className={`sticky top-0 z-20 flex flex-col gap-1 border-b border-slate-300 bg-slate-100 px-3 py-2 dark:border-slate-600 dark:bg-slate-900 ${onHome ? '' : 'md:hidden'}`}>
          <div className="header-row flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 dark:border-slate-100 md:hidden"
            >
              <MenuMark />
            </button>
            <Wordmark variant="header" />
            {retro && headerBadge}
            {onHome && (
              <button
                type="button"
                onClick={onHome}
                aria-label="Go to home screen"
                className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-red-800"
              >
                <HomeMark />
                <span className="home-label">Home</span>
              </button>
            )}
          </div>
          {!retro && headerBadge}
        </div>
        <div className="flex flex-1 flex-col px-3 py-4 sm:px-5">{children}</div>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 overflow-hidden md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            data-press="off"
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setOpen(false)}
          />
          {/* The page behind stays put. Touch scrolling stays on this panel, not on the body. */}
          <aside className="menu-drawer absolute left-0 top-0 w-72 max-w-[85vw] bg-white shadow-xl dark:bg-slate-800">
            <NavLinks active={active} onNavigate={go} onSignOut={leave} signingOut={signingOut} email={email} status={status} showAcademy={showAcademy} academyName={academyName} academyRole={academyRole} displayName={displayName} />
          </aside>
        </div>
      )}
    </div>
  );
}
