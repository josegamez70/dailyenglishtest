import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BackButton } from './BackButton';
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
  groupTaskPacks,
  issuedPackCount,
  nextTaskStep,
  periodKey,
  taskPackIsComplete,
  taskPackProgress,
  vocabularyPracticeReady,
  type PacksPerDay,
  periodLabel,
  practiceHasQuiz,
  taskBlockMessage,
  grammarExercisesForLevel,
  shuffleTaskChoices,
  taskGrammarExercise,
  taskLevelLabel,
  taskStepLabel,
  taskTopicOptions,
  WILDCARD_TOPIC,
  type GrammarPiece,
  type PracticePiece,
  type TaskFormat,
  type TaskFrequency,
  type TaskGrammarLevel,
  type TaskSettings,
  type TaskVocabularyMode,
} from '../tasks';
import { getVocabularyState, loadVocabulary, subscribeVocabulary } from '../vocabularyStore';

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

function describePack(item: TaskPackClient, settings: TaskSettings, words: readonly { meaning: string }[]) {
  const itemReading = isPracticePiece(item.reading) && practiceHasQuiz(item.reading) ? item.reading : null;
  const itemListening = isPracticePiece(item.listening) && practiceHasQuiz(item.listening) ? item.listening : null;
  const itemGrammar = isGrammarPiece(item.grammar) ? item.grammar : null;
  const itemReady = item.status === 'ready' && Boolean(itemReading && itemListening && itemGrammar);
  const vocabularyReady = vocabularyPracticeReady(settings.vocabularyMode, words);
  const progressInput = {
    readingDone: item.readingDone,
    listeningDone: item.listeningDone,
    grammarDone: item.grammarDone,
    vocabularyMode: settings.vocabularyMode,
    vocabularyDone: item.vocabularyDone,
    vocabularyReady,
  };
  const progress = taskPackProgress(progressInput);
  const finished = taskPackIsComplete(progressInput);
  const when = periodLabel(settings.frequency, item.periodKey);
  let status = 'This pack is still being prepared.';
  if (item.status === 'blocked') status = 'This pack is paused.';
  else if (itemReady && finished) status = 'Complete';
  else if (itemReady) status = `${progress.done} of ${progress.total} done`;
  return { itemReading, itemListening, itemGrammar, itemReady, vocabularyReady, when, status, finished };
}

export function TasksPage({
  userId,
  fixture,
  section = 'settings',
  onOpenReading,
  onOpenListening,
  onOpenGrammar,
  onOpenVocabulary,
  onGoLessons,
  onBack,
  selectedPackId = null,
  onOpenPack,
  onClosePack,
}: {
  userId: string | null;
  /** Sample data for a local preview. Skips the database. */
  fixture?: { settings: TaskSettings; pack: TaskPackClient | null; packs?: TaskPackClient[] };
  /** Settings stay on Tasks. The generated lessons stay on Task packs. */
  section?: 'settings' | 'packs';
  onOpenReading: (piece: PracticePiece, packId: string) => void;
  onOpenListening: (piece: PracticePiece, packId: string) => void;
  onOpenGrammar: (piece: GrammarPiece, packId: string) => void;
  onOpenVocabulary?: (packId: string, mode: Exclude<TaskVocabularyMode, ''>) => void;
  onGoLessons?: () => void;
  onBack?: () => void;
  /** Set from /task-packs/:id. Null shows the pack list. */
  selectedPackId?: string | null;
  onOpenPack?: (packId: string) => void;
  onClosePack?: () => void;
}) {
  const [settings, setSettings] = useState<TaskSettings>(fixture?.settings ?? DEFAULT_TASK_SETTINGS);
  const [pack, setPack] = useState<TaskPackClient | null>(fixture?.pack ?? null);
  const [packs, setPacks] = useState<TaskPackClient[]>(fixture?.packs ?? (fixture?.pack ? [fixture.pack] : []));
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(Boolean(fixture));
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const vocabState = useSyncExternalStore(subscribeVocabulary, getVocabularyState, getVocabularyState);
  useEffect(() => {
    if (fixture || !userId) return;
    void loadVocabulary();
  }, [fixture, userId]);

  const applyLoaded = (loaded: { settings: TaskSettings; pack: TaskPackClient | null; packs?: TaskPackClient[]; missing: boolean }) => {
    setSettings(loaded.settings);
    setPack(loaded.pack);
    setPacks(loaded.packs ?? (loaded.pack ? [loaded.pack] : []));
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
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const current = await loadTaskScreen();
      applyLoaded(current);
      if (!alive.current || current.missing || !current.settings.enabled) return;
      const todayKey = periodKey(current.settings.frequency);
      const today = current.packs.filter((item) => item.periodKey === todayKey);
      const wanted = issuedPackCount(current.settings);
      const finished = today.filter((item) => item.status === 'ready' || item.status === 'blocked');
      if (finished.length >= wanted && today.length >= wanted) return;
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
    setNote(saved.vocabularyLocal
      ? 'Saved on this device. Vocabulary builder in tasks is kept for every device after the database update. The lessons appear in Task packs.'
      : 'Saved. The lessons appear in Task packs.');
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

  const showSettings = section === 'settings';
  const selectedPack = !showSettings && selectedPackId
    ? packs.find((item) => item.id === selectedPackId) ?? null
    : null;
  if (!showSettings && selectedPackId) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <BackButton onClick={() => onClosePack?.()} label="Back" />
        {!ready && <p className="text-base">Loading...</p>}
        {ready && !selectedPack && <p className="text-base">This pack is not in the list.</p>}
        {selectedPack && (
          <PackExercises
            item={selectedPack}
            settings={settings}
            words={vocabState.rows}
            onOpenReading={onOpenReading}
            onOpenListening={onOpenListening}
            onOpenGrammar={onOpenGrammar}
            onOpenVocabulary={onOpenVocabulary}
            onGoLessons={onGoLessons}
          />
        )}
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-3xl">
      {onBack && <BackButton onClick={onBack} />}
      <h1 className="text-2xl font-bold">{showSettings ? 'Tasks' : 'Task packs'}</h1>
      <p className="mt-2 text-base">
        {showSettings
          ? 'Choose how often a pack arrives, and the same options you use for a lesson. The lessons themselves are in Task packs.'
          : 'Each card is one pack. Open it to start Reading, Listening, Grammar, and Vocabulary builder when that is on. Opening a pack does not use another lesson.'}
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
              className={settings.enabled ? 'quiz-advance rounded-lg bg-blue-700 px-4 py-2 text-base font-bold text-white' : 'rounded-lg border-2 border-slate-700 px-4 py-2 text-base font-bold'}
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
              A new pack starts at midnight in Spain. A week starts on Monday. A weekly schedule still issues one pack.
            </p>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="text-base font-semibold">Packs per day</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([1, 2, 3] as PacksPerDay[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={settings.packsPerDay === item}
                  onClick={() => setSettings((current) => ({ ...current, packsPerDay: item }))}
                  className={choiceClass(settings.packsPerDay === item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
              Each pack is one reading, one listening, and one grammar exercise. This applies to a daily schedule.
            </p>
          </fieldset>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2 md:max-w-[calc(50%-0.5rem)]">
            <SelectField
              id="task-level"
              label="Level"
              value={settings.level}
              onChange={(value) => setSettings((current) => {
                const level = value as TaskSettings['level'];
                const allowed = new Set(taskTopicOptions(level).map((option) => String(option.value)));
                return {
                  ...current,
                  level,
                  topic: allowed.has(current.topic) ? current.topic : 'daily life',
                  listeningTopic: allowed.has(current.listeningTopic) ? current.listeningTopic : 'daily life',
                };
              })}
              options={[
                { value: 'beginner', label: 'Beginner' },
                { value: 'intermediate', label: 'Intermediate' },
                { value: 'advanced', label: 'Advanced' },
              ]}
            />
            </div>
            <SelectField
              id="task-reading-topic"
              label="Reading topic"
              value={settings.topic}
              onChange={(value) => setSettings((current) => ({ ...current, topic: value }))}
              options={taskTopicOptions(settings.level)}
            />
            <SelectField
              id="task-listening-topic"
              label="Listening topic"
              value={settings.listeningTopic}
              onChange={(value) => setSettings((current) => ({ ...current, listeningTopic: value }))}
              options={taskTopicOptions(settings.level)}
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
          {(settings.topic === WILDCARD_TOPIC || settings.listeningTopic === WILDCARD_TOPIC) && (
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
                  onClick={() => setSettings((current) => {
                    const allowed = grammarExercisesForLevel(item);
                    return {
                      ...current,
                      grammarLevel: item,
                      grammarExercise: allowed.includes(current.grammarExercise) ? current.grammarExercise : taskGrammarExercise(allowed[0]),
                    };
                  })}
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
              {grammarExercisesForLevel(settings.grammarLevel).map((item) => (
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
          <fieldset className="mt-4">
            <legend className="text-base font-semibold">Vocabulary builder</legend>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">Add saved words to each pack. Leave this off to keep packs as they are.</p>
            <div className="mt-2 grid gap-2">
              {([
                ['', 'Off'],
                ['flashcards', 'Flashcards'],
                ['quiz', 'Quiz'],
              ] as const).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={settings.vocabularyMode === value}
                  onClick={() => setSettings((current) => ({ ...current, vocabularyMode: value }))}
                  className={`${choiceClass(settings.vocabularyMode === value)} text-left`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            id="task-shuffle"
            onClick={() => setSettings((current) => ({ ...current, ...shuffleTaskChoices(current) }))}
            className="quiz-advance mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-slate-900 bg-white px-3 py-3 text-lg font-bold text-slate-900 hover:bg-slate-100 dark:border-slate-100 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-700"
          >
            Shuffle
          </button>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
            Picks a reading topic, a listening topic, and a grammar exercise for this level. You can change them before you save.
          </p>
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
              className={settings.emailReminders ? 'quiz-advance rounded-lg bg-blue-700 px-4 py-2 text-base font-bold text-white' : 'rounded-lg border-2 border-slate-700 px-4 py-2 text-base font-bold'}
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
            className="quiz-advance mt-4 w-full rounded-lg bg-blue-700 py-3 text-lg font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700"
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
      {!showSettings && groupTaskPacks(packs).map((day) => (
        <section key={day.key} className="mt-6">
          <h2 className="text-xl font-bold">{day.label}</h2>
          {day.packs.map((item) => {
            const summary = describePack(item, settings, vocabState.rows);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenPack?.(item.id)}
                className="mt-3 w-full rounded-xl border border-slate-300 bg-white p-4 text-left active:border-blue-700 dark:border-slate-600 dark:bg-slate-800 dark:active:border-blue-300"
              >
                <h3 className="text-lg font-bold">Pack {item.packSlot}</h3>
                <p className="mt-1 text-base">{summary.when}</p>
                <p className={`mt-1 text-base ${summary.finished ? 'font-semibold text-emerald-800 dark:text-emerald-200' : ''}`}>
                  {summary.status}
                </p>
              </button>
            );
          })}
        </section>
      ))}
      {!showSettings && ready && settings.enabled && !packReady && !preparing && !error && !missing && (
        <p className="mt-4 text-base">Your pack is not ready yet.</p>
      )}
    </div>
  );
}

function PackExercises({
  item,
  settings,
  words,
  onOpenReading,
  onOpenListening,
  onOpenGrammar,
  onOpenVocabulary,
  onGoLessons,
}: {
  item: TaskPackClient;
  settings: TaskSettings;
  words: readonly { meaning: string }[];
  onOpenReading: (piece: PracticePiece, packId: string) => void;
  onOpenListening: (piece: PracticePiece, packId: string) => void;
  onOpenGrammar: (piece: GrammarPiece, packId: string) => void;
  onOpenVocabulary?: (packId: string, mode: Exclude<TaskVocabularyMode, ''>) => void;
  onGoLessons?: () => void;
}) {
  const summary = describePack(item, settings, words);
  return (
    <>
      <h1 className="text-2xl font-bold">Pack {item.packSlot}</h1>
      <p className="mt-1 text-base">{summary.when}</p>
      <p className={`mt-1 text-base ${summary.finished ? 'font-semibold text-emerald-800 dark:text-emerald-200' : ''}`}>
        {summary.status}
      </p>
      {summary.itemReady && summary.itemReading && summary.itemListening && summary.itemGrammar && (
        <ul className="mt-4 space-y-3">
          <PackRow label="Reading" title={exerciseTitle(summary.itemReading, 'Reading')} done={item.readingDone} onOpen={() => onOpenReading(summary.itemReading as PracticePiece, item.id)} />
          <PackRow label="Listening" title={exerciseTitle(summary.itemListening, 'Listening')} done={item.listeningDone} onOpen={() => onOpenListening(summary.itemListening as PracticePiece, item.id)} />
          <PackRow label="Grammar" title={`${summary.itemGrammar.title} · ${summary.itemGrammar.level}`} done={item.grammarDone} onOpen={() => onOpenGrammar(summary.itemGrammar as GrammarPiece, item.id)} />
          {settings.vocabularyMode === 'flashcards' && !summary.vocabularyReady && (
            <li className="rounded-lg border border-slate-300 p-3 dark:border-slate-600">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Vocabulary builder</p>
              <p className="text-base">Save a word in a lesson to start flashcards. The rest of this pack is not waiting.</p>
              {onGoLessons && <button type="button" onClick={onGoLessons} className="mt-2 text-base font-bold text-blue-800 underline dark:text-blue-200">Go to lessons</button>}
            </li>
          )}
          {settings.vocabularyMode === 'quiz' && !summary.vocabularyReady && (
            <li className="rounded-lg border border-slate-300 p-3 dark:border-slate-600">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Vocabulary builder</p>
              <p className="text-base">A quiz needs at least 4 saved words with a meaning. The rest of this pack is not waiting.</p>
              {onGoLessons && <button type="button" onClick={onGoLessons} className="mt-2 text-base font-bold text-blue-800 underline dark:text-blue-200">Go to lessons</button>}
            </li>
          )}
          {settings.vocabularyMode && summary.vocabularyReady && onOpenVocabulary && (
            <PackRow
              label="Vocabulary builder"
              title={settings.vocabularyMode === 'quiz' ? 'Quiz' : 'Flashcards'}
              done={item.vocabularyDone}
              onOpen={() => onOpenVocabulary(item.id, settings.vocabularyMode as 'flashcards' | 'quiz')}
            />
          )}
        </ul>
      )}
    </>
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
