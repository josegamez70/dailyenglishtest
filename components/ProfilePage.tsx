import React, { useEffect, useState } from 'react';
import { FREE_LESSON_LIMIT } from '../auth';
import { updateProfileSettings } from '../studyStore';
import type { CefrLevel } from '../progressStats';
import { AcademyProfileSection } from './AcademyProfileSection';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type VoiceChoice = 'british' | 'american';

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const SPEEDS = [0.75, 1, 1.25];

function planLabel(plan: string | null, academyStudent: boolean): string {
  if (academyStudent) return 'Academy student';
  if (plan === 'pro') return 'Premium';
  if (plan === 'tester') return 'Tester';
  if (plan === 'academy') return 'Academy';
  return 'Free';
}

export function ProfilePage({
  userId,
  email,
  plan,
  lessonsLeft,
  theme,
  defaultLevel,
  voice,
  speed,
  displayName,
  academyRole,
  academyName,
  onTheme,
  onSaved,
  onAcademyChanged,
}: {
  userId: string | null;
  email: string | null;
  plan: string | null;
  lessonsLeft: number;
  theme: ThemeChoice;
  defaultLevel: CefrLevel;
  voice: VoiceChoice;
  speed: number;
  displayName: string;
  academyRole: 'owner' | 'student' | null;
  academyName: string | null;
  onTheme: (theme: ThemeChoice) => void;
  onSaved: (next: { theme: ThemeChoice; defaultLevel: CefrLevel; voice: VoiceChoice; speed: number; displayName: string }) => void;
  onAcademyChanged: () => void;
}) {
  const [name, setName] = useState(displayName);
  const [level, setLevel] = useState<CefrLevel>(defaultLevel);
  const [accent, setAccent] = useState<VoiceChoice>(voice);
  const [rate, setRate] = useState(speed);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(displayName); }, [displayName]);
  useEffect(() => { setLevel(defaultLevel); }, [defaultLevel]);
  useEffect(() => { setAccent(voice); }, [voice]);
  useEffect(() => { setRate(speed); }, [speed]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    setBusy(true);
    setNote(null);
    const nextName = name.trim().slice(0, 40);
    const result = await updateProfileSettings(userId, {
      theme,
      default_level: level,
      voice: accent,
      speed: rate,
      display_name: nextName,
    });
    setBusy(false);
    if (!result.ok) {
      setNote(result.missing
        ? 'Saved on this device. The account save will work after the database update.'
        : 'Could not save to your account. Try again.');
      onSaved({ theme, defaultLevel: level, voice: accent, speed: rate, displayName: nextName });
      return;
    }
    onSaved({ theme, defaultLevel: level, voice: accent, speed: rate, displayName: nextName });
    setNote('Saved.');
  };

  const academyStudent = academyRole === 'student';
  return (
    <div className="mx-auto w-full max-w-xl">
    <form onSubmit={save} className="space-y-5">
      <h1 className="text-2xl font-bold">Profile</h1>
      <p className="text-base">{email}</p>
      <p className="text-base font-semibold">
        {planLabel(plan, academyStudent)}
        {!academyStudent && (plan ?? 'free') === 'free' ? ` · ${lessonsLeft} of ${FREE_LESSON_LIMIT} free lessons left` : ''}
      </p>
      <label className="block text-sm font-semibold" htmlFor="display-name">
        Display name (optional)
      </label>
      <input
        id="display-name"
        maxLength={40}
        value={name}
        onChange={(event) => setName(event.target.value.slice(0, 40))}
        className="w-full rounded-lg border border-slate-400 px-3 py-2 text-base text-slate-900 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-50"
      />
      <fieldset>
        <legend className="text-sm font-semibold">Theme</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['light', 'dark', 'system'] as ThemeChoice[]).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={theme === choice}
              onClick={() => onTheme(choice)}
              className={theme === choice
                ? 'rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white'
                : 'rounded-lg border-2 border-slate-700 px-3 py-2 text-sm font-semibold dark:border-slate-200'}
            >
              {choice === 'light' ? 'Light' : choice === 'dark' ? 'Dark' : 'System'}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-semibold" htmlFor="default-level">Default English level</label>
      <select
        id="default-level"
        value={level}
        onChange={(event) => setLevel(event.target.value as CefrLevel)}
        className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-50"
      >
        {LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <label className="block text-sm font-semibold" htmlFor="voice">Default audio voice</label>
      <select
        id="voice"
        value={accent}
        onChange={(event) => setAccent(event.target.value as VoiceChoice)}
        className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-50"
      >
        <option value="british">British</option>
        <option value="american">American</option>
      </select>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Uses your device’s British or American English voice when it has one.
      </p>
      <label className="block text-sm font-semibold" htmlFor="speed">Speed</label>
      <select
        id="speed"
        value={String(rate)}
        onChange={(event) => setRate(Number(event.target.value))}
        className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-50"
      >
        {SPEEDS.map((item) => <option key={item} value={item}>{item}x</option>)}
      </select>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-blue-700 px-4 py-3 text-base font-bold text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {busy ? 'Saving...' : 'Save'}
      </button>
      {note && <p className="text-base">{note}</p>}
    </form>
    <AcademyProfileSection plan={plan} academyRole={academyRole} academyName={academyName} onChanged={onAcademyChanged} />
    </div>
  );
}
