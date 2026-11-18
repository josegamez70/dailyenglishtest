import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BackButton } from './BackButton';
import { ExerciseComplete } from './ExerciseComplete';
import { SpanishWhy } from './SpanishWhy';
import { playEffect, primeAudio } from '../effects';
import { addVocabAnswers } from '../badges';
import { loadBadgeStats } from '../badgeStats';
import { publishBadgeProgress } from '../badgeToast';
import { useRetroTheme } from '../retroTheme';
import { defineSearchText, meaningToSave, searchLookupTerm, type DictEntry } from '../dictionary';
import { PronounceButton, stopPronunciation } from './PronounceButton';
import { SavedMeaning, SenseText } from './SenseText';
import type { PronunciationAccent } from '../pronounce';
import {
  buildVocabQuiz,
  filterVocabulary,
  shuffleItems,
  sourceLabel,
  termKey,
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
  saveVocabularyWord,
  subscribeVocabulary,
} from '../vocabularyStore';

type Mode = 'list' | 'cards' | 'quiz';
type SourceFilter = 'all' | VocabSource;

function SearchLookup({
  query,
  rows,
  ready,
  accent,
  onSave,
}: {
  query: string;
  rows: SavedWord[];
  ready: boolean;
  accent: PronunciationAccent;
  onSave: (entry: DictEntry) => Promise<void>;
}) {
  const [shown, setShown] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'missing'>('idle');
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const term = searchLookupTerm(query);
  const unmatched = Boolean(term) && ready && filterVocabulary(rows, query, 'all').length === 0;

  useEffect(() => {
    setShown('');
    setStatus('idle');
    setEntry(null);
    if (!unmatched || !term) return undefined;
    let ignore = false;
    const timer = window.setTimeout(() => {
      setShown(term);
      setStatus('loading');
      setEntry(null);
      defineSearchText(term).then((result) => {
        if (ignore) return;
        setEntry(result);
        setStatus(result ? 'ready' : 'missing');
      }).catch(() => {
        if (!ignore) {
          setEntry(null);
          setStatus('missing');
        }
      });
    }, 500);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [unmatched, term]);

  if (!unmatched || !shown || status === 'idle') return null;

  return (
    <div className="mt-3 rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
      {status === 'loading' && <p className="text-base">Looking up...</p>}
      {status === 'missing' && <p className="text-base">No meaning found for &quot;{shown}&quot;.</p>}
      {status === 'ready' && entry && (
        <>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{entry.word}</h2>
            <PronounceButton term={entry.word} accent={accent} />
          </div>
          <SenseText senses={entry.senses} note={entry.note} />
          {entry.example && <p className="mt-2 text-base text-slate-800 dark:text-slate-100">Example: {entry.example}</p>}
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onSave(entry).finally(() => setSaving(false));
            }}
            className="mt-3 w-full rounded-lg border-2 border-slate-900 bg-white py-2 text-base font-bold text-slate-900 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-100 dark:bg-slate-900 dark:text-slate-50"
          >
            Save word
          </button>
        </>
      )}
    </div>
  );
}

function formatSavedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function Flashcards({
  rows,
  onExit,
  exitLabel = 'Back to Vocabulary builder',
  persistGrades,
  onFinished,
  accent,
}: {
  rows: SavedWord[];
  onExit: () => void;
  exitLabel?: string;
  persistGrades: boolean;
  onFinished?: () => void;
  accent: PronunciationAccent;
}) {
  const [order, setOrder] = useState(() => shuffleItems(rows));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = order[index];
  const finished = !card && order.length > 0;
  const told = useRef(false);
  useEffect(() => {
    if (!finished || told.current) return;
    told.current = true;
    onFinished?.();
  }, [finished, onFinished]);

  if (!rows.length) {
    return <p className="mt-4 text-base">Save a word to start flashcards.</p>;
  }
  if (finished) {
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
          {exitLabel}
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
      <p className="text-base font-semibold">{index < rows.length ? `Card ${index + 1} of ${rows.length}` : 'Review again'}</p>
      <div className="relative mt-3">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setFlipped((current) => !current)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            setFlipped((current) => !current);
          }}
          aria-pressed={flipped}
          className="flex min-h-48 w-full flex-col items-center justify-center rounded-xl border-2 border-slate-900 bg-white p-6 text-center dark:border-slate-100 dark:bg-slate-800"
        >
          {flipped ? (
            <>
              <SavedMeaning text={card.meaning} prominent />
              {card.example && <p className="mt-3 text-base">Example: {card.example}</p>}
            </>
          ) : (
            <p className="text-3xl font-bold capitalize">{card.term}</p>
          )}
        </div>
        {!flipped && (
          <div className="absolute right-3 top-3">
            <PronounceButton term={card.term} accent={accent} />
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-sm text-slate-700 dark:text-slate-200">Tap the card to flip.</p>
      {flipped && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => grade(true)} className="quiz-advance rounded-lg bg-blue-700 py-3 text-base font-bold text-white hover:bg-blue-800">
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
  exitLabel = 'Back to Vocabulary builder',
  persistGrades,
  onFinished,
}: {
  rows: SavedWord[];
  onExit: () => void;
  exitLabel?: string;
  persistGrades: boolean;
  onFinished?: () => void;
}) {
  const [questions, setQuestions] = useState<VocabQuizQuestion[] | null>(() => buildVocabQuiz(rows));
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [celebrate, setCelebrate] = useState(true);
  const told = useRef(false);
  const badgeStart = useRef<Awaited<ReturnType<typeof loadBadgeStats>> | null>(null);
  const retro = useRetroTheme();
  useEffect(() => {
    let ignore = false;
    loadBadgeStats().then((stats) => {
      if (!ignore) badgeStart.current = stats;
    }).catch(() => undefined);
    return () => { ignore = true; };
  }, []);
  useEffect(() => {
    if (!done || told.current) return;
    told.current = true;
    onFinished?.();
  }, [done, onFinished]);

  const restart = () => {
    setQuestions(buildVocabQuiz(rows));
    setIndex(0);
    setScore(0);
    setPicks([]);
    setDone(false);
    setCelebrate(true);
  };

  if (!questions) {
    return (
      <div className="mt-4">
        <p className="text-base">Save at least {VOCAB_QUIZ_MIN} words with a meaning to start a quiz.</p>
        <button type="button" onClick={onExit} className="mt-4 w-full rounded-lg border-2 border-slate-900 py-3 text-lg font-bold dark:border-slate-100">
          {exitLabel}
        </button>
      </div>
    );
  }
  if (done) {
    return (
      <div className="phase2-enter mt-4">
        {celebrate && (
          <ExerciseComplete
            score={score}
            total={questions.length}
            marks={questions.map((question, item) => picks[item] === question.answer)}
            onReview={() => setCelebrate(false)}
            onNew={restart}
          />
        )}
        <h2 className="text-2xl font-bold">Quiz result</h2>
        <p className="mt-2 text-xl">You scored {score} out of {questions.length}.</p>
        <div className="mt-4 space-y-3">
          {questions.map((item, itemIndex) => {
            const picked = picks[itemIndex] ?? '';
            const right = picked === item.answer;
            return (
              <div
                key={`${item.term}-${itemIndex}`}
                className={`rounded-lg border-2 p-4 ${
                  right
                    ? 'border-green-700 bg-green-50 dark:border-green-600 dark:bg-green-950'
                    : 'border-red-700 bg-red-50 dark:border-red-600 dark:bg-red-950'
                }`}
              >
                <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{itemIndex + 1}. {item.prompt}</p>
                <p className="mt-2 text-base text-slate-900 dark:text-slate-50">Your answer: {picked || '—'}</p>
                {!right && (
                  <p className="mt-1 text-base text-slate-900 dark:text-slate-50">Correct answer: {item.answer}</p>
                )}
                {item.explanation && (
                  <p className="mt-3 text-base text-slate-900 dark:text-slate-50">
                    <span className="font-semibold">Why: </span>
                    {item.explanation}
                  </p>
                )}
                {item.explanation && <SpanishWhy text={item.explanation} />}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={restart}
          className="mt-4 w-full rounded-lg bg-blue-700 py-3 text-lg font-bold text-white hover:bg-blue-800"
        >
          Try again
        </button>
        <button type="button" onClick={onExit} className="mt-3 w-full rounded-lg border-2 border-slate-900 py-3 text-lg font-bold dark:border-slate-100">
          {exitLabel}
        </button>
      </div>
    );
  }

  const question = questions[index];
  const picked = picks[index] ?? '';
  const locked = Boolean(picked);
  const correct = picked === question.answer;
  const choose = (choice: string) => {
    if (locked) return;
    const right = choice === question.answer;
    primeAudio();
    playEffect(right ? 'correct' : 'wrong', retro);
    if (right) setScore((current) => current + 1);
    if (persistGrades) void recordVocabAnswer(question.term, right);
    setPicks((current) => {
      const next = [...current];
      next[index] = choice;
      return next;
    });
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
            disabled={locked}
            aria-pressed={picked === choice}
            className={`w-full rounded-lg border-2 px-3 py-3 text-left text-lg font-semibold quiz-option ${
              locked && choice === question.answer
                ? 'border-green-700 bg-green-50 text-slate-900'
                : locked && choice === picked
                  ? 'border-red-700 bg-red-50 text-slate-900'
                  : 'border-slate-500 bg-white text-slate-900 hover:border-blue-700 dark:border-slate-300 dark:bg-slate-800 dark:text-slate-50'
            }`}
          >
            {choice}
          </button>
        ))}
      </div>
      {locked && (
        <div className={`mt-4 rounded-lg border-2 p-4 ${correct ? 'border-green-700 bg-green-50 dark:border-green-600 dark:bg-green-950' : 'border-red-700 bg-red-50 dark:border-red-600 dark:bg-red-950'}`}>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-50">{correct ? 'Right.' : 'Not quite.'}</p>
          {!correct && (
            <p className="mt-1 text-base text-slate-900 dark:text-slate-50">Correct answer: {question.answer}</p>
          )}
          {question.explanation && (
            <p className="mt-3 text-base text-slate-900 dark:text-slate-50">
              <span className="font-semibold">Why: </span>
              {question.explanation}
            </p>
          )}
          {question.explanation && <SpanishWhy text={question.explanation} />}
          <button
            type="button"
            onClick={() => {
              if (index + 1 >= questions.length) {
                const started = badgeStart.current;
                if (started) publishBadgeProgress(started, addVocabAnswers(started, questions.length));
                setDone(true);
              } else setIndex((current) => current + 1);
            }}
            className="mt-4 w-full rounded-lg bg-blue-700 py-3 text-lg font-bold text-white hover:bg-blue-800"
          >
            {index + 1 >= questions.length ? 'See result' : 'Next'}
          </button>
        </div>
      )}
    </div>
  );
}

export function VocabularyPage({
  userId,
  fixture,
  onBack,
  onSignIn,
  practice = null,
  onFinished,
  onGoLessons,
  voice = 'british',
}: {
  userId: string | null;
  /** Sample rows for a local preview. Skips the database. */
  fixture?: SavedWord[];
  onBack?: () => void;
  onSignIn?: () => void;
  /** Opened from a task pack. Skips the word list and starts this activity. */
  practice?: 'flashcards' | 'quiz' | null;
  onFinished?: () => void;
  onGoLessons?: () => void;
  /** Profile accent. British uses en-GB speech when the dictionary has no recording. */
  voice?: PronunciationAccent;
}) {
  useEffect(() => () => stopPronunciation(), []);
  const live = useSyncExternalStore(subscribeVocabulary, getVocabularyState, getVocabularyState);
  const [localRows, setLocalRows] = useState<SavedWord[]>(fixture ?? []);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [mode, setMode] = useState<Mode>(practice === 'flashcards' ? 'cards' : practice === 'quiz' ? 'quiz' : 'list');
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
  const quizReady = rows.filter((row) => row.meaning.trim()).length >= 4;
  const withMeaning = rows.filter((row) => row.meaning.trim()).length;
  const practiceBlocked = practice === 'flashcards'
    ? rows.length === 0
    : practice === 'quiz'
      ? withMeaning < 4
      : false;

  const remove = (term: string) => {
    if (fixture) {
      setLocalRows((current) => current.filter((row) => row.term.toLowerCase() !== term.toLowerCase()));
      return;
    }
    void removeVocabularyWord(term);
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      {onBack && (mode === 'list' || practice) && <BackButton onClick={onBack} label={practice ? 'Back to Task packs' : 'Back'} />}
      {!practice && mode !== 'list' && (
        <BackButton onClick={() => setMode('list')} label="Back to Vocabulary builder" />
      )}
      <h1 className="text-2xl font-bold">Vocabulary builder</h1>
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
      {missing && <p className="mt-3 text-base">Vocabulary builder will be ready after the database update.</p>}
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
          <SearchLookup
            query={query}
            rows={rows}
            ready={ready && !missing}
            accent={voice}
            onSave={async (entry) => {
              const meaning = meaningToSave(entry.senses);
              const example = entry.example || '';
              const term = entry.word || searchLookupTerm(query) || query.trim();
              if (fixture) {
                setLocalRows((current) => [{
                  id: term,
                  term,
                  meaning,
                  example,
                  sourceType: 'lookup',
                  lessonTitle: '',
                  topic: '',
                  level: '',
                  createdAt: new Date().toISOString(),
                  correctCount: 0,
                  wrongCount: 0,
                }, ...current.filter((row) => termKey(row.term) !== termKey(term))]);
                return;
              }
              await saveVocabularyWord({
                term,
                meaning,
                example,
                sourceType: 'lookup',
                lessonTitle: '',
                topic: '',
                level: '',
              });
            }}
          />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Filter by source">
            {([
              ['all', 'All'],
              ['reading', 'Reading'],
              ['listening', 'Listening'],
              ['lookup', 'From popup'],
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
            <button type="button" onClick={() => setMode('cards')} className="quiz-advance rounded-lg bg-blue-700 py-3 text-base font-bold text-white hover:bg-blue-800">
              Flashcards
            </button>
            <button
              type="button"
              onClick={() => { if (quizReady) setMode('quiz'); }}
              disabled={!quizReady}
              aria-describedby={quizReady ? undefined : 'vocab-quiz-hint'}
              className={quizReady
                ? 'quiz-advance rounded-lg border-2 border-slate-900 py-3 text-base font-bold dark:border-slate-100'
                : 'rounded-lg border-2 border-slate-400 py-3 text-base font-bold text-slate-500'}
            >
              Quiz
            </button>
          </div>
          {!quizReady && <p id="vocab-quiz-hint" className="mt-2 text-sm">A quiz needs at least 4 saved words with a meaning.</p>}
          {!ready && <p className="mt-4 text-base">Loading...</p>}
          {ready && visible.length === 0 && !missing && rows.length === 0 && (
            <p className="mt-4 text-base">You have no saved words yet. Tick a key word in a lesson, or press Save word in the word popup.</p>
          )}
          {ready && visible.length === 0 && !missing && rows.length > 0 && (
            <div className="mt-4">
              <p className="text-base">No words match this search or filter.</p>
              <button
                type="button"
                onClick={() => { setQuery(''); setSource('all'); }}
                className="mt-3 rounded-lg border-2 border-slate-900 px-4 py-2 text-base font-bold dark:border-slate-100"
              >
                Clear search and filters
              </button>
            </div>
          )}
          <ul className="mt-4 space-y-3">
            {visible.map((row) => (
              <li key={row.id || row.term} className="rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <h2 className="text-xl font-bold capitalize">{row.term}</h2>
                    <PronounceButton term={row.term} accent={voice} />
                  </div>
                  <button type="button" onClick={() => remove(row.term)} className="shrink-0 rounded-lg border-2 border-slate-900 px-3 py-1 text-sm font-bold dark:border-slate-100">
                    Delete
                  </button>
                </div>
                <SavedMeaning text={row.meaning} />
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
      {practice && practiceBlocked && (
        <div className="mt-4">
          <p className="text-base">
            {practice === 'quiz'
              ? 'A quiz needs at least 4 saved words with a meaning. Save more words in a reading or listening lesson. The rest of the pack is not waiting on this.'
              : 'Save a word in a reading or listening lesson to start flashcards. The rest of the pack is not waiting on this.'}
          </p>
          {onGoLessons && (
            <button type="button" onClick={onGoLessons} className="mt-4 w-full rounded-lg bg-blue-700 py-3 text-lg font-bold text-white hover:bg-blue-800">
              Go to lessons
            </button>
          )}
        </div>
      )}
      {mode === 'cards' && !practiceBlocked && (
        <Flashcards rows={rows} onExit={practice ? (onBack ?? (() => setMode('list'))) : () => setMode('list')} exitLabel={practice ? 'Back to Task packs' : 'Back to Vocabulary builder'} persistGrades={!fixture && Boolean(userId)} onFinished={onFinished} accent={voice} />
      )}
      {mode === 'quiz' && !practiceBlocked && (
        <Quiz rows={rows} onExit={practice ? (onBack ?? (() => setMode('list'))) : () => setMode('list')} exitLabel={practice ? 'Back to Task packs' : 'Back to Vocabulary builder'} persistGrades={!fixture && Boolean(userId)} onFinished={onFinished} />
      )}
    </div>
  );
}
