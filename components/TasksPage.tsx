import { useEffect, useRef, useState } from 'react';
import { QUESTION_COUNTS, WORD_COUNTS } from '../constants';
import { exerciseLabel } from '../grammarSet';
import {
  loadTaskScreen,
  requestTaskStep,
  saveTaskSettings,
  type TaskPackClient,
} from '../taskStore';
import {
  DEFAULT_TASK_SETTINGS,
  isGrammarPiece,
  isPracticePiece,
  nextTaskStep,
  periodKey,
  taskPackStatusLine,
  periodLabel,
  practiceHasQuiz,
  taskBlockMessage,
  taskLevelLabel,
  taskStepLabel,
  topicChoices,
  WILDCARD_TOPIC,
  type GrammarPiece,
  type PracticePiece,
  type TaskFormat,
  type TaskFrequency,
  type TaskGrammarExercise,
  type TaskGrammarLevel,
  type TaskSettings,
} from '../tasks';

const choiceClass = (active: boolean) => (
  active
    ? 'rounded-lg border-2 border-blue-800 bg-blue-700 px-3 py-3 text-base font-bold text-white'
    : 'rounded-lg border-2 border-slate-500 bg-white px-3 py-3 text-base font-semibold text-slate-900 hover:border-blue-700 dark:border-slate-300 dark:bg-slate-800 dark:text-slate-50'
);

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  options: { value: string | number; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-base font-semibold" htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border-2 border-slate-500 bg-white px-3 py-2.5 text-base text-slate-900 dark:border-slate-300 dark:bg-slate-800 dark:text-slate-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function exerciseTitle(piece: PracticePiece | null, fallback: string): string {
  if (!piece) return fallback;
  const format = piece.format === 'dialogue' ? 'Dialogue' : 'Text';
  return `${piece.title || fallback} · ${format} · ${piece.levelLabel || taskLevelLabel(piece.level)}`;
}

export function TasksPage({
  userId,
  fixture,
  section = 'settings',
  onOpenReading,
  onOpenListening,
  onOpenGrammar,
}: {
  userId: string | null;
  /** Sample data for a local preview. Skips the database. */
  fixture?: { settings: TaskSettings; pack: TaskPackClient | null };
  /** Settings stay on Tasks. The generated lessons stay on Task packs. */
  section?: 'settings' | 'packs';
  onOpenReading: (piece: PracticePiece, packId: string) => void;
  onOpenListening: (piece: PracticePiece, packId: string) => void;
  onOpenGrammar: (piece: GrammarPiece, packId: string) => void;
}) {
  const [settings, setSettings] = useState<TaskSettings>(fixture?.settings ?? DEFAULT_TASK_SETTINGS);
  const [pack, setPack] = useState<TaskPackClient | null>(fixture?.pack ?? null);
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(Boolean(fixture));
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const applyLoaded = (loaded: { settings: TaskSettings; pack: TaskPackClient | null; missing: boolean }) => {
    setSettings(loaded.settings);
    setPack(loaded.pack);
    setMissing(loaded.missing);
    if (loaded.pack?.status === 'blocked') {
      const reason = loaded.pack.blockReason === 'pilot_expired' || loaded.pack.blockReason === 'missing'
        ? loaded.pack.blockReason
        : 'free_limit';
      setError(taskBlockMessage(reason));
    }
  };

  const prepare = async (enabled: boolean) => {
    if (!enabled || fixture) return;
    setError(null);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await loadTaskScreen();
      applyLoaded(current);
      if (!alive.current || current.missing || !current.settings.enabled) return;
      if (current.pack?.status === 'ready' || current.pack?.status === 'blocked') return;
      const step = nextTaskStep({
        reading: current.pack?.reading ?? null,
        listening: current.pack?.listening ?? null,
        grammar: current.pack?.grammar ?? null,
      });
      setPreparing(taskStepLabel(step));
      const result = await requestTaskStep();
      if (!alive.current) return;
      if (result.missing) {
        setMissing(true);
        setPreparing(null);
        return;
      }
      if (result.busy) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      if (result.blocked) {
        setError(result.message || taskBlockMessage(result.blocked));
        setPreparing(null);
        const loaded = await loadTaskScreen();
        applyLoaded(loaded);
        return;
      }
      if (!result.ok) {
        setError(result.message || 'The task pack could not be created. Please try again.');
        setPreparing(null);
        const loaded = await loadTaskScreen();
        applyLoaded(loaded);
        return;
      }
      if (result.step === 'done') {
        const loaded = await loadTaskScreen();
        applyLoaded(loaded);
        setPreparing(null);
        return;
      }
      if (result.step === 'reading-story' || result.step === 'reading-quiz' || result.step === 'listening-story' || result.step === 'listening-quiz' || result.step === 'listening-audio' || result.step === 'grammar' || result.step === 'done') {
        setPreparing(taskStepLabel(result.step));
      }
    }
    setPreparing(null);
    setError('The task pack is still being prepared. Please try again.');
  };

  useEffect(() => {
    alive.current = true;
    if (fixture) return () => { alive.current = false; };
    let ignore = false;
    loadTaskScreen().then((loaded) => {
      if (ignore) return;
      applyLoaded(loaded);
      setReady(true);
      if (!loaded.missing && loaded.settings.enabled && loaded.pack?.status !== 'ready' && loaded.pack?.status !== 'blocked') {
        void prepare(true);
      }
    }).catch(() => {
      if (!ignore) setReady(true);
    });
    return () => {
      ignore = true;
      alive.current = false;
    };
    // Reload when the page is opened. Preparation continues inside prepare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture]);

  const save = async () => {
    if (!userId || fixture) return;
    setSaving(true);
    setNote(null);
    setError(null);
    const saved = await saveTaskSettings(userId, settings);
    setSaving(false);
    if (!saved.ok) {
      setMissing(Boolean(saved.missing));
      setError(saved.missing ? 'Tasks will be ready after the database update.' : 'The settings could not be saved.');
      return;
    }
    setNote('Saved. The lessons appear in Task packs.');
    if (settings.enabled) void prepare(true);
    else {
      const loaded = await loadTaskScreen(settings);
      applyLoaded(loaded);
    }
  };

  const reading = isPracticePiece(pack?.reading) && practiceHasQuiz(pack?.reading) ? pack?.reading ?? null : null;
  const listening = isPracticePiece(pack?.listening) && practiceHasQuiz(pack?.listening) ? pack?.listening ?? null : null;
  const grammar = isGrammarPiece(pack?.grammar) ? pack?.grammar ?? null : null;
  const packReady = pack?.status === 'ready' && reading && listening && grammar;
  const when = periodLabel(settings.frequency, pack?.periodKey || periodKey(settings.frequency));
  const finished = Boolean(pack?.readingDone && pack?.listeningDone && pack?.grammarDone);
  const packStatus = taskPackStatusLine(finished, when);

  const showSettings = section === 'settings';
  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-bold">{showSettings ? 'Tasks' : 'Task packs'}</h1>
      <p className="mt-2 text-base">
        {showSettings
          ? 'Choose how often a pack arrives, and the same options you use for a lesson. The lessons themselves are in Task packs.'
          : 'A pack is one reading exercise, one listening exercise, and one grammar exercise. Opening one does not use another lesson.'}
      </p>
      {missing && <p className="mt-3 text-base">Tasks will be ready after the database update.</p>}
      {!ready ? <p className="mt-6 text-base">Loading...</p> : null}
      {ready && showSettings && (
        <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
          <h2 className="text-lg font-bold">Task settings</h2>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold">Tasks</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">Turn the pack on or off.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              onClick={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))}
              className={settings.enabled ? 'rounded-lg bg-blue-700 px-4 py-2 text-base font-bold text-white' : 'rounded-lg border-2 border-slate-700 px-4 py-2 text-base font-bold'}
            >
              {settings.enabled ? 'On' : 'Off'}
            </button>
          </div>
          <fieldset className="mt-4">
            <legend className="text-base font-semibold">Frequency</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['daily', 'weekly'] as TaskFrequency[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={settings.frequency === item}
                  onClick={() => setSettings((current) => ({ ...current, frequency: item }))}
                  className={choiceClass(settings.frequency === item)}
                >
                  {item === 'daily' ? 'Daily' : 'Weekly'}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
              A new pack starts at midnight in Spain. A week starts on Monday.
            </p>
          </fieldset>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField
              id="task-level"
              label="Level"
              value={settings.level}
              onChange={(value) => setSettings((current) => ({ ...current, level: value as TaskSettings['level'] }))}
              options={[
                { value: 'beginner', label: 'Beginner' },
                { value: 'intermediate', label: 'Intermediate' },
                { value: 'advanced', label: 'Advanced' },
              ]}
            />
            <SelectField
              id="task-topic"
              label="Topic"
              value={settings.topic}
              onChange={(value) => setSettings((current) => ({ ...current, topic: value }))}
              options={topicChoices()}
            />
            <SelectField
              id="task-words"
              label="Length"
              value={settings.wordCount}
              onChange={(value) => setSettings((current) => ({ ...current, wordCount: Number(value) }))}
              options={WORD_COUNTS}
            />
            <SelectField
              id="task-questions"
              label="Number of questions"
              value={settings.questionCount}
              onChange={(value) => setSettings((current) => ({ ...current, questionCount: Number(value) }))}
              options={QUESTION_COUNTS}
            />
          </div>
          {settings.topic === WILDCARD_TOPIC && (
            <p className="mt-3 text-base">We will choose a topic for you at random.</p>
          )}
          <fieldset className="mt-4">
            <legend className="text-base font-semibold">Reading</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['text', 'dialogue'] as TaskFormat[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={settings.readingFormat === item}
                  onClick={() => setSettings((current) => ({ ...current, readingFormat: item }))}
                  className={choiceClass(settings.readingFormat === item)}
                >
                  {item === 'text' ? 'Text' : 'Dialogue'}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="text-base font-semibold">Listening</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['text', 'dialogue'] as TaskFormat[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={settings.listeningFormat === item}
                  onClick={() => setSettings((current) => ({ ...current, listeningFormat: item }))}
                  className={choiceClass(settings.listeningFormat === item)}
                >
                  {item === 'text' ? 'Text' : 'Dialogue'}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="text-base font-semibold">Grammar level</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['B1', 'B2', 'C1'] as TaskGrammarLevel[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={settings.grammarLevel === item}
                  onClick={() => setSettings((current) => ({ ...current, grammarLevel: item }))}
                  className={choiceClass(settings.grammarLevel === item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="text-base font-semibold">Grammar exercise</legend>
            <div className="mt-2 grid gap-2">
              {(['blanks', 'phrasal', 'order'] as TaskGrammarExercise[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={settings.grammarExercise === item}
                  onClick={() => setSettings((current) => ({ ...current, grammarExercise: item }))}
                  className={`${choiceClass(settings.grammarExercise === item)} text-left`}
                >
                  {exerciseLabel(item)}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="mt-4 block text-base font-semibold" htmlFor="task-grammar-topic">Grammar topic</label>
          <input
            id="task-grammar-topic"
            value={settings.grammarTopic}
            onChange={(event) => setSettings((current) => ({ ...current, grammarTopic: event.target.value.slice(0, 80) }))}
            placeholder="Any topic (optional)"
            maxLength={80}
            className="mt-1 w-full rounded-lg border-2 border-slate-500 bg-white px-3 py-2.5 text-base dark:border-slate-300 dark:bg-slate-900"
          />
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold">Email reminder</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">A message when a new pack is ready. The email can turn this off.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.emailReminders}
              onClick={() => setSettings((current) => ({ ...current, emailReminders: !current.emailReminders }))}
              className={settings.emailReminders ? 'rounded-lg bg-blue-700 px-4 py-2 text-base font-bold text-white' : 'rounded-lg border-2 border-slate-700 px-4 py-2 text-base font-bold'}
            >
              {settings.emailReminders ? 'On' : 'Off'}
            </button>
          </div>
          <p className="mt-4 text-sm text-slate-700 dark:text-slate-200">
            One pack uses one free lesson. Premium and an active academy are not counted. The 3 free lessons are unchanged for Reading, Listening, and Grammar. Opening a pack does not use another lesson.
          </p>
          <button
            type="button"
            onClick={() => { void save(); }}
            disabled={saving || !userId}
            className="mt-4 w-full rounded-lg bg-blue-700 py-3 text-lg font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700"
          >
            {saving ? 'Saving...' : 'Save tasks'}
          </button>
          {note && <p className="mt-3 text-base">{note}</p>}
          {error && <p className="mt-3 text-base text-red-800 dark:text-red-200" role="alert">{error}</p>}
        </div>
      )}
      {!showSettings && error && <p className="mt-4 text-base text-red-800 dark:text-red-200" role="alert">{error}</p>}
      {!showSettings && preparing && <p className="mt-4 text-base" role="status">{preparing}</p>}
      {!showSettings && error && settings.enabled && !preparing && (
        <button type="button" onClick={() => { void prepare(true); }} className="mt-3 rounded-lg border-2 border-slate-900 px-4 py-2 text-base font-bold dark:border-slate-100">
          Try again
        </button>
      )}
      {!showSettings && ready && !settings.enabled && !missing && (
        <p className="mt-4 text-base">Tasks are off. Turn them on in Tasks to get a new pack.</p>
      )}
      {!showSettings && packReady && reading && listening && grammar && pack && (
        <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
          <h2 className="text-lg font-bold">{packStatus.heading}</h2>
          <p className={`mt-1 text-base ${finished ? 'font-semibold text-emerald-800 dark:text-emerald-200' : ''}`}>
            {packStatus.line}
          </p>
          <ul className="mt-4 space-y-3">
            <PackRow
              label="Reading"
              title={exerciseTitle(reading, 'Reading')}
              done={pack.readingDone}
              onOpen={() => onOpenReading(reading, pack.id)}
            />
            <PackRow
              label="Listening"
              title={exerciseTitle(listening, 'Listening')}
              done={pack.listeningDone}
              onOpen={() => onOpenListening(listening, pack.id)}
            />
            <PackRow
              label="Grammar"
              title={`${grammar.title} · ${grammar.level}`}
              done={pack.grammarDone}
              onOpen={() => onOpenGrammar(grammar, pack.id)}
            />
          </ul>
        </div>
      )}
      {!showSettings && ready && settings.enabled && !packReady && !preparing && !error && !missing && (
        <p className="mt-4 text-base">Your pack is not ready yet.</p>
      )}
    </div>
  );
}

function PackRow({
  label,
  title,
  done,
  onOpen,
}: {
  label: string;
  title: string;
  done: boolean;
  onOpen: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-slate-300 p-3 dark:border-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{label}</p>
        <p className="text-base font-semibold">{title}</p>
        {done && <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Done</p>}
      </div>
      <button type="button" onClick={onOpen} className="rounded-lg bg-blue-700 px-4 py-2 text-base font-bold text-white hover:bg-blue-800">
        {done ? 'Open again' : 'Start'}
      </button>
    </li>
  );
}
