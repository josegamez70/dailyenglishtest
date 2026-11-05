import React, { useState } from 'react';
import { countPhrase } from '../academyStats';
import type { AcademyStudent } from '../academy';
import { chartY, lessonModeLabel } from '../progressStats';
import {
  activityDays,
  badgeLevel,
  grammarSubtype,
  levelBreakdown,
  levelEmptyMessage,
  newestFirst,
  recentTestWhen,
  savedLevelLabel,
  scorePercent,
  skillAverage,
  SKILLS,
  type SkillId,
} from '../studentDetail';
import { WrongAnswerReview } from './WrongAnswerReview';

const CARD = 'rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800';
const MUTED = 'text-slate-500 dark:text-slate-400';
const ACCENT = 'text-teal-700 dark:text-teal-300';
const MARKS = [100, 75, 50, 25, 0];
const RECENT_PREVIEW = 4;

function Chevron({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}

function UserIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M4.5 19.5v-.4c0-3.2 3.4-5.6 7.5-5.6s7.5 2.4 7.5 5.6v.4H4.5z" />
    </svg>
  );
}

function ShieldIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5l6.5 2.5v5.5c0 4.2-2.7 7-6.5 8.5-3.8-1.5-6.5-4.3-6.5-8.5V6L12 3.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.2 12l1.8 1.8 3.8-3.8" />
    </svg>
  );
}

function BookIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.2v12.2M12 6.2C10.8 5.4 9.3 5 7.6 5 6 5 4.6 5.4 3.5 6.1V18c1.1-.7 2.5-1.1 4.1-1.1 1.7 0 3.2.4 4.4 1.2M12 6.2c1.2-.8 2.7-1.2 4.4-1.2 1.6 0 3 .4 4.1 1.1V18c-1.1-.7-2.5-1.1-4.1-1.1-1.7 0-3.2.4-4.4 1.2" />
    </svg>
  );
}

function HeadphonesIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" d="M4.5 13a7.5 7.5 0 0115 0" />
      <rect x="3.2" y="13" width="4" height="6.5" rx="1.2" />
      <rect x="16.8" y="13" width="4" height="6.5" rx="1.2" />
    </svg>
  );
}

function GrammarIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3.5h7.2L19 8.2V20a1 1 0 01-1 1H7a1 1 0 01-1-1V4.5a1 1 0 011-1z" />
      <path strokeLinecap="round" d="M14 3.5V8h4.8" />
      <path strokeLinecap="round" d="M8.5 13h7M8.5 16.5h4.5" />
    </svg>
  );
}

function TrendIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l5-5 3.5 3.5L20 7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 7h6v6" />
    </svg>
  );
}

const SKILL_ICON = {
  reading: BookIcon,
  listening: HeadphonesIcon,
  grammar: GrammarIcon,
} as const;

function tagClass(mode: string | null): string {
  if (mode === 'reading') return 'border-teal-600 text-teal-700 dark:border-teal-300 dark:text-teal-300';
  if (mode === 'listening') return 'border-purple-600 text-purple-700 dark:border-purple-300 dark:text-purple-300';
  if (mode === 'grammar') return 'border-emerald-600 text-emerald-700 dark:border-emerald-300 dark:text-emerald-300';
  return 'border-slate-400 text-slate-600 dark:border-slate-500 dark:text-slate-300';
}

function ActivityChart({ tests }: { tests: { createdAt: string; score: number; total: number }[] }) {
  const days = activityDays(tests);
  const summary = days.map((day) => `${day.label} ${day.percent == null ? 'no test' : `${day.percent}%`}`).join(', ');
  const empty = days.every((day) => day.percent == null);
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Last 14 days</h2>
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${MUTED}`}>
          <TrendIcon className={`h-4 w-4 ${ACCENT}`} />
          Activity
        </span>
      </div>
      <div className="relative mt-3 h-40" role="img" aria-label={`Last 14 days. ${summary}`}>
        <div className="absolute inset-y-0 left-0 w-10">
          {MARKS.map((mark) => (
            <span
              key={mark}
              className={`absolute right-1 -translate-y-1/2 text-[10px] leading-none ${MUTED}`}
              style={{ top: `${chartY(mark)}%` }}
            >
              {mark}%
            </span>
          ))}
        </div>
        <div className="absolute inset-y-0 left-10 right-0">
          {MARKS.map((mark) => (
            <span
              key={mark}
              className="absolute left-0 right-0 border-t border-slate-200 dark:border-slate-700"
              style={{ top: `${chartY(mark)}%` }}
            />
          ))}
          <div className="absolute inset-0 flex">
            {days.map((day) => (
              <div key={day.key} className="relative flex-1" title={day.percent == null ? `${day.label}: no test` : `${day.label}: ${day.percent}%`}>
                {day.percent != null && (
                  <div
                    className="absolute inset-x-0.5 rounded-t bg-gradient-to-t from-teal-600 to-teal-300"
                    style={{ top: `${chartY(day.percent)}%`, bottom: `${100 - chartY(0)}%` }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-1 flex pl-10">
        {days.map((day, index) => {
          const show = index % 3 === 0;
          const align = index === 0 ? 'text-left' : 'text-center';
          return (
            <span key={day.key} className={`min-w-0 flex-1 overflow-visible whitespace-nowrap text-[9px] leading-tight ${MUTED} ${show ? align : ''}`}>
              {show ? day.label : ''}
            </span>
          );
        })}
      </div>
      {empty && <p className="mt-2 text-sm">No tests in the last 14 days.</p>}
    </div>
  );
}

export function StudentDetailView({
  student,
  onBack,
  onRemove,
  removing = false,
  message,
}: {
  student: AcademyStudent;
  onBack: () => void;
  onRemove: () => void;
  removing?: boolean;
  message?: string | null;
}) {
  const [skill, setSkill] = useState<SkillId>('reading');
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const tests = newestFirst(student.tests);
  const name = student.displayName.trim() || student.email || 'Student';
  const level = badgeLevel(student.profileLevel, tests);
  const rows = levelBreakdown(tests, skill);
  const emptyLevels = levelEmptyMessage(tests, skill);
  const visible = showAll ? tests : tests.slice(0, RECENT_PREVIEW);

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className={`inline-flex h-11 w-11 items-center justify-center rounded-lg ${ACCENT}`}
        >
          <Chevron className="h-6 w-6 rotate-180" />
        </button>
        <h1 className="text-xl font-bold">Student detail</h1>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-400/15 ${ACCENT}`}>
          <UserIcon className="h-8 w-8" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-2xl font-bold leading-tight">{name}</p>
          {level && (
            <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full border border-teal-600 px-2 py-0.5 text-sm font-semibold dark:border-teal-300 ${ACCENT}`}>
              <ShieldIcon className="h-3.5 w-3.5" />
              {level}
            </span>
          )}
        </div>
      </div>
      {message && <p className="mt-3 text-base">{message}</p>}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {SKILLS.map((item) => {
          const average = skillAverage(tests, item.id);
          const Icon = SKILL_ICON[item.id];
          return (
            <div key={item.id} className={`${CARD} px-2.5 py-3`}>
              <div className="flex items-start justify-between gap-1">
                <p className="text-xs font-semibold">{item.label}</p>
                <Icon className={`h-4 w-4 shrink-0 ${ACCENT}`} />
              </div>
              <p className={`mt-2 text-2xl font-bold leading-none tabular-nums ${ACCENT}`}>
                {average == null ? '—' : `${average}%`}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-teal-500 dark:bg-teal-300"
                  style={{ width: `${average ?? 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div
        role="tablist"
        aria-label="Skill"
        className="mt-4 grid grid-cols-3 rounded-xl border border-slate-300 p-1 dark:border-slate-600 dark:bg-slate-900"
      >
        {SKILLS.map((item) => {
          const selected = skill === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`skill-tab-${item.id}`}
              aria-selected={selected}
              aria-controls="skill-levels"
              onClick={() => setSkill(item.id)}
              className={
                selected
                  ? 'min-h-11 rounded-lg bg-teal-500 py-2 text-sm font-bold text-white dark:bg-teal-400 dark:text-slate-950'
                  : 'min-h-11 rounded-lg py-2 text-sm font-semibold text-slate-700 dark:text-slate-100'
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div id="skill-levels" role="tabpanel" aria-labelledby={`skill-tab-${skill}`} className={`mt-3 ${CARD}`}>
        {emptyLevels ? (
          <p className="p-4 text-sm">{emptyLevels}</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="font-semibold">{row.label}</span>
                <span className={`text-sm font-semibold tabular-nums ${ACCENT}`}>
                  {row.average == null ? '—' : `${row.average}%`}
                  {' · '}
                  {countPhrase(row.count, 'test')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4">
        <ActivityChart tests={tests} />
      </div>
      <div className={`mt-4 ${CARD}`}>
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <h2 className="text-base font-semibold">Recent tests</h2>
          {tests.length > RECENT_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAll((open) => !open)}
              aria-expanded={showAll}
              className={`inline-flex items-center gap-0.5 text-sm font-semibold ${ACCENT}`}
            >
              {showAll ? 'Show less' : 'View all'}
              <Chevron className={`h-4 w-4 ${showAll ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>
        {tests.length === 0 ? (
          <p className="px-4 py-4 text-sm">No tests yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-700">
            {visible.map((item) => {
              const when = recentTestWhen(item.createdAt);
              const percent = scorePercent(item.score, item.total);
              const subtype = grammarSubtype(item);
              const levelLabel = savedLevelLabel(item.level);
              const open = openId === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : item.id)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 px-3 py-3 text-left"
                  >
                    <span className="shrink-0 leading-tight">
                      <span className="block whitespace-nowrap text-sm font-semibold">{when.date}</span>
                      <span className={`block text-xs ${MUTED}`}>{when.time}</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      <span className="flex flex-col items-start">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tagClass(item.mode)}`}>
                          {lessonModeLabel(item.mode)}
                        </span>
                        {subtype && <span className={`mt-0.5 pl-1 text-[11px] ${MUTED}`}>{subtype}</span>}
                      </span>
                      {levelLabel && (
                        <span className="rounded-full border border-blue-600 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:border-blue-300 dark:text-blue-300">
                          {levelLabel}
                        </span>
                      )}
                    </span>
                    <span className={`shrink-0 text-base font-bold tabular-nums ${ACCENT}`}>
                      {percent == null ? '—' : `${percent}%`}
                    </span>
                    <Chevron className={`h-4 w-4 shrink-0 ${MUTED} ${open ? 'rotate-90' : ''}`} />
                  </button>
                  {open && (
                    <WrongAnswerReview
                      answers={item.wrongAnswers}
                      answerLabel="Their answer"
                      heading={item.title || item.topic}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="mt-6">
        {confirmRemove ? (
          <div className="flex flex-wrap gap-2">
            <p className="w-full text-sm">Remove this student?</p>
            <button
              type="button"
              disabled={removing}
              onClick={onRemove}
              className="rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="rounded-lg border-2 border-slate-700 px-3 py-2 text-sm font-semibold dark:border-slate-200"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="rounded-lg border-2 border-red-700 px-3 py-2 text-sm font-semibold text-red-800 dark:text-red-300"
          >
            Remove student
          </button>
        )}
      </div>
    </div>
  );
}
