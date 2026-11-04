import React, { useEffect, useRef, useState } from 'react';
import {
  exerciseLabel,
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
import { generateGrammarSet } from '../services/geminiService';
import { saveTestResult } from '../studyStore';
import CheckCircleIcon from './icons/CheckCircleIcon';
import XCircleIcon from './icons/XCircleIcon';

type PlayOrder = GrammarOrder & { shuffled: GrammarChunk[] };
type PlayItem = GrammarChoice | PlayOrder;

const LEVELS: GrammarLevel[] = ['B1', 'B2', 'C1'];
const EXERCISES: { id: GrammarExerciseType; label: string; hint: string }[] = [
  { id: 'blanks', label: 'Fill in the blanks', hint: 'Choose the word that completes the sentence.' },
  { id: 'phrasal', label: 'Phrasal verbs', hint: 'Choose the phrasal verb that fits the sentence.' },
  { id: 'order', label: 'Put in order', hint: 'Tap the parts in the right order.' },
];

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

export function GrammarPage({
  fontStep,
  fontClass,
  fontLabels,
  onFontStep,
  initialLevel,
  resetNonce,
  onActiveChange,
  onLessonsChanged,
}: {
  fontStep: number;
  fontClass: string;
  fontLabels: string[];
  onFontStep: (index: number) => void;
  initialLevel: GrammarLevel;
  resetNonce: number;
  onActiveChange: (active: boolean) => void;
  onLessonsChanged: () => void;
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
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seenReset = useRef(resetNonce);

  useEffect(() => {
    onActiveChange(phase !== 'setup');
    return () => onActiveChange(false);
  }, [phase, onActiveChange]);

  useEffect(() => {
    if (seenReset.current === resetNonce) return;
    seenReset.current = resetNonce;
    abortRef.current?.abort();
    setBusy(false);
    setError(null);
    setPhase('setup');
  }, [resetNonce]);

  const selected = EXERCISES.find((item) => item.id === exercise) ?? EXERCISES[0];
  const current = items[index];

  const start = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
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
      setPhase('play');
      onLessonsChanged();
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      setError(err instanceof Error ? err.message : 'The exercises could not be created. Please try again.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  const finish = () => {
    const nextGrades = items.map((item, itemIndex) => {
      if (item.kind === 'order') return gradeOrder(item, placedTexts(placed[itemIndex] ?? [], item.shuffled));
      return gradeChoice(item, choices[itemIndex] ?? '');
    });
    setGrades(nextGrades);
    setPhase('results');
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

  const goNext = () => {
    if (index < items.length - 1) {
      setIndex(index + 1);
      return;
    }
    finish();
  };

  if (phase === 'results') {
    const score = grades.filter((grade) => grade.correct).length;
    const percentage = grades.length ? Math.round((score / grades.length) * 100) : 0;
    return (
      <div className="mx-auto w-full max-w-2xl">
        <TextSizeControl fontStep={fontStep} labels={fontLabels} onFontStep={onFontStep} />
        <div className="mt-4 rounded-xl bg-white p-6 shadow-lg dark:bg-slate-800">
          <h1 className="text-center text-3xl font-bold">{title}</h1>
          <p className="mt-2 text-center text-xl">You scored {score} out of {grades.length} ({percentage}%)</p>
          <div className="mt-6 space-y-4">
            {grades.map((grade, gradeIndex) => (
              <div
                key={gradeIndex}
                className={`rounded-lg border p-4 ${grade.correct ? 'border-green-700 bg-green-50 dark:border-green-600 dark:bg-green-950' : 'border-red-700 bg-red-50 dark:border-red-600 dark:bg-red-950'}`}
              >
                <p className={`mb-2 font-semibold ${fontClass}`}>{gradeIndex + 1}. {grade.prompt}</p>
                <div className="flex items-start">
                  {grade.correct ? (
                    <CheckCircleIcon className="mr-2 mt-0.5 h-5 w-5 shrink-0 text-green-700 dark:text-green-300" />
                  ) : (
                    <XCircleIcon className="mr-2 mt-0.5 h-5 w-5 shrink-0 text-red-700 dark:text-red-300" />
                  )}
                  <p className={fontClass}>Your answer: {grade.userAnswer}</p>
                </div>
                <div className="mt-1 flex items-start">
                  <CheckCircleIcon className="mr-2 mt-0.5 h-5 w-5 shrink-0 text-green-700 dark:text-green-300" />
                  <p className={fontClass}>Correct answer: {grade.correctAnswer}</p>
                </div>
                <p className={`mt-3 ${fontClass}`}><span className="font-semibold">Why: </span>{grade.explanation}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPhase('setup')}
            className="mt-8 w-full rounded-lg bg-blue-700 py-3 text-lg font-bold text-white hover:bg-blue-800"
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
        <TextSizeControl fontStep={fontStep} labels={fontLabels} onFontStep={onFontStep} />
        <div className="mt-4 rounded-xl bg-white p-6 shadow-lg dark:bg-slate-800">
          <h1 className="text-center text-2xl font-bold">{title}</h1>
          <p className="mt-4 text-base font-semibold">Question {index + 1} of {items.length}</p>
          <div className="mt-1 h-2.5 w-full rounded-full bg-slate-300 dark:bg-slate-600">
            <div className="h-2.5 rounded-full bg-blue-700" style={{ width: `${((index + 1) / items.length) * 100}%` }} />
          </div>
          {current.kind === 'choice' ? (
            <>
              <h2 className={`mb-6 mt-6 font-semibold ${fontClass}`}>{current.prompt}</h2>
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
              <h2 className={`mb-4 mt-6 font-semibold ${fontClass}`}>{current.prompt}</h2>
              <p className="text-base">Tap the parts in the right order.</p>
              <div className="mt-3 min-h-16 rounded-lg border-2 border-dashed border-slate-400 p-3 dark:border-slate-500">
                {chosen.length === 0 && <p className="text-slate-600 dark:text-slate-300">Your order will appear here.</p>}
                <ol className="space-y-2">
                  {chosen.map((text, partIndex) => (
                    <li key={`${partIndex}-${text}`} className={`rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-700 ${fontClass}`}>
                      <span className="font-semibold">{partIndex + 1}.</span> {text}
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
      <h1 className="text-3xl font-bold">Grammar</h1>
      <p className="mt-2 text-base text-slate-800 dark:text-slate-100">Practice grammar with 10 short exercises. One set uses one free lesson.</p>
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
        aria-busy={busy}
        className="mt-6 w-full rounded-lg bg-blue-700 py-3 text-lg font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700"
      >
        {busy ? 'Writing your exercises...' : 'Start exercises'}
      </button>
      {busy && (
        <button
          type="button"
          onClick={() => abortRef.current?.abort()}
          className="mt-3 w-full rounded-lg border-2 border-slate-700 py-3 text-base font-semibold dark:border-slate-200"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
