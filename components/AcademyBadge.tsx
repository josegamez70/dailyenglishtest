import React, { useLayoutEffect, useRef } from 'react';
import { academyPillName, individualPillName, studentPillName } from '../academyStats';
import { useRetroTheme } from '../retroTheme';
import { PixelIcon } from './PixelIcon';

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

/** Grow the two header lines so a short name fills the stretched pill, and only ellipsize a name that still overflows. */
function fitHeaderPill(copy: HTMLElement) {
  if (getComputedStyle(copy).display === 'none') return;
  const lines = [...copy.querySelectorAll<HTMLElement>(':scope > span')];
  const room = copy.clientWidth;
  if (!lines.length || room < 8) return;
  const widthAt = (line: HTMLElement, px: number, spacing: number) => {
    line.style.fontSize = `${px}px`;
    line.style.letterSpacing = `${spacing}px`;
    line.style.display = 'inline-block';
    line.style.width = 'max-content';
    line.style.maxWidth = 'none';
    return line.getBoundingClientRect().width;
  };
  const restore = (line: HTMLElement) => {
    line.style.display = '';
    line.style.width = '';
    line.style.maxWidth = '';
  };
  const max = 22;
  const min = 11;
  let size = min;
  for (let px = max; px >= min; px -= 1) {
    if (lines.every((line) => widthAt(line, px, 0) <= room - 1)) {
      size = px;
      break;
    }
  }
  for (const line of lines) {
    line.style.fontSize = `${size}px`;
    line.style.letterSpacing = '0px';
    restore(line);
  }
}

/** Large badge on My academy, or a compact one for the header and sidebar. */
export function AcademyBadge({
  name,
  displayName,
  email,
  compact = false,
  role = 'owner',
  person = false,
  fitWidth = false,
  individual = false,
  onPress,
}: {
  name: string;
  /** Owner: their display name. Student menu: the student's own display name. */
  displayName?: string | null;
  email?: string | null;
  compact?: boolean;
  role?: 'owner' | 'student';
  /** Student menu only. The bold line is the profile name, not the academy name. */
  person?: boolean;
  /** Header pill only. Retro 95 grows the two lines to the pill width. */
  fitWidth?: boolean;
  /** Signed-in learner with no academy. */
  individual?: boolean;
  /** Header pill. Opens Profile. */
  onPress?: () => void;
}) {
  const academy = name.trim();
  const label = role === 'student' ? 'Student' : 'My academy';
  const personName = studentPillName(displayName, email);
  const shown = role === 'student' && person
    ? personName
    : academyPillName(role === 'student' ? null : displayName, academy);
  const retro = useRetroTheme();
  const copyRef = useRef<HTMLSpanElement>(null);
  const fit = Boolean(fitWidth && compact);
  const headerStudent = fit && role === 'student' && !individual;
  const topLine = individual ? 'Individual' : headerStudent ? (academy || 'Academy') : label;
  const bottomLine = individual
    ? individualPillName(displayName)
    : headerStudent
      ? (personName === 'Student' ? 'Student' : `Student · ${personName}`)
      : shown;
  useLayoutEffect(() => {
    if (!fit || !copyRef.current) return undefined;
    const copy = copyRef.current;
    const run = () => fitHeaderPill(copy);
    run();
    const observer = new ResizeObserver(run);
    observer.observe(copy);
    document.fonts?.ready.then(run).catch(() => {});
    return () => observer.disconnect();
  }, [fit, topLine, bottomLine]);
  const mark = retro
    ? <PixelIcon name="house" size={fit ? 22 : compact ? 16 : 24} />
    : <SchoolIcon className={compact ? 'h-8 w-8 shrink-0' : 'h-12 w-12 shrink-0'} />;
  if (compact) {
    const className = retro
      ? 'retro-pill'
      : 'inline-flex max-w-[10.5rem] shrink-0 items-center gap-1.5 rounded-2xl border border-teal-600 bg-white py-1 pl-1 pr-2 text-left dark:border-teal-400 dark:bg-slate-800';
    const title = individual || headerStudent ? `${topLine}: ${bottomLine}` : `${label}: ${shown}`;
    const inner = (
      <>
        {mark}
        <span ref={copyRef} className="retro-pill-copy min-w-0 text-left leading-tight">
          <span className="block text-[10px] font-medium leading-none text-slate-600 dark:text-slate-300">{topLine}</span>
          <span className="retro-pill-name mt-0.5 block truncate text-xs font-bold leading-tight">{bottomLine}</span>
        </span>
      </>
    );
    if (onPress) {
      return (
        <button type="button" onClick={onPress} className={className} title={title} aria-label={`Open profile, ${topLine} ${bottomLine}`}>
          {inner}
        </button>
      );
    }
    return (
      <p className={className} title={title}>
        {inner}
      </p>
    );
  }
  return (
    <h1 className={retro
      ? 'retro-pill retro-pill-large'
      : 'inline-flex max-w-full items-center gap-3 rounded-2xl border border-teal-600 bg-white px-3.5 py-2.5 dark:border-teal-400 dark:bg-slate-800'}>
      {mark}
      <span className="min-w-0 pr-1 text-left">
        <span className="block text-sm font-medium leading-tight text-slate-600 dark:text-slate-300">My academy</span>
        <span className="mt-0.5 block truncate text-xl font-bold leading-tight">{academy || 'Academy'}</span>
      </span>
    </h1>
  );
}
