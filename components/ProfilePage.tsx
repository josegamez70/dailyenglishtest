import React, { useEffect, useRef, useState } from 'react';
import { updateProfileSettings } from '../studyStore';
import type { CefrLevel } from '../progressStats';
import { normalizeCefr } from '../progressStats';
import { AcademyProfileSection } from './AcademyProfileSection';
import { PilotStatusBanner } from './PilotPages';
import { BackButton } from './BackButton';
import { soundEffectsEnabled, writeSoundEffects } from '../effects';

import { type ThemeChoice } from '../themeChoice';
import { profileHandle } from '../profileHandle';

export type { ThemeChoice };
/** Still stored on the profile. Playback ignores it and always uses American English. */
export type VoiceChoice = 'british' | 'american';

const LEVELS: CefrLevel[] = ['B1', 'B2', 'C1'];
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
  const [level, setLevel] = useState<CefrLevel>(normalizeCefr(defaultLevel));
  const [rate, setRate] = useState(speed);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState({ name: displayName, level: defaultLevel, rate: speed, theme });
  const [sounds, setSounds] = useState(() => soundEffectsEnabled());
  const touched = useRef({ name: false, level: false, rate: false, theme: false });

  useEffect(() => {
    if (touched.current.name) return;
    setName(displayName);
    setSaved((current) => (current.name === displayName ? current : { ...current, name: displayName }));
  }, [displayName]);
  useEffect(() => {
    if (touched.current.level) return;
    setLevel(normalizeCefr(defaultLevel));
    setSaved((current) => (current.level === normalizeCefr(defaultLevel) ? current : { ...current, level: normalizeCefr(defaultLevel) }));
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

  const persist = async () => {
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
    }
    touched.current = { name: false, level: false, rate: false, theme: false };
    setName(nextName);
    setSaved({ name: nextName, level, rate, theme });
    onSaved({ theme, defaultLevel: level, speed: rate, displayName: nextName });
  };

  useEffect(() => {
    if (!dirty) return undefined;
    const timer = window.setTimeout(() => { void persist(); }, 600);
    return () => window.clearTimeout(timer);
  }, [dirty, name, level, rate, theme]);

  void lessonsLeft;
  const academyStudent = academyRole === 'student';
  return (
    <div className="mx-auto w-full max-w-xl">
    {onBack && <BackButton onClick={onBack} />}
    <PilotStatusBanner />
    <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
      <h1 className="text-2xl font-bold">Profile</h1>
      {profileHandle(name) && <p className="text-lg font-bold">{profileHandle(name)}</p>}
      <p className="text-base">{email}</p>
      <p className="text-base font-semibold">
        {planLabel(plan, academyStudent)}
        {!academyStudent && (plan ?? 'free') === 'free' ? ' · Free for now' : ''}
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
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ['light', 'Light', 'bg-white'],
            ['dark', 'Dark', 'bg-slate-900'],
            ['system', 'System', 'bg-gradient-to-r from-white to-slate-900'],
            ['retro95', 'Retro 95', 'bg-[#000080]'],
          ] as const).map(([choice, label, swatch]) => (
            <button
              key={choice}
              type="button"
              aria-pressed={theme === choice}
              onClick={() => {
                touched.current.theme = true;
                onTheme(choice);
              }}
              className={theme === choice
                ? 'choice-pill rounded-lg bg-blue-700 px-2 py-2 text-sm font-bold text-white'
                : 'choice-pill rounded-lg border-2 border-slate-700 bg-white px-2 py-2 text-sm font-semibold text-slate-900 dark:border-slate-200 dark:bg-slate-900 dark:text-slate-50'}
            >
              <span className={`mx-auto mb-1 block h-8 w-full border border-slate-500 ${swatch}`} aria-hidden="true" />
              {label}
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
      <fieldset>
        <legend className="text-sm font-semibold">Sound effects</legend>
        <label className="mt-2 flex items-center gap-2 text-base">
          <input
            type="checkbox"
            checked={sounds}
            onChange={(event) => {
              const next = event.target.checked;
              setSounds(next);
              writeSoundEffects(next);
            }}
          />
          Play short sounds for right answers, wrong answers, and a finished exercise
        </label>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">This choice stays on this device.</p>
      </fieldset>
      <p className="text-base font-semibold" role="status">{busy || dirty ? 'Saving...' : 'Saved'}</p>
      {note && <p className="text-base">{note}</p>}
    </form>
    <AcademyProfileSection plan={plan} academyRole={academyRole} academyName={academyName} onChanged={onAcademyChanged} />
    </div>
  );
}
