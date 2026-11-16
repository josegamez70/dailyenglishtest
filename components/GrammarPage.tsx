import React, { useEffect, useRef, useState } from 'react';
import { BackButton } from './BackButton';
import {
  exerciseLabel,
  GRAMMAR_ITEM_COUNT,
  gradeChoice,
  gradeOrder,
  grammarTitle,
  placeChunk,
  placedTexts,
  resetOrder,
  shuffleChunks,
  undoChunk,
  type GrammarChunk,
  type GrammarChoice,
  type GrammarExerciseType,
  type GrammarLevel,
  type GrammarOrder,
  type ItemGrade,
} from '../grammarSet';
import { grammarLessonRecord, type GrammarLaunch } from '../savedLessonMeta';
import { generateGrammarSet } from '../services/geminiService';
import { saveGrammarLesson, saveTestResult, updateSavedGrammar } from '../studyStore';
import { DefinedText, DictionaryPopup } from './DefinedText';
import CheckCircleIcon from './icons/CheckCircleIcon';
import Loader from './Loader';
import XCircleIcon from './icons/XCircleIcon';

type PlayOrder = GrammarOrder & { shuffled: GrammarChunk[] };
type PlayItem = GrammarChoice | PlayOrder;

const LEVELS: GrammarLevel[] = ['B1', 'B2', 'C1'];
const EXERCISES: { id: GrammarExerciseType; label: string; hint: string }[] = [
  { id: 'blanks', label: 'Fill in the blanks', hint: 'Choose the word that completes the sentence.' },
  { id: 'phrasal', label: 'Phrasal verbs', hint: 'Choose the phrasal verb that fits the sentence.' },
  { id: 'order', label: 'Put in order', hint: 'Tap the parts in the right order.' },
];

const GAP = '_____';
const LOAD_ESTIMATE_SECONDS = 12;

/** Word lookup for prompts, placed text, and explanations. The gap stays plain. */
function LookupText({ text }: { text: string }) {
  if (!text || text === '—') return <>{text}</>;
  if (!text.includes(GAP)) return <DefinedText text={text} />;
  const parts = text.split(GAP);
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {part ? <DefinedText text={part} /> : null}
          {index < parts.length - 1 ? GAP : null}
        </span>
      ))}
    </>
  );
}

function choiceClass(active: boolean): string {
  return active
    ? 'rounded-lg border-2 border-blue-800 bg-blue-700 px-3 py-3 text-base font-bold text-white ring-4 ring-blue-300'
    : 'rounded-lg border-2 border-slate-500 bg-white px-3 py-3 text-base font-semibold text-slate-900 hover:border-blue-700 dark:border-slate-300 dark:bg-slate-800 dark:text-slate-50';
}

function TextSizeControl({
  fontStep,
  labels,
  onFontStep,
}: {
  fontStep: number;
  labels: string[];
  onFontStep: (index: number) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-center text-base font-semibold">Text size: {labels[fontStep]}</p>
      <div className="flex w-full flex-nowrap items-stretch gap-1.5" role="group" aria-label="Text size">
        {labels.map((label, index) => {
          const selected = index === fontStep;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={selected}
              onClick={() => onFontStep(index)}
              className={
                selected
                  ? 'min-w-0 flex-1 whitespace-nowrap rounded-lg border-2 border-blue-800 bg-blue-700 px-1 py-2 text-sm font-bold text-white'
                  : 'min-w-0 flex-1 whitespace-nowrap rounded-lg border-2 border-slate-700 bg-white px-1 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 dark:border-slate-200 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700'
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SavedSetNote({ fromSaved, saveNote }: { fromSaved: boolean; saveNote: string | null }) {
  const text = saveNote || (fromSaved ? 'Saved set. Opening it does not use a lesson.' : '');
  if (!text) return null;
  return (
    <p className="mt-4 rounded-lg border border-emerald-700 bg-emerald-50 px-3 py-2 text-base text-emerald-950 dark:border-emerald-300 dark:bg-emerald-950 dark:text-emerald-50">
      {text}
    </p>
  );
}

export function GrammarPage({
  fontStep,
  fontClass,
  fontLabels,
  onFontStep,
  initialLevel,
  resetNonce,
  onActiveChange,
  onLessonsChanged,
  launch = null,
  onTaskComplete,
  onBack,
}: {
  fontStep: number;
  fontClass: string;
  fontLabels: string[];
  onFontStep: (index: number) => void;
  initialLevel: GrammarLevel;
  resetNonce: number;
  onActiveChange: (active: boolean) => void;
  onLessonsChanged: () => void;
  launch?: GrammarLaunch | null;
  /** Called when a task grammar set is finished, so the pack can be marked done. */
  onTaskComplete?: () => void;
  onBack?: () => void;
}) {
  const [level, setLevel] = useState<GrammarLevel>(initialLevel);
  const [exercise, setExercise] = useState<GrammarExerciseType>('blanks');
  const [topic, setTopic] = useState('');
  const [phase, setPhase] = useState<'setup' | 'play' | 'results'>('setup');
  const [items, setItems] = useState<PlayItem[]>([]);
  const [title, setTitle] = useState('');
  const [savedTopic, setSavedTopic] = useState('');
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<string[]>([]);
  const [placed, setPlaced] = useState<string[][]>([]);
  const [grades, setGrades] = useState<ItemGrade[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromSaved, setFromSaved] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seenReset = useRef(resetNonce);
  const seenLaunch = useRef<number | null>(null);
  const persistedIdRef = useRef<string | null>(null);
  const pendingRecordRef = useRef<Record<string, unknown> | null>(null);
  const taskRef = useRef(false);

  useEffect(() => {
    onActiveChange(phase !== 'setup');
    return () => onActiveChange(false);
  }, [phase, onActiveChange]);

  useEffect(() => {
    if (seenReset.current === resetNonce) return;
    seenReset.current = resetNonce;
    abortRef.current?.abort();
    setBusy(false);
    setLoadingStartedAt(null);
    setError(null);
    setPhase('setup');
  }, [resetNonce]);

  useEffect(() => {
    if (!launch || seenLaunch.current === launch.token) return;
    seenLaunch.current = launch.token;
    abortRef.current?.abort();
    setBusy(false);
    setLoadingStartedAt(null);
    setError(null);
    setSaveNote(null);
    setLevel(launch.level);
    setExercise(launch.exercise);
    setTopic(launch.topic);
    setSavedTopic(launch.topic);
    setTitle(launch.title);
    const play = launch.items.map((item) => (
      item.kind === 'order' ? { ...item, shuffled: shuffleChunks(item.chunks) } : item
    ));
    setItems(play);
    setChoices(play.map(() => ''));
    setPlaced(play.map(() => []));
    setIndex(0);
    setGrades(launch.grades ?? []);
    persistedIdRef.current = launch.id || null;
    pendingRecordRef.current = null;
    taskRef.current = launch.task === true;
    setFromSaved(Boolean(launch.id));
    if (launch.task) setSaveNote('Task. Opening it does not use a free lesson.');
    setPhase(launch.grades && launch.grades.length === launch.items.length ? 'results' : 'play');
  }, [launch]);

  const selected = EXERCISES.find((item) => item.id === exercise) ?? EXERCISES[0];
  const current = items[index];

  const start = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setLoadingStartedAt(Date.now());
    setError(null);
    try {
      const set = await generateGrammarSet({
        level,
        exercise,
        topic: topic.trim(),
      }, controller.signal);
      if (controller.signal.aborted) return;
      const play = set.items.map((item) => (
        item.kind === 'order' ? { ...item, shuffled: shuffleChunks(item.chunks) } : item
      ));
      setItems(play);
      setTitle(set.title || grammarTitle(exercise));
      setSavedTopic(set.topic);
      setChoices(play.map(() => ''));
      setPlaced(play.map(() => []));
      setIndex(0);
      setGrades([]);
      setFromSaved(false);
      setSaveNote(null);
      persistedIdRef.current = null;
      taskRef.current = false;
      pendingRecordRef.current = null;
      setPhase('play');
      onLessonsChanged();
      const record = grammarLessonRecord(set);
      void saveGrammarLesson(record, String(record.title)).then((saved) => {
        if (saved.id) {
          persistedIdRef.current = saved.id;
          if (pendingRecordRef.current) {
            const pending = pendingRecordRef.current;
            pendingRecordRef.current = null;
            void updateSavedGrammar(saved.id, pending);
          }
          return;
        }
        if (saved.missing) {
          setSaveNote('Grammar sets will appear in Saved lessons after the database update. Reading and listening lessons are unchanged.');
        }
      }).catch(() => undefined);
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      setError(err instanceof Error ? err.message : 'The exercises could not be created. Please try again.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
      setLoadingStartedAt(null);
    }
  };

  const finish = () => {
    const nextGrades = items.map((item, itemIndex) => {
      if (item.kind === 'order') return gradeOrder(item, placedTexts(placed[itemIndex] ?? [], item.shuffled));
      return gradeChoice(item, choices[itemIndex] ?? '');
    });
    setGrades(nextGrades);
    setPhase('results');
    const sourceItems = items.map((item) => (
      item.kind === 'order'
        ? { kind: 'order' as const, prompt: item.prompt, chunks: item.chunks, explanation: item.explanation }
        : { kind: 'choice' as const, prompt: item.prompt, options: item.options, correctAnswer: item.correctAnswer, explanation: item.explanation }
    ));
    const record = grammarLessonRecord({
      level,
      exercise,
      topic: savedTopic,
      title: title || grammarTitle(exercise),
      items: sourceItems,
      grades: nextGrades,
      task: taskRef.current,
    });
    const savedId = persistedIdRef.current;
    if (savedId) void updateSavedGrammar(savedId, record);
    else if (taskRef.current) void saveGrammarLesson(record, String(record.title));
    else pendingRecordRef.current = record;
    if (taskRef.current) onTaskComplete?.();
    const score = nextGrades.filter((grade) => grade.correct).length;
    void saveTestResult({
      level,
      topic: savedTopic || exerciseLabel(exercise),
      title: title || grammarTitle(exercise),
      score,
      total: nextGrades.length,
      mode: 'grammar',
      wrongAnswers: nextGrades.flatMap((grade) => (
        grade.correct ? [] : [{ question: grade.prompt, userAnswer: grade.userAnswer, correctAnswer: grade.correctAnswer }]
      )),
    }).catch(() => undefined);
  };

  const retrySet = () => {
    setItems((current) => current.map((item) => (
      item.kind === 'order' ? { ...item, shuffled: shuffleChunks(item.chunks) } : item
    )));
    setChoices(items.map(() => ''));
    setPlaced(items.map(() => []));
    setIndex(0);
    setGrades([]);
    setPhase('play');
  };

  const goNext = () => {
    if (index < items.length - 1) {
      setIndex(index + 1);
      return;
    }
    finish();
  };

  const leaveGrammar = () => {
    if (phase !== 'setup' && !fromSaved && !launch?.task) {
      setPhase('setup');
      return;
    }
    onBack?.();
  };
  const grammarBackLabel = phase !== 'setup' && !fromSaved && !launch?.task
    ? 'Back'
    : launch?.task
      ? 'Back to Task packs'
      : fromSaved
        ? 'Back to Saved lessons'
        : 'Back';

  if (phase === 'results') {
    const score = grades.filter((grade) => grade.correct).length;
    const percentage = grades.length ? Math.round((score / grades.length) * 100) : 0;
    return (
      <div className="mx-auto w-full max-w-2xl">
        {onBack && <BackButton onClick={leaveGrammar} label={grammarBackLabel} />}
        <DictionaryPopup />
        <TextSizeControl fontStep={fontStep} labels={fontLabels} onFontStep={onFontStep} />
        <div className="mt-4 rounded-xl bg-white p-6 shadow-lg dark:bg-slate-800">
          <h1 className="text-center text-3xl font-bold">{title}</h1>
          <SavedSetNote fromSaved={fromSaved} saveNote={saveNote} />
          <p className="mt-2 text-center text-xl">You scored {score} out of {grades.length} ({percentage}%)</p>
          <div className="mt-6 space-y-4">
            {grades.map((grade, gradeIndex) => (
              <div
                key={gradeIndex}
                className={`rounded-lg border p-4 ${grade.correct ? 'border-green-700 bg-green-50 dark:border-green-600 dark:bg-green-950' : 'border-red-700 bg-red-50 dark:border-red-600 dark:bg-red-950'}`}
              >
                <p className={`mb-2 font-semibold ${fontClass}`}>{gradeIndex + 1}. <LookupText text={grade.prompt} /></p>
                <div className="flex items-start">
                  {grade.correct ? (
                    <CheckCircleIcon className="mr-2 mt-0.5 h-5 w-5 shrink-0 text-green-700 dark:text-green-300" />
                  ) : (
                    <XCircleIcon className="mr-2 mt-0.5 h-5 w-5 shrink-0 text-red-700 dark:text-red-300" />
                  )}
                  <p className={fontClass}>Your answer: <LookupText text={grade.userAnswer} /></p>
                </div>
                <div className="mt-1 flex items-start">
                  <CheckCircleIcon className="mr-2 mt-0.5 h-5 w-5 shrink-0 text-green-700 dark:text-green-300" />
                  <p className={fontClass}>Correct answer: <LookupText text={grade.correctAnswer} /></p>
                </div>
                <p className={`mt-3 ${fontClass}`}><span className="font-semibold">Why: </span><LookupText text={grade.explanation} /></p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={retrySet}
            className="mt-8 w-full rounded-lg border-2 border-blue-800 bg-white py-3 text-lg font-bold text-blue-800 hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-100 dark:hover:bg-slate-700"
          >
            Try this set again
          </button>
          <button
            type="button"
            onClick={() => {
              setFromSaved(false);
              persistedIdRef.current = null;
              pendingRecordRef.current = null;
              setPhase('setup');
            }}
            className="mt-3 w-full rounded-lg bg-blue-700 py-3 text-lg font-bold text-white hover:bg-blue-800"
          >
            Try another
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'play' && current) {
    const answered = current.kind === 'choice'
      ? Boolean(choices[index])
      : (placed[index]?.length ?? 0) === current.chunks.length;
    const orderState = current.kind === 'order'
      ? { placed: placed[index] ?? [], pool: current.shuffled.filter((chunk) => !(placed[index] ?? []).includes(chunk.id)) }
      : null;
    const chosen = current.kind === 'order' && orderState ? placedTexts(orderState.placed, current.shuffled) : [];
    return (
      <div className="mx-auto w-full max-w-2xl">
        {onBack && <BackButton onClick={leaveGrammar} label={grammarBackLabel} />}
        <DictionaryPopup />
        <TextSizeControl fontStep={fontStep} labels={fontLabels} onFontStep={onFontStep} />
        <div className="mt-4 rounded-xl bg-white p-6 shadow-lg dark:bg-slate-800">
          <h1 className="text-center text-2xl font-bold">{title}</h1>
          <SavedSetNote fromSaved={fromSaved} saveNote={saveNote} />
          <p className="mt-4 text-base font-semibold">Question {index + 1} of {items.length}</p>
          <div className="mt-1 h-2.5 w-full rounded-full bg-slate-300 dark:bg-slate-600">
            <div className="h-2.5 rounded-full bg-blue-700" style={{ width: `${((index + 1) / items.length) * 100}%` }} />
          </div>
          {current.kind === 'choice' ? (
            <>
              <h2 className={`mb-6 mt-6 font-semibold ${fontClass}`}><LookupText text={current.prompt} /></h2>
              <div className="space-y-3">
                {current.options.map((option, optionIndex) => {
                  const selectedOption = choices[index] === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setChoices((currentChoices) => currentChoices.map((value, choiceIndex) => choiceIndex === index ? option : value))}
                      className={`w-full rounded-lg border-2 p-4 text-left ${fontClass} ${
                        selectedOption
                          ? 'border-blue-700 bg-blue-100 text-slate-900 dark:bg-blue-900 dark:text-slate-50'
                          : 'border-slate-400 bg-white text-slate-900 hover:bg-slate-100 dark:bg-slate-700 dark:text-slate-50 dark:hover:bg-slate-600'
                      }`}
                    >
                      <span className="font-semibold">{String.fromCharCode(65 + optionIndex)}.</span> {option}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <h2 className={`mb-4 mt-6 font-semibold ${fontClass}`}><LookupText text={current.prompt} /></h2>
              <p className="text-base">Tap the parts in the right order.</p>
              <div className="mt-3 min-h-16 rounded-lg border-2 border-dashed border-slate-400 p-3 dark:border-slate-500">
                {chosen.length === 0 && <p className="text-slate-600 dark:text-slate-300">Your order will appear here.</p>}
                <ol className="space-y-2">
                  {chosen.map((text, partIndex) => (
                    <li key={`${partIndex}-${text}`} className={`rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-700 ${fontClass}`}>
                      <span className="font-semibold">{partIndex + 1}.</span> <LookupText text={text} />
                    </li>
                  ))}
                </ol>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!orderState) return;
                    const next = undoChunk(orderState, current.shuffled);
                    setPlaced((currentPlaced) => currentPlaced.map((ids, placeIndex) => placeIndex === index ? next.placed : ids));
                  }}
                  disabled={!orderState?.placed.length}
                  className="rounded-lg border-2 border-slate-700 px-4 py-2 text-base font-semibold disabled:opacity-50 dark:border-slate-200"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = resetOrder(current.shuffled);
                    setPlaced((currentPlaced) => currentPlaced.map((ids, placeIndex) => placeIndex === index ? next.placed : ids));
                  }}
                  disabled={!orderState?.placed.length}
                  className="rounded-lg border-2 border-slate-700 px-4 py-2 text-base font-semibold disabled:opacity-50 dark:border-slate-200"
                >
                  Reset
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {orderState?.pool.map((chunk) => (
                  <button
                    key={chunk.id}
                    type="button"
                    onClick={() => {
                      if (!orderState) return;
                      const next = placeChunk(orderState, chunk.id);
                      setPlaced((currentPlaced) => currentPlaced.map((ids, placeIndex) => placeIndex === index ? next.placed : ids));
                    }}
                    className={`w-full rounded-lg border-2 border-slate-400 bg-white px-4 py-3 text-left font-semibold hover:bg-slate-100 dark:border-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600 ${fontClass}`}
                  >
                    {chunk.text}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            type="button"
            onClick={goNext}
            disabled={!answered}
            className="mt-8 w-full rounded-lg bg-green-700 py-3 text-lg font-bold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700"
          >
            {index < items.length - 1 ? 'Next' : 'Check answers'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      {onBack && <BackButton onClick={leaveGrammar} label={grammarBackLabel} />}
      <h1 className="text-3xl font-bold">Grammar</h1>
      <p className="mt-2 text-base text-slate-800 dark:text-slate-100">Practice grammar with {GRAMMAR_ITEM_COUNT} short exercises. One set uses one free lesson.</p>
      <fieldset className="mt-6">
        <legend className="text-base font-semibold">Level</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {LEVELS.map((item) => (
            <button key={item} type="button" aria-pressed={level === item} onClick={() => setLevel(item)} className={choiceClass(level === item)}>
              {item}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-6">
        <legend className="text-base font-semibold">Exercise</legend>
        <div className="mt-2 grid gap-2">
          {EXERCISES.map((item) => (
            <button key={item.id} type="button" aria-pressed={exercise === item.id} onClick={() => setExercise(item.id)} className={`${choiceClass(exercise === item.id)} text-left`}>
              {item.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-base text-slate-700 dark:text-slate-200">{selected.hint}</p>
      </fieldset>
      <label className="mt-6 block text-base font-semibold" htmlFor="grammar-topic">Topic</label>
      <input
        id="grammar-topic"
        value={topic}
        onChange={(event) => setTopic(event.target.value)}
        placeholder="Any topic (optional)"
        maxLength={80}
        className="mt-1 w-full rounded-lg border-2 border-slate-500 bg-white px-3 py-2.5 text-base text-slate-900 dark:border-slate-300 dark:bg-slate-800 dark:text-slate-50"
      />
      {error && <p className="mt-4 text-base text-red-800 dark:text-red-300" role="alert">{error}</p>}
      <button
        type="button"
        onClick={() => { void start(); }}
        disabled={busy}
        className="mt-6 w-full rounded-lg bg-blue-700 py-3 text-lg font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700"
      >
        Start exercises
      </button>
      {busy && loadingStartedAt != null && (
        <Loader
          startedAt={loadingStartedAt}
          estimateSeconds={LOAD_ESTIMATE_SECONDS}
          note="Writing your exercises..."
          onCancel={() => abortRef.current?.abort()}
        />
      )}
    </div>
  );
}
