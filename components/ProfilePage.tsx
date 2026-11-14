import React, { useEffect, useRef, useState } from 'react';
import { FREE_LESSON_LIMIT } from '../auth';
import { updateProfileSettings } from '../studyStore';
import type { CefrLevel } from '../progressStats';
import { AcademyProfileSection } from './AcademyProfileSection';
import { PricingPanel } from './PricingPanel';
import { PilotStatusBanner } from './PilotPages';
import { BackButton } from './BackButton';

export type ThemeChoice = 'light' | 'dark' | 'system';
/** Still stored on the profile. Playback ignores it and always uses American English. */
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
  speed,
  displayName,
  academyRole,
  academyName,
  onTheme,
  onSaved,
  onAcademyChanged,
  onBack,
}: {
  userId: string | null;
  email: string | null;
  plan: string | null;
  lessonsLeft: number;
  theme: ThemeChoice;
  defaultLevel: CefrLevel;
  speed: number;
  displayName: string;
  academyRole: 'owner' | 'student' | null;
  academyName: string | null;
  onTheme: (theme: ThemeChoice) => void;
  onSaved: (next: { theme: ThemeChoice; defaultLevel: CefrLevel; speed: number; displayName: string }) => void;
  onAcademyChanged: () => void;
  onBack?: () => void;
}) {
  const [name, setName] = useState(displayName);
  const [level, setLevel] = useState<CefrLevel>(defaultLevel);
  const [rate, setRate] = useState(speed);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState({ name: displayName, level: defaultLevel, rate: speed, theme });
  const touched = useRef({ name: false, level: false, rate: false, theme: false });

  useEffect(() => {
    if (touched.current.name) return;
    setName(displayName);
    setSaved((current) => (current.name === displayName ? current : { ...current, name: displayName }));
  }, [displayName]);
  useEffect(() => {
    if (touched.current.level) return;
    setLevel(defaultLevel);
    setSaved((current) => (current.level === defaultLevel ? current : { ...current, level: defaultLevel }));
  }, [defaultLevel]);
  useEffect(() => {
    if (touched.current.rate) return;
    setRate(speed);
    setSaved((current) => (current.rate === speed ? current : { ...current, rate: speed }));
  }, [speed]);
  useEffect(() => {
    if (touched.current.theme) return;
    setSaved((current) => (current.theme === theme ? current : { ...current, theme }));
  }, [theme]);

  const dirty = name !== saved.name || level !== saved.level || rate !== saved.rate || theme !== saved.theme;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId || !dirty || busy) return;
    setBusy(true);
    setNote(null);
    const nextName = name.trim().slice(0, 40);
    const result = await updateProfileSettings(userId, {
      theme,
      default_level: level,
      speed: rate,
      display_name: nextName,
    });
    setBusy(false);
    if (!result.ok) {
      setNote(result.missing
        ? 'Saved on this device. The account save will work after the database update.'
        : 'Could not save to your account. Try again.');
      onSaved({ theme, defaultLevel: level, speed: rate, displayName: nextName });
      return;
    }
    touched.current = { name: false, level: false, rate: false, theme: false };
    setName(nextName);
    setSaved({ name: nextName, level, rate, theme });
    onSaved({ theme, defaultLevel: level, speed: rate, displayName: nextName });
  };

  const academyStudent = academyRole === 'student';
  return (
    <div className="mx-auto w-full max-w-xl">
    {onBack && <BackButton onClick={onBack} />}
    <PilotStatusBanner />
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
        onChange={(event) => {
          touched.current.name = true;
          setName(event.target.value.slice(0, 40));
        }}
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
              onClick={() => {
                touched.current.theme = true;
                onTheme(choice);
              }}
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
        onChange={(event) => {
          touched.current.level = true;
          setLevel(event.target.value as CefrLevel);
        }}
        className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-50"
      >
        {LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <label className="block text-sm font-semibold" htmlFor="speed">Speed</label>
      <select
        id="speed"
        value={String(rate)}
        onChange={(event) => {
          touched.current.rate = true;
          setRate(Number(event.target.value));
        }}
        className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-50"
      >
        {SPEEDS.map((item) => <option key={item} value={item}>{item}x</option>)}
      </select>
      <p className="text-sm text-slate-600 dark:text-slate-300">Audio uses an American English voice.</p>
      <button
        type="submit"
        disabled={busy || !dirty}
        aria-busy={busy}
        className={!dirty && !busy
          ? 'rounded-lg bg-green-700 px-4 py-3 text-base font-bold text-white disabled:opacity-100'
          : 'rounded-lg bg-blue-700 px-4 py-3 text-base font-bold text-white hover:bg-blue-800 disabled:opacity-60'}
      >
        {busy ? 'Saving...' : !dirty ? 'Saved ✓' : 'Save'}
      </button>
      {note && <p className="text-base">{note}</p>}
    </form>
    <PricingPanel signedIn={Boolean(userId)} plan={plan} academyRole={academyRole} variant="profile" />
    <AcademyProfileSection plan={plan} academyRole={academyRole} academyName={academyName} onChanged={onAcademyChanged} />
    </div>
  );
}
