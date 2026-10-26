import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { QuizQuestion, ConfigOptions, PracticeType, AppView, VocabularyItem } from './types';
import { LEVELS, QUESTION_COUNTS, resolveTopic, TOPICS, WORD_COUNTS } from './constants';
import { countWords, estimateGenerationSeconds, isWordCountWithinTolerance, scoreFeedback } from './lessonUtils';
import { generateStoryAndQuiz } from './services/geminiService';
import Configurator from './components/Configurator';
import Loader from './components/Loader';
import BookOpenIcon from './components/icons/BookOpenIcon';
import HeadphonesIcon from './components/icons/HeadphonesIcon';
import CheckCircleIcon from './components/icons/CheckCircleIcon';
import XCircleIcon from './components/icons/XCircleIcon';
import HomeIcon from './components/icons/HomeIcon';
import UKFlagIcon from './components/icons/UKFlagIcon';
import VocabularyModal from './components/VocabularyModal';

const FONT_STEPS = [
  { label: 'Small', className: 'text-base' },
  { label: 'Medium', className: 'text-lg' },
  { label: 'Large', className: 'text-xl' },
  { label: 'Extra large', className: 'text-2xl' },
] as const;

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function speechTiming(rate: number) {
  return {
    msPerWord: rate <= 0.6 ? 415 : rate < 1.1 ? 300 : 150,
    sentencePause: rate <= 0.6 ? 800 : 400,
    commaPause: rate <= 0.6 ? 200 : 100,
  };
}

function estimateSpeechMs(text: string, rate: number): number {
  const words = text.split(/\s+/).filter(Boolean);
  const timing = speechTiming(rate);
  let total = 0;
  for (const word of words) {
    total += timing.msPerWord;
    const last = word.slice(-1);
    if (/[.!?]$/.test(last)) total += timing.sentencePause;
    else if (/[,:;]$/.test(last)) total += timing.commaPause;
  }
  return Math.max(total, 1000);
}

function readFontStep(): number {
  try {
    const raw = localStorage.getItem('storyFontStep');
    if (raw == null) return 1;
    const saved = Number(raw);
    if (Number.isInteger(saved) && saved >= 0 && saved < FONT_STEPS.length) return saved;
  } catch {
    /* ignore blocked storage */
  }
  return 1;
}

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('config');
  const [practiceType, setPracticeType] = useState<PracticeType>('reading');
  const [config, setConfig] = useState<ConfigOptions>({
    level: LEVELS[0].value,
    topic: TOPICS[0].value,
    wordCount: WORD_COUNTS[0].value,
    questionCount: QUESTION_COUNTS[0].value,
  });
  const [story, setStory] = useState<string>('');
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([]);
  const [storyTopic, setStoryTopic] = useState<{ label: string; surprise: boolean } | null>(null);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [loadingEstimate, setLoadingEstimate] = useState(20);
  const [loadingNote, setLoadingNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVocabularyModalOpen, setIsVocabularyModalOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [fontStep, setFontStep] = useState(readFontStep);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number | null>(null);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const stoppedByUserRef = useRef(false);
  const highlightTimerRef = useRef<number | null>(null);
  const firstBoundaryHeardRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const progressTimerRef = useRef<number | null>(null);
  const playbackStartRef = useRef(0);
  const durationMsRef = useRef(0);
  const boundaryFallbackTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const playIdRef = useRef(0);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch {
      /* ignore blocked storage */
    }
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem('storyFontStep', String(fontStep));
    } catch {
      /* ignore blocked storage */
    }
  }, [fontStep]);

  useEffect(() => {
    if (!isLoading || loadingStartedAt == null) return;
    const id = window.setInterval(() => {
      setLoadingElapsed(Math.floor((Date.now() - loadingStartedAt) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [isLoading, loadingStartedAt]);

  useEffect(() => {
    return () => {
      stoppedByUserRef.current = true;
      playIdRef.current += 1;
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      if (highlightTimerRef.current) clearInterval(highlightTimerRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (boundaryFallbackTimerRef.current) clearTimeout(boundaryFallbackTimerRef.current);
    };
  }, []);

  const getLetter = (idx: number) => String.fromCharCode(65 + idx);

  const handleCancelGenerate = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setLoadingStartedAt(null);
    setLoadingNote(null);
    setError(null);
    setView('config');
  };

  const handleGenerate = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    const chosen = resolveTopic(config.topic);
    const levelLabel = LEVELS.find((level) => level.value === config.level)?.label ?? config.level;
    const requestConfig: ConfigOptions = {
      level: levelLabel,
      topic: chosen.label,
      wordCount: config.wordCount,
      questionCount: config.questionCount,
      practiceType,
    };

    setIsLoading(true);
    setError(null);
    setLoadingNote(null);
    setLoadingStartedAt(Date.now());
    setLoadingElapsed(0);
    setLoadingEstimate(estimateGenerationSeconds(config.wordCount, config.questionCount));

    try {
      let result = await generateStoryAndQuiz(requestConfig, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!isWordCountWithinTolerance(result.story, config.wordCount)) {
        setLoadingNote('The first story was the wrong length. Writing another one...');
        setLoadingStartedAt(Date.now());
        setLoadingElapsed(0);
        try {
          const second = await generateStoryAndQuiz(requestConfig, { signal: controller.signal });
          if (!controller.signal.aborted) {
            const firstDistance = Math.abs(countWords(result.story) - config.wordCount);
            const secondDistance = Math.abs(countWords(second.story) - config.wordCount);
            if (secondDistance <= firstDistance) result = second;
          }
        } catch (retryError) {
          if (controller.signal.aborted || (retryError instanceof Error && retryError.name === 'AbortError')) {
            throw retryError;
          }
        }
      }
      if (controller.signal.aborted) return;
      if (!result.quiz.length) throw new Error('The quiz was empty. Please try again.');

      setStory(result.story);
      setQuiz(result.quiz);
      setVocabulary(result.vocabulary);
      setStoryTopic({
        label: result.resolvedTopic || chosen.label,
        surprise: chosen.surprise,
      });
      setUserAnswers(new Array(result.quiz.length).fill(''));
      setCurrentQuestionIndex(0);
      setShowTranscript(false);
      setView('story');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        setView('config');
        return;
      }
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setView('config');
    } finally {
      setIsLoading(false);
      setLoadingStartedAt(null);
      setLoadingNote(null);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleAnswerSelect = (answer: string) => {
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = answer;
    setUserAnswers(newAnswers);
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < quiz.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      setView('results');
    }
  };

  const stopSpeaking = useCallback(() => {
    stoppedByUserRef.current = true;
    playIdRef.current += 1;
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    if (highlightTimerRef.current) {
      clearInterval(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (boundaryFallbackTimerRef.current) {
      clearTimeout(boundaryFallbackTimerRef.current);
      boundaryFallbackTimerRef.current = null;
    }
    setIsSpeaking(false);
    setCurrentWordIndex(null);
    setElapsedMs(0);
    setDurationMs(0);
    durationMsRef.current = 0;
    setPlaybackRate(null);
    setError(null);
    utteranceRef.current = null;
    setTimeout(() => { stoppedByUserRef.current = false; }, 120);
  }, []);

  const startQuiz = () => {
    setCurrentQuestionIndex(0);
    setView('quiz');
    if (isSpeaking) stopSpeaking();
  };

  const resetApp = () => {
    setView('config');
    setStory('');
    setQuiz([]);
    setVocabulary([]);
    setStoryTopic(null);
    setUserAnswers([]);
    setCurrentQuestionIndex(0);
    setError(null);
    setIsVocabularyModalOpen(false);
    setShowTranscript(false);
    setCurrentWordIndex(null);
    stopSpeaking();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const playSpeak = useCallback((rate: number = 1) => {
    if (!story) return;
    const playId = ++playIdRef.current;
    setError(null);
    stoppedByUserRef.current = false;

    window.speechSynthesis.cancel();
    if (highlightTimerRef.current) {
      clearInterval(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    if (boundaryFallbackTimerRef.current) {
      clearTimeout(boundaryFallbackTimerRef.current);
      boundaryFallbackTimerRef.current = null;
    }
    setIsSpeaking(false);
    setCurrentWordIndex(null);
    firstBoundaryHeardRef.current = false;

    const words = story.split(/\s+/).filter(Boolean);
    const isAndroid = /android/i.test(navigator.userAgent);
    const timing = speechTiming(rate);
    const duration = estimateSpeechMs(story, rate);
    durationMsRef.current = duration;
    playbackStartRef.current = Date.now();
    setDurationMs(duration);
    setElapsedMs(0);
    setPlaybackRate(rate);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - playbackStartRef.current;
      setElapsedMs(Math.min(durationMsRef.current, Math.max(0, elapsed)));
    }, 200);

    const noteFraction = (fraction: number) => {
      const elapsed = Math.max(0, Math.min(1, fraction)) * durationMsRef.current;
      playbackStartRef.current = Date.now() - elapsed;
      setElapsedMs(Math.min(durationMsRef.current, elapsed));
    };

    const clearHighlight = () => {
      if (highlightTimerRef.current) {
        clearInterval(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };

    const startFallback = () => {
      let i = 0;
      setCurrentWordIndex(0);
      let remainingPauseMs = 0;
      highlightTimerRef.current = window.setInterval(() => {
        if (!isSpeakingRef.current) {
          clearHighlight();
          return;
        }
        if (remainingPauseMs > 0) {
          remainingPauseMs -= timing.msPerWord;
          if (remainingPauseMs <= 0) {
            remainingPauseMs = 0;
            i += 1;
          } else {
            return;
          }
        } else {
          i += 1;
        }
        if (i >= words.length) {
          clearHighlight();
          setIsSpeaking(false);
          setCurrentWordIndex(null);
          setElapsedMs(durationMsRef.current);
          return;
        }
        setCurrentWordIndex(i);
        noteFraction(words.length ? i / words.length : 0);
        const previousWord = words[i - 1];
        if (previousWord) {
          const lastChar = previousWord.slice(-1);
          if (/[.!?]$/.test(lastChar)) remainingPauseMs = timing.sentencePause;
          else if (/[,:;]$/.test(lastChar)) remainingPauseMs = timing.commaPause;
        }
      }, timing.msPerWord);
    };

    const finish = () => {
      if (boundaryFallbackTimerRef.current) {
        clearTimeout(boundaryFallbackTimerRef.current);
        boundaryFallbackTimerRef.current = null;
      }
      clearHighlight();
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setIsSpeaking(false);
      setCurrentWordIndex(null);
      setElapsedMs(durationMsRef.current);
    };

    const handleError = (event: SpeechSynthesisErrorEvent) => {
      if (boundaryFallbackTimerRef.current) {
        clearTimeout(boundaryFallbackTimerRef.current);
        boundaryFallbackTimerRef.current = null;
      }
      clearHighlight();
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      const err = event.error || '';
      if (stoppedByUserRef.current || err === 'interrupted' || err === 'canceled') {
        setIsSpeaking(false);
        setCurrentWordIndex(null);
        return;
      }
      setError('Could not play audio. Your browser may not support this feature.');
      setIsSpeaking(false);
      setCurrentWordIndex(null);
    };

    if (isAndroid) {
      setTimeout(() => {
        if (playId !== playIdRef.current) return;
        const utterance = new SpeechSynthesisUtterance(story);
        utterance.lang = 'en-US';
        utterance.rate = rate;
        utterance.onend = finish;
        utterance.onerror = handleError;
        utteranceRef.current = utterance;
        try {
          window.speechSynthesis.speak(utterance);
          setIsSpeaking(true);
          startFallback();
        } catch {
          setError('Audio could not be generated. Please try again.');
          setIsSpeaking(false);
        }
      }, 60);
      return;
    }

    boundaryFallbackTimerRef.current = window.setTimeout(() => {
      if (!firstBoundaryHeardRef.current) startFallback();
    }, 900);

    setTimeout(() => {
      if (playId !== playIdRef.current) return;
      const utterance = new SpeechSynthesisUtterance(story);
      utterance.lang = 'en-US';
      utterance.rate = rate;
      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (!firstBoundaryHeardRef.current) {
          firstBoundaryHeardRef.current = true;
          if (boundaryFallbackTimerRef.current) {
            clearTimeout(boundaryFallbackTimerRef.current);
            boundaryFallbackTimerRef.current = null;
          }
          clearHighlight();
        }
        const charIndex = event.charIndex ?? 0;
        noteFraction(charIndex / Math.max(story.length, 1));
        let count = 0;
        for (let i = 0; i < words.length; i++) {
          count += words[i].length + 1;
          if (count > charIndex) {
            setCurrentWordIndex(i);
            break;
          }
        }
      };
      utterance.onend = finish;
      utterance.onerror = handleError;
      utteranceRef.current = utterance;
      try {
        window.speechSynthesis.speak(utterance);
        setIsSpeaking(true);
      } catch {
        if (boundaryFallbackTimerRef.current) {
          clearTimeout(boundaryFallbackTimerRef.current);
          boundaryFallbackTimerRef.current = null;
        }
        setError('Audio could not be generated. Please try again.');
        setIsSpeaking(false);
      }
    }, 60);
  }, [story]);

  const HomeButton = ({ widthClass = 'max-w-3xl' }: { widthClass?: string }) => (
    <div className={`w-full ${widthClass} mx-auto flex justify-end mb-3`}>
      <button
        type="button"
        onClick={resetApp}
        className="inline-flex items-center gap-2 bg-red-700 hover:bg-red-800 text-white font-semibold text-base py-2.5 px-4 rounded-lg shadow-md"
        aria-label="Go to home screen"
      >
        <HomeIcon className="w-5 h-5" />
        <span>Home</span>
      </button>
    </div>
  );

  const modeButtonClass = (active: boolean) =>
    `flex flex-col items-center justify-center p-5 rounded-lg border-2 transition-all duration-200 ${
      active
        ? 'bg-blue-700 text-white border-blue-800 ring-4 ring-blue-300 shadow-md'
        : 'bg-white text-slate-900 border-slate-500 hover:border-blue-700 dark:bg-slate-800 dark:text-slate-50 dark:border-slate-300'
    }`;

  const ConfigScreen = () => (
    <div className="w-full max-w-2xl mx-auto">
      <div className="mb-4 text-center">
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-50" role="status">
          Selected mode: {practiceType === 'reading' ? 'Reading' : 'Listening'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6" role="group" aria-label="Practice mode">
        <button
          type="button"
          onClick={() => setPracticeType('reading')}
          aria-pressed={practiceType === 'reading'}
          className={modeButtonClass(practiceType === 'reading')}
        >
          <BookOpenIcon className={`w-8 h-8 mb-2 ${practiceType === 'reading' ? 'text-white' : 'text-blue-700 dark:text-blue-300'}`} />
          <span className="font-semibold text-lg">Reading</span>
          {practiceType === 'reading' && <span className="mt-1 text-base text-blue-50">Selected</span>}
        </button>
        <button
          type="button"
          onClick={() => setPracticeType('listening')}
          aria-pressed={practiceType === 'listening'}
          className={modeButtonClass(practiceType === 'listening')}
        >
          <HeadphonesIcon className={`w-8 h-8 mb-2 ${practiceType === 'listening' ? 'text-white' : 'text-blue-700 dark:text-blue-300'}`} />
          <span className="font-semibold text-lg">Listening</span>
          {practiceType === 'listening' && <span className="mt-1 text-base text-blue-50">Selected</span>}
        </button>
      </div>
      <Configurator config={config} setConfig={setConfig} onGenerate={handleGenerate} isLoading={isLoading} />
    </div>
  );

  const fontClass = FONT_STEPS[fontStep].className;

  const StoryScreen = () => (
    <>
      <HomeButton />
      <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-lg w-full max-w-3xl mx-auto">
        <h2 className="text-lg sm:text-3xl font-bold text-center text-slate-900 dark:text-slate-50 whitespace-nowrap">
          {practiceType === 'reading' ? 'Read the Story' : 'Listen to the Story'}
        </h2>
        {storyTopic && (
          <p className="mt-3 text-center text-base font-semibold text-slate-900 dark:text-slate-50">
            {storyTopic.surprise ? `Topic picked for you: ${storyTopic.label}` : `Topic: ${storyTopic.label}`}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <span className="text-base font-semibold text-slate-900 dark:text-slate-50">Text size</span>
          <button
            type="button"
            onClick={() => setFontStep((step) => Math.max(0, step - 1))}
            disabled={fontStep === 0}
            aria-label="Smaller text"
            className="bg-slate-800 text-white font-semibold text-base px-4 py-2 rounded-lg disabled:bg-slate-300 disabled:text-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:disabled:bg-slate-600 dark:disabled:text-slate-300"
          >
            Smaller
          </button>
          <span className="text-base font-medium text-slate-900 dark:text-slate-50 min-w-[6.5rem] text-center">
            {FONT_STEPS[fontStep].label}
          </span>
          <button
            type="button"
            onClick={() => setFontStep((step) => Math.min(FONT_STEPS.length - 1, step + 1))}
            disabled={fontStep === FONT_STEPS.length - 1}
            aria-label="Larger text"
            className="bg-slate-800 text-white font-semibold text-base px-4 py-2 rounded-lg disabled:bg-slate-300 disabled:text-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:disabled:bg-slate-600 dark:disabled:text-slate-300"
          >
            Larger
          </button>
        </div>

        {practiceType === 'listening' && (
          <div className="mt-6">
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center">
              <button
                type="button"
                onClick={() => playSpeak(1)}
                className="bg-green-700 hover:bg-green-800 text-white font-bold py-3 px-6 rounded-lg text-lg"
              >
                Play 1x
              </button>
              <button
                type="button"
                onClick={() => playSpeak(0.5)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg text-lg"
              >
                Play 0.5x
              </button>
              <button
                type="button"
                onClick={stopSpeaking}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-6 rounded-lg text-lg"
              >
                Stop
              </button>
              <button
                type="button"
                onClick={() => setShowTranscript(!showTranscript)}
                className="bg-white hover:bg-slate-100 text-slate-900 border-2 border-slate-700 font-bold py-3 px-6 rounded-lg text-lg dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white dark:border-slate-200"
              >
                {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
              </button>
            </div>
            {durationMs > 0 && (
              <div className="mt-4 max-w-lg mx-auto w-full">
                <div className="flex justify-between gap-3 text-base font-medium text-slate-900 dark:text-slate-50 mb-1">
                  <span>{formatClock(elapsedMs)}</span>
                  <span>
                    {isSpeaking
                      ? playbackRate != null && playbackRate <= 0.6
                        ? 'Playing at half speed'
                        : 'Playing'
                      : 'Finished'}
                  </span>
                  <span>{formatClock(durationMs)}</span>
                </div>
                <div
                  className="h-3 w-full rounded-full bg-slate-300 dark:bg-slate-600 overflow-hidden"
                  role="progressbar"
                  aria-label="Audio progress"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(durationMs)}
                  aria-valuenow={Math.round(Math.min(durationMs, elapsedMs))}
                >
                  <div
                    className="h-full bg-blue-700"
                    style={{ width: `${durationMs ? Math.min(100, (elapsedMs / durationMs) * 100) : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {practiceType === 'reading' && (
          <p className={`mt-6 whitespace-pre-wrap text-slate-900 dark:text-slate-50 leading-relaxed ${fontClass}`}>
            {story}
          </p>
        )}

        {practiceType === 'listening' && showTranscript && (
          <div className={`mt-4 leading-relaxed text-slate-900 dark:text-slate-50 ${fontClass}`}>
            {story.split(/\s+/).filter(Boolean).map((word, idx) => (
              <span
                key={idx}
                style={idx === currentWordIndex ? {
                  color: '#0f172a',
                  fontWeight: 700,
                  backgroundColor: '#fde68a',
                  borderRadius: '0.25rem',
                } : undefined}
              >
                {word}{' '}
              </span>
            ))}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-300 dark:border-slate-600 flex flex-col sm:flex-row-reverse justify-center items-center gap-4">
          <button
            type="button"
            onClick={startQuiz}
            className="w-full sm:w-auto bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 px-8 rounded-lg text-lg"
          >
            Start Quiz
          </button>
          {vocabulary.length > 0 && (
            <button
              type="button"
              onClick={() => setIsVocabularyModalOpen(true)}
              className="w-full sm:w-auto bg-indigo-700 hover:bg-indigo-800 text-white font-bold py-3 px-8 rounded-lg text-lg"
            >
              View Vocabulary
            </button>
          )}
        </div>
      </div>
      <VocabularyModal
        isOpen={isVocabularyModalOpen}
        onClose={() => setIsVocabularyModalOpen(false)}
        vocabulary={vocabulary}
      />
    </>
  );

  const QuizScreen = () => {
    const question = quiz[currentQuestionIndex];
    return (
      <>
        <HomeButton widthClass="max-w-2xl" />
        <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-lg w-full max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-6 text-slate-900 dark:text-slate-50">
            {practiceType === 'reading' ? 'Reading Comprehension Quiz' : 'Listening Comprehension Quiz'}
          </h2>
          <div className="mb-4">
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Question {currentQuestionIndex + 1} of {quiz.length}
            </p>
            <div className="w-full bg-slate-300 dark:bg-slate-600 rounded-full h-2.5 mt-1">
              <div
                className="bg-blue-700 h-2.5 rounded-full transition-all"
                style={{ width: `${((currentQuestionIndex + 1) / quiz.length) * 100}%` }}
              ></div>
            </div>
          </div>
          <h3 className="text-xl md:text-2xl font-semibold mb-6 text-slate-900 dark:text-slate-50">{question.question}</h3>
          <div className="space-y-3">
            {question.options.map((option, index) => {
              const letter = getLetter(index);
              const selected = userAnswers[currentQuestionIndex] === option;
              return (
                <button
                  type="button"
                  key={index}
                  onClick={() => handleAnswerSelect(option)}
                  className={`w-full text-left p-4 rounded-lg border-2 text-base md:text-lg transition-colors ${
                    selected
                      ? 'bg-blue-100 dark:bg-blue-900 border-blue-700 text-slate-900 dark:text-slate-50'
                      : 'bg-white dark:bg-slate-700 border-slate-400 dark:border-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-50'
                  }`}
                >
                  <span className="font-semibold">{letter}.</span>
                  {' '}
                  {option}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={handleNextQuestion}
            disabled={!userAnswers[currentQuestionIndex]}
            className="mt-8 w-full bg-green-700 hover:bg-green-800 disabled:bg-slate-300 disabled:text-slate-700 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg text-lg"
          >
            {currentQuestionIndex < quiz.length - 1 ? 'Next Question' : 'Finish Quiz'}
          </button>
        </div>
      </>
    );
  };

  const ResultsScreen = () => {
    const score = quiz.reduce(
      (acc, question, index) => acc + (question.correctAnswer === userAnswers[index] ? 1 : 0),
      0
    );
    const percentage = quiz.length ? Math.round((score / quiz.length) * 100) : 0;
    const feedback = scoreFeedback(percentage);

    return (
      <>
        <HomeButton />
        <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-lg w-full max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-2 text-slate-900 dark:text-slate-50">Quiz Complete!</h2>
          <p className="text-center text-xl text-slate-800 dark:text-slate-100 mb-2">
            You scored {score} out of {quiz.length} ({percentage}%)
          </p>
          <p className="text-center text-lg font-semibold text-blue-800 dark:text-blue-200 mb-6">{feedback}</p>
          <div className="space-y-4">
            {quiz.map((question, index) => {
              const userAnswer = userAnswers[index];
              const correctText = question.correctAnswer;
              const userIdx = question.options.findIndex((option) => option === userAnswer);
              const correctIdx = question.options.findIndex((option) => option === correctText);
              const userLetter = userIdx >= 0 ? getLetter(userIdx) : null;
              const correctLetter = correctIdx >= 0 ? getLetter(correctIdx) : null;
              const isCorrect = correctText === userAnswer;

              return (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    isCorrect
                      ? 'border-green-700 bg-green-50 dark:bg-green-950 dark:border-green-600'
                      : 'border-red-700 bg-red-50 dark:bg-red-950 dark:border-red-600'
                  }`}
                >
                  <p className="font-semibold text-base text-slate-900 dark:text-slate-50 mb-2">
                    {index + 1}. {question.question}
                  </p>
                  <div className="flex items-start">
                    {isCorrect ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-700 dark:text-green-300 mr-2 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircleIcon className="w-5 h-5 text-red-700 dark:text-red-300 mr-2 mt-0.5 flex-shrink-0" />
                    )}
                    <p className="text-base text-slate-900 dark:text-slate-50">
                      Your answer: {userLetter ? `${userLetter}. ` : ''}{userAnswer || '—'}
                    </p>
                  </div>
                  {!isCorrect && (
                    <div className="flex items-start mt-1">
                      <CheckCircleIcon className="w-5 h-5 text-green-700 dark:text-green-300 mr-2 mt-0.5 flex-shrink-0" />
                      <p className="text-base text-slate-900 dark:text-slate-50">
                        Correct answer: {correctLetter ? `${correctLetter}. ` : ''}{correctText}
                      </p>
                    </div>
                  )}
                  {question.explanation && (
                    <p className="mt-3 text-base text-slate-900 dark:text-slate-50">
                      <span className="font-semibold">Why: </span>
                      {question.explanation}
                    </p>
                  )}
                  {question.supportingSentence && (
                    <p className="mt-2 text-base text-slate-900 dark:text-slate-50">
                      <span className="font-semibold">From the story: </span>
                      <span className="italic">“{question.supportingSentence}”</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <button
              type="button"
              onClick={resetApp}
              className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 px-8 rounded-lg text-xl"
            >
              Try Another
            </button>
            <button
              type="button"
              onClick={() => setView('story')}
              className="bg-slate-700 hover:bg-slate-800 text-white font-bold py-3 px-8 rounded-lg text-xl"
            >
              Review Story
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderContent = () => {
    switch (view) {
      case 'config':
        return <ConfigScreen />;
      case 'story':
        return <StoryScreen />;
      case 'quiz':
        return <QuizScreen />;
      case 'results':
        return <ResultsScreen />;
      default:
        return <ConfigScreen />;
    }
  };

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-50 flex flex-col items-center p-4 sm:p-6 lg:p-8 transition-colors duration-300">
      {isLoading && (
        <Loader
          elapsedSeconds={loadingElapsed}
          estimateSeconds={loadingEstimate}
          note={loadingNote}
          onCancel={handleCancelGenerate}
        />
      )}
      <header className="w-full max-w-4xl mx-auto mb-6">
        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={() => setIsDark((dark) => !dark)}
            aria-pressed={isDark}
            className="inline-flex items-center rounded-lg border-2 border-slate-900 bg-white px-4 py-2 text-base font-semibold text-slate-900 hover:bg-slate-100 dark:border-slate-100 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
          >
            {isDark ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
        <div className="text-center">
          <div className="flex justify-center items-center gap-4 mb-4">
            <UKFlagIcon className="w-28 h-28 rounded-lg shadow-md" />
            <h1 className="text-4xl font-fun tracking-wide">
              <span className="text-blue-800 dark:text-blue-300">Your daily </span>
              <span className="text-red-700 dark:text-red-400">English Test!</span>
            </h1>
          </div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
            English Comprehension Practice
          </h2>
          <p className="text-slate-800 dark:text-slate-100 mt-2 text-lg">
            Practice reading and listening with short stories and quizzes.
          </p>
        </div>
      </header>

      <main className="w-full">
        {error && (
          <div className="w-full max-w-2xl mx-auto bg-red-100 border border-red-700 text-red-900 px-4 py-3 rounded-lg relative mb-6 text-base" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
