import React from 'react';
import { academyPillName } from '../academyStats';

function SchoolIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M24 3v7" stroke="#e2e8f0" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M24 4h8l-1.6 2.4L32 9H24z" fill="#f87171" />
      <path d="M6 22 24 10l18 12v2H6v-2z" fill="#ef4444" />
      <rect x="11" y="23" width="26" height="20" rx="1.5" fill="#f8fafc" />
      <rect x="15" y="27" width="5.5" height="5" rx="0.6" fill="#5eead4" />
      <rect x="27.5" y="27" width="5.5" height="5" rx="0.6" fill="#5eead4" />
      <rect x="20.5" y="32" width="7" height="11" rx="0.8" fill="#1e293b" />
    </svg>
  );
}

/** Large badge on My academy, or a compact one for the header and sidebar. */
export function AcademyBadge({
  name,
  displayName,
  compact = false,
  role = 'owner',
}: {
  name: string;
  /** Academy owner's profile display name. Compact pills prefer this over the record name. */
  displayName?: string | null;
  compact?: boolean;
  role?: 'owner' | 'student';
}) {
  const academy = name.trim();
  const label = role === 'student' ? 'Student' : 'My academy';
  const shown = compact ? academyPillName(displayName, academy) : (academy || 'Academy');
  if (compact) {
    return (
      <p
        className="inline-flex max-w-[10.5rem] shrink-0 items-center gap-1.5 rounded-2xl border border-teal-600 bg-white py-1 pl-1 pr-2 dark:border-teal-400 dark:bg-slate-800"
        title={`${label}: ${shown}`}
      >
        <SchoolIcon className="h-8 w-8 shrink-0" />
        <span className="min-w-0 text-left leading-tight">
          <span className="block text-[10px] font-medium leading-none text-slate-600 dark:text-slate-300">{label}</span>
          <span className="mt-0.5 block truncate text-xs font-bold leading-tight">{shown}</span>
        </span>
      </p>
    );
  }
  return (
    <h1 className="inline-flex max-w-full items-center gap-3 rounded-2xl border border-teal-600 bg-white px-3.5 py-2.5 dark:border-teal-400 dark:bg-slate-800">
      <SchoolIcon className="h-12 w-12 shrink-0" />
      <span className="min-w-0 pr-1 text-left">
        <span className="block text-sm font-medium leading-tight text-slate-600 dark:text-slate-300">My academy</span>
        <span className="mt-0.5 block truncate text-xl font-bold leading-tight">{academy || 'Academy'}</span>
      </span>
    </h1>
  );
}
