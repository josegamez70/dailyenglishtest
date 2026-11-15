import { useEffect, useState, useSyncExternalStore } from 'react';
import { BackButton } from './BackButton';
import {
  buildVocabQuiz,
  filterVocabulary,
  shuffleItems,
  sourceLabel,
  VOCAB_QUIZ_MIN,
  type SavedWord,
  type VocabQuizQuestion,
  type VocabSource,
} from '../vocabulary';
import {
  getVocabularyState,
  loadVocabulary,
  recordVocabAnswer,
  removeVocabularyWord,
  subscribeVocabulary,
} from '../vocabularyStore';

type Mode = 'list' | 'cards' | 'quiz';
type SourceFilter = 'all' | VocabSource;

function formatSavedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function Flashcards({
  rows,
  onExit,
  persistGrades,
}: {
  rows: SavedWord[];
  onExit: () => void;
  persistGrades: boolean;
}) {
  const [order, setOrder] = useState(() => shuffleItems(rows));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = order[index];

  if (!rows.length) {
    return <p className="mt-4 text-base">Save a word to start flashcards.</p>;
  }
  if (!card) {
    return (
      <div className="mt-4">
        <p className="text-xl font-bold">You finished this set.</p>
        <button
          type="button"
          onClick={() => { setOrder(shuffleItems(rows)); setIndex(0); setFlipped(false); }}
          className="mt-4 w-full rounded-lg bg-blue-700 py-3 text-lg font-bold text-white hover:bg-blue-800"
        >
          Shuffle
        </button>
        <button type="button" onClick={onExit} className="mt-3 w-full rounded-lg border-2 border-slate-900 py-3 text-lg font-bold dark:border-slate-100">
          Back to My vocabulary
        </button>
      </div>
    );
  }

  const grade = (correct: boolean) => {
    if (persistGrades) void recordVocabAnswer(card.term, correct);
    setFlipped(false);
    if (!correct) setOrder((current) => [...current, card]);
    setIndex((current) => current + 1);
  };

  return (
    <div className="mt-4">
      <p className="text-base font-semibold">Card {Math.min(index + 1, order.length)} of {order.length}</p>
      <button
        type="button"
        onClick={() => setFlipped((current) => !current)}
        aria-pressed={flipped}
        className="mt-3 flex min-h-48 w-full flex-col items-center justify-center rounded-xl border-2 border-slate-900 bg-white p-6 text-center dark:border-slate-100 dark:bg-slate-800"
      >
        {flipped ? (
          <>
            <p className="text-xl font-bold">{card.meaning || 'No meaning saved.'}</p>
            {card.example && <p className="mt-3 text-base">Example: {card.example}</p>}
          </>
        ) : (
          <p className="text-3xl font-bold capitalize">{card.term}</p>
        )}
      </button>
      <p className="mt-2 text-center text-sm text-slate-700 dark:text-slate-200">Tap the card to flip.</p>
      {flipped && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => grade(true)} className="rounded-lg bg-blue-700 py-3 text-base font-bold text-white hover:bg-blue-800">
            I knew it
          </button>
          <button type="button" onClick={() => grade(false)} className="rounded-lg border-2 border-slate-900 py-3 text-base font-bold dark:border-slate-100">
            Again
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => { setOrder(shuffleItems(rows)); setIndex(0); setFlipped(false); }}
        className="mt-3 w-full rounded-lg border-2 border-slate-900 py-3 text-base font-bold dark:border-slate-100"
      >
        Shuffle
      </button>
    </div>
  );
}

function Quiz({
  rows,
  onExit,
  persistGrades,
}: {
  rows: SavedWord[];
  onExit: () => void;
  persistGrades: boolean;
}) {
  const [questions, setQuestions] = useState<VocabQuizQuestion[] | null>(() => buildVocabQuiz(rows));
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  if (!questions) {
    return (
      <div className="mt-4">
        <p className="text-base">Save at least {VOCAB_QUIZ_MIN} words with a meaning to start a quiz.</p>
        <button type="button" onClick={onExit} className="mt-4 w-full rounded-lg border-2 border-slate-900 py-3 text-lg font-bold dark:border-slate-100">
          Back to My vocabulary
        </button>
      </div>
    );
  }
  if (done) {
    return (
      <div className="mt-4">
        <h2 className="text-2xl font-bold">Quiz result</h2>
        <p className="mt-2 text-xl">You scored {score} out of {questions.length}.</p>
        <button
          type="button"
          onClick={() => {
            setQuestions(buildVocabQuiz(rows));
            setIndex(0);
            setScore(0);
            setDone(false);
          }}
          className="mt-4 w-full rounded-lg bg-blue-700 py-3 text-lg font-bold text-white hover:bg-blue-800"
        >
          Try again
        </button>
        <button type="button" onClick={onExit} className="mt-3 w-full rounded-lg border-2 border-slate-900 py-3 text-lg font-bold dark:border-slate-100">
          Back to My vocabulary
        </button>
      </div>
    );
  }

  const question = questions[index];
  const choose = (choice: string) => {
    const correct = choice === question.answer;
    if (correct) setScore((current) => current + 1);
    if (persistGrades) void recordVocabAnswer(question.term, correct);
    if (index + 1 >= questions.length) setDone(true);
    else setIndex((current) => current + 1);
  };

  return (
    <div className="mt-4">
      <p className="text-base font-semibold">Question {index + 1} of {questions.length}</p>
      <h2 className="mt-3 text-xl font-bold">{question.prompt}</h2>
      <div className="mt-4 space-y-2">
        {question.choices.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => choose(choice)}
            className="w-full rounded-lg border-2 border-slate-500 bg-white px-3 py-3 text-left text-base font-semibold text-slate-900 hover:border-blue-700 dark:border-slate-300 dark:bg-slate-800 dark:text-slate-50"
          >
            {choice}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VocabularyPage({
  userId,
  fixture,
  onBack,
  onSignIn,
}: {
  userId: string | null;
  /** Sample rows for a local preview. Skips the database. */
  fixture?: SavedWord[];
  onBack?: () => void;
  onSignIn?: () => void;
}) {
  const live = useSyncExternalStore(subscribeVocabulary, getVocabularyState, getVocabularyState);
  const [localRows, setLocalRows] = useState<SavedWord[]>(fixture ?? []);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [mode, setMode] = useState<Mode>('list');
  const [ready, setReady] = useState(Boolean(fixture) || !userId);

  useEffect(() => {
    if (fixture || !userId) return;
    let ignore = false;
    loadVocabulary().then(() => {
      if (!ignore) setReady(true);
    }).catch(() => {
      if (!ignore) setReady(true);
    });
    return () => { ignore = true; };
  }, [fixture, userId]);

  const rows = fixture ? localRows : live.rows;
  const missing = fixture ? false : live.missing;
  const visible = filterVocabulary(rows, query, source);

  const remove = (term: string) => {
    if (fixture) {
      setLocalRows((current) => current.filter((row) => row.term.toLowerCase() !== term.toLowerCase()));
      return;
    }
    void removeVocabularyWord(term);
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      {onBack && mode === 'list' && <BackButton onClick={onBack} />}
      {mode !== 'list' && (
        <BackButton onClick={() => setMode('list')} label="Back to My vocabulary" />
      )}
      <h1 className="text-2xl font-bold">My vocabulary</h1>
      {!userId && !fixture && (
        <div className="mt-3">
          <p className="text-base">Sign in to save words and practice them. Academy students can use this too.</p>
          {onSignIn && (
            <button type="button" onClick={onSignIn} className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-base font-bold text-white">
              Sign in
            </button>
          )}
        </div>
      )}
      {missing && <p className="mt-3 text-base">My vocabulary will be ready after the database update.</p>}
      {mode === 'list' && (userId || fixture) && (
        <>
          <p className="mt-2 text-base">Words you save from a lesson or from the word popup.</p>
          <label className="mt-4 block text-base font-semibold" htmlFor="vocab-search">Search</label>
          <input
            id="vocab-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Word or meaning"
            className="mt-1 w-full rounded-lg border-2 border-slate-500 bg-white px-3 py-2.5 text-base dark:border-slate-300 dark:bg-slate-900"
          />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Filter by source">
            {([
              ['all', 'All'],
              ['reading', 'Reading'],
              ['listening', 'Listening'],
              ['lookup', 'Word lookup'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={source === id}
                onClick={() => setSource(id)}
                className={source === id
                  ? 'rounded-lg border-2 border-blue-800 bg-blue-700 px-2 py-2 text-sm font-bold text-white'
                  : 'rounded-lg border-2 border-slate-500 bg-white px-2 py-2 text-sm font-semibold dark:border-slate-300 dark:bg-slate-800'}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode('cards')} className="rounded-lg bg-blue-700 py-3 text-base font-bold text-white hover:bg-blue-800">
              Flashcards
            </button>
            <button type="button" onClick={() => setMode('quiz')} className="rounded-lg border-2 border-slate-900 py-3 text-base font-bold dark:border-slate-100">
              Quiz
            </button>
          </div>
          {!ready && <p className="mt-4 text-base">Loading...</p>}
          {ready && visible.length === 0 && !missing && (
            <p className="mt-4 text-base">You have no saved words yet. Tick a key word in a lesson, or press Save word in the word popup.</p>
          )}
          <ul className="mt-4 space-y-3">
            {visible.map((row) => (
              <li key={row.id || row.term} className="rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-bold capitalize">{row.term}</h2>
                  <button type="button" onClick={() => remove(row.term)} className="shrink-0 rounded-lg border-2 border-slate-900 px-3 py-1 text-sm font-bold dark:border-slate-100">
                    Delete
                  </button>
                </div>
                <p className="mt-2 text-base">{row.meaning || 'No meaning saved.'}</p>
                {row.example && <p className="mt-2 text-base text-slate-800 dark:text-slate-100">Example: {row.example}</p>}
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                  {sourceLabel(row.sourceType)}
                  {row.lessonTitle ? ` · ${row.lessonTitle}` : ''}
                  {row.topic && row.topic !== row.lessonTitle ? ` · ${row.topic}` : ''}
                  {row.level ? ` · ${row.level}` : ''}
                  {row.createdAt ? ` · ${formatSavedDate(row.createdAt)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      {mode === 'cards' && <Flashcards rows={rows} onExit={() => setMode('list')} persistGrades={!fixture && Boolean(userId)} />}
      {mode === 'quiz' && <Quiz rows={rows} onExit={() => setMode('list')} persistGrades={!fixture && Boolean(userId)} />}
    </div>
  );
}
