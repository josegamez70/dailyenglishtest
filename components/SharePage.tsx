import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '../auth';
import { recordScoredLesson } from '../legendsRecord';
import { decodeShare, type ShareCard } from '../shareChallenge';
import { loadSharedExercise } from '../shareStore';
import { saveLesson, saveTestResult } from '../studyStore';

type Step = {
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
  order: boolean;
};

function moved(chunks: string[]): string[] {
  if (chunks.length < 2) return chunks;
  return [...chunks.slice(1), chunks[0]];
}

function stepsFrom(card: ShareCard): Step[] {
  const lesson = card.lesson;
  if (card.mode === 'vocabulary' && Array.isArray(lesson.questions)) {
    return (lesson.questions as Record<string, unknown>[]).map((item) => ({
      prompt: String(item.prompt ?? ''),
      options: item.choices as string[],
      answer: String(item.answer ?? ''),
      explanation: String(item.explanation ?? ''),
      order: false,
    }));
  }
  if (card.mode === 'grammar' && Array.isArray(lesson.items)) {
    return (lesson.items as Record<string, unknown>[]).map((item) => {
      if (item.kind === 'order' && Array.isArray(item.chunks)) {
        const chunks = item.chunks as string[];
        return {
          prompt: String(item.prompt ?? ''),
          options: moved(chunks),
          answer: chunks.join(' '),
          explanation: String(item.explanation ?? ''),
          order: true,
        };
      }
      return {
        prompt: String(item.prompt ?? ''),
        options: item.options as string[],
        answer: String(item.correctAnswer ?? ''),
        explanation: String(item.explanation ?? ''),
        order: false,
      };
    });
  }
  if (Array.isArray(lesson.quiz)) {
    return (lesson.quiz as Record<string, unknown>[]).map((item) => ({
      prompt: String(item.question ?? ''),
      options: item.options as string[],
      answer: String(item.correctAnswer ?? ''),
      explanation: String(item.explanation ?? ''),
      order: false,
    }));
  }
  return [];
}

function passage(card: ShareCard): string {
  const lesson = card.lesson;
  if (card.mode === 'grammar' || card.mode === 'vocabulary') return '';
  if (lesson.format === 'dialogue' && Array.isArray(lesson.dialogue) && lesson.dialogue.length > 0) {
    return (lesson.dialogue as { speaker: string; line: string }[]).map((turn) => `${turn.speaker}: ${turn.line}`).join('\n');
  }
  return String(lesson.story ?? '');
}

export function SharePage({ id = '' }: { id?: string }) {
  const [card, setCard] = useState<ShareCard | null>(() => (id ? null : decodeShare(window.location.hash.replace(/^#/, ''))));
  const [loading, setLoading] = useState(Boolean(id));
  const [signedIn, setSignedIn] = useState(false);
  const [progressNote, setProgressNote] = useState<string | null>(null);
  const [lessonNote, setLessonNote] = useState<string | null>(null);
  const recorded = useRef(false);
  const steps = useMemo(() => (card ? stepsFrom(card) : []), [card]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [draft, setDraft] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioNote, setAudioNote] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return undefined;
    let ignore = false;
    void loadSharedExercise(id).then((next) => {
      if (ignore) return;
      setCard(next);
      setLoading(false);
    });
    return () => { ignore = true; };
  }, [id]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return undefined;
    let ignore = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!ignore) setSignedIn(Boolean(data.session?.user));
    });
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!card || card.mode !== 'listening') return undefined;
    const savedLessonId = typeof card.lesson.savedLessonId === 'string' ? card.lesson.savedLessonId : '';
    const bankId = typeof card.lesson.bankId === 'string' ? card.lesson.bankId : '';
    const body = savedLessonId ? { savedLessonId } : bankId ? { bankId } : null;
    if (!body) {
      setAudioNote('This listening exercise has no audio yet.');
      return undefined;
    }
    let ignore = false;
    void fetch('/api/share-listening-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({})) as { audioUrl?: string };
      if (ignore) return;
      if (typeof data.audioUrl === 'string' && data.audioUrl.startsWith('http')) setAudioUrl(data.audioUrl);
      else setAudioNote('The audio could not be opened. Try the link again.');
    }).catch(() => {
      if (!ignore) setAudioNote('The audio could not be opened. Try the link again.');
    });
    return () => { ignore = true; };
  }, [card]);

  useEffect(() => {
    if (!finished || !card || !signedIn || recorded.current) return;
    const scoredMode = card.mode === 'reading' || card.mode === 'listening' || card.mode === 'grammar' || card.mode === 'vocabulary'
      ? card.mode
      : null;
    if (!scoredMode || steps.length === 0) return;
    recorded.current = true;
    const score = steps.filter((step, place) => answers[place] === step.answer).length;
    const total = steps.length;
    const wrongAnswers = steps.flatMap((step, place) => (
      answers[place] === step.answer ? [] : [{ question: step.prompt, userAnswer: answers[place] || '', correctAnswer: step.answer }]
    ));
    const parts = steps.map((step) => `${step.prompt}\n${step.answer}`);
    const level = String(card.lesson.level ?? '');
    const topic = String(card.lesson.topic ?? card.title);
    const stored = scoredMode === 'vocabulary'
      ? Promise.resolve({ ok: true as const })
      : saveTestResult({ level, topic, title: card.title, score, total, mode: scoredMode, wrongAnswers });
    void stored.then((saved) => {
      if (!saved.ok) {
        recorded.current = false;
        setProgressNote('Could not save this score.');
        return;
      }
      void recordScoredLesson(scoredMode, parts, score, total);
      setProgressNote('Saved to your progress.');
    });
  }, [finished, signedIn, card, steps, answers]);

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-8">
        <p className="text-base">Loading...</p>
      </main>
    );
  }

  if (!card || steps.length === 0) {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-8">
        <h1 className="text-2xl font-bold">This link is not valid</h1>
        <p className="mt-3 text-base">Ask the sender to share the exercise again.</p>
      </main>
    );
  }

  const text = passage(card);
  const step = steps[index];
  const locked = answers.length === index + 1;
  const challenge = card.percent == null
    ? (card.handle ? `Can you try this exercise? — ${card.handle}` : 'Can you try this exercise?')
    : (card.handle
      ? `I scored ${card.percent}% — can you beat it? — ${card.handle}`
      : `I scored ${card.percent}% — can you beat it?`);
  const score = steps.filter((item, place) => answers[place] === item.answer).length;
  const yours = steps.length ? Math.round((score / steps.length) * 100) : 0;
  const showPassage = card.mode === 'reading' || card.mode === 'listening';

  const choose = (option: string) => {
    if (locked) return;
    if (!step.order) {
      setAnswers((current) => [...current, option]);
      return;
    }
    setDraft((current) => current.includes(option) ? current : [...current, option]);
  };

  const commitOrder = () => {
    if (draft.length !== step.options.length) return;
    setAnswers((current) => [...current, draft.join(' ')]);
  };

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-6">
      <p className="text-sm font-bold text-blue-800">Daily English Test</p>
      <h1 className="mt-2 text-2xl font-bold">{card.title}</h1>
      <p className="mt-3 text-lg font-semibold">{challenge}</p>
      {!signedIn && <p className="mt-2 text-base">You can do this exercise without an account. Your score stays on this device.</p>}
      {card.mode === 'listening' && audioUrl && (
        <audio className="mt-4 w-full" controls autoPlay src={audioUrl} />
      )}
      {card.mode === 'listening' && audioNote && <p className="mt-2 text-base">{audioNote}</p>}
      {showPassage && !started && (
        <>
          {text && <p className="mt-4 whitespace-pre-wrap text-lg leading-relaxed">{text}</p>}
          <button type="button" onClick={() => setStarted(true)} className="mt-4 w-full rounded-lg bg-blue-700 py-3 text-lg font-bold text-white">
            Start questions
          </button>
        </>
      )}
      {(started || !showPassage) && !finished && step && (
        <section className="mt-4">
          <p className="text-base font-semibold">Question {index + 1} of {steps.length}</p>
          <h2 className="mt-2 text-xl font-bold">{step.prompt}</h2>
          {step.order && <p className="mt-2 text-base">Tap the parts in the right order.</p>}
          {step.order && draft.length > 0 && <p className="mt-2 text-lg">{draft.join(' ')}</p>}
          <div className="mt-3 flex flex-col gap-2">
            {step.options.map((option) => (
              <button
                key={option}
                type="button"
                disabled={locked || draft.includes(option)}
                onClick={() => choose(option)}
                className="rounded-lg border-2 border-slate-900 bg-white px-4 py-3 text-left text-lg font-semibold disabled:opacity-50"
              >
                {option}
              </button>
            ))}
          </div>
          {step.order && !locked && (
            <button type="button" onClick={commitOrder} disabled={draft.length !== step.options.length} className="mt-3 w-full rounded-lg bg-blue-700 py-3 text-lg font-bold text-white disabled:opacity-50">
              Check order
            </button>
          )}
          {locked && (
            <div className="mt-4 rounded-lg border-2 border-slate-400 p-4" role="status">
              <p className="font-bold">{answers[index] === step.answer ? 'Correct.' : `Incorrect. The answer is ${step.answer}.`}</p>
              {step.explanation && <p className="mt-2">{step.explanation}</p>}
              <button
                type="button"
                onClick={() => {
                  if (index + 1 >= steps.length) {
                    setFinished(true);
                    return;
                  }
                  setDraft([]);
                  setIndex((current) => current + 1);
                }}
                className="mt-3 w-full rounded-lg bg-green-700 py-3 text-lg font-bold text-white"
              >
                {index + 1 === steps.length ? 'See your score' : 'Next'}
              </button>
            </div>
          )}
        </section>
      )}
      {finished && (
        <section className="mt-4">
          <h2 className="text-2xl font-bold">You scored {yours}%</h2>
          {card.percent != null && <p className="mt-2 text-lg">{card.handle || 'The sender'} scored {card.percent}%.</p>}
          {signedIn ? (
            <>
              <p className="mt-2 text-base">{progressNote ?? 'Saving your score...'}</p>
              {card.mode !== 'vocabulary' && (
                <button
                  type="button"
                  onClick={() => {
                    void saveLesson(card.lesson, card.title).then((saved) => {
                      setLessonNote(saved.ok ? 'Saved to Saved lessons.' : 'Could not save this lesson.');
                    });
                  }}
                  className="mt-3 w-full rounded-lg border-2 border-slate-900 py-3 text-lg font-bold"
                >
                  Save lesson
                </button>
              )}
              {lessonNote && <p className="mt-2 text-base">{lessonNote}</p>}
            </>
          ) : (
            <p className="mt-2 text-base">This score is not saved, and it is not added to a scoreboard.</p>
          )}
        </section>
      )}
    </main>
  );
}
