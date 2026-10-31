import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { QuizQuestion, ConfigOptions, PracticeType, AppView, VocabularyItem } from './types';
import { LEVELS, QUESTION_COUNTS, resolveTopic, TOPICS, WORD_COUNTS } from './constants';
import { isAndroidUserAgent } from './device';
import { scoreFeedback } from './lessonUtils';
import {
  parseDialogue,
  resumeTurnIndex,
  speakersWithGender,
  speechLines,
  pickDialogueSpeakers,
  voicesBySpeaker,
  type ContentFormat,
  type DialogueTurn,
} from './dialogue';
import { clampedFontStep } from './fontStep';
import { withStoryReview } from './quizSession';
import { resumeWordIndex, textFromWordIndex } from './speechPosition';
import { generateStoryAndQuiz } from './services/geminiService';
import { FREE_LESSON_LIMIT, planStatusText, signOut, useAccount } from './auth';
import { AppShell, type ShellItem } from './components/AppShell';
import { ProfilePage, type ThemeChoice, type VoiceChoice } from './components/ProfilePage';
import { ProgressPage } from './components/ProgressPage';
import { SavedLessonsPage } from './components/SavedLessonsPage';
import { cefrToLessonLevel, type CefrLevel } from './progressStats';
import { ACADEMY_INVITE_DISMISSED_KEY, ACADEMY_INVITE_KEY, normalizeInviteCode } from './academyStats';
import { AcademyPage } from './components/AcademyPage';
import { JoinAcademyPage } from './components/JoinAcademyPage';
import { saveLesson, saveTestResult } from './studyStore';
import { SignInBox } from './components/SignInBox';
import { LegalDocument, SiteFooter, legalPageFromPath } from './components/LegalPages';
import { AuthLoading, Landing, focusSignIn } from './components/Landing';
import Configurator from './components/Configurator';
import { DefinedText, DictionaryPopup } from './components/DefinedText';
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
] as const;

function nextDialogueSpeakers() {
  let previous: string[] = [];
  try {
    const saved = JSON.parse(localStorage.getItem('dialogueNamePair') || '[]');
    if (Array.isArray(saved)) previous = saved.map((name) => String(name));
  } catch {
    previous = [];
  }
  const speakers = pickDialogueSpeakers(previous);
  try {
    localStorage.setItem('dialogueNamePair', JSON.stringify(speakers.map((speaker) => speaker.name)));
  } catch {
    /* ignore blocked storage */
  }
  return speakers;
}

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
    return clampedFontStep(Number(raw), FONT_STEPS.length);
  } catch {
    /* ignore blocked storage */
  }
  return 1;
}

function readVoices(): { name: string; lang: string; voiceURI?: string; default?: boolean }[] {
  try {
    return window.speechSynthesis.getVoices().map((voice) => ({
      name: voice.name,
      lang: voice.lang,
      voiceURI: voice.voiceURI,
      default: voice.default,
    }));
  } catch {
    return [];
  }
}

function whenVoicesReady(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      const list = window.speechSynthesis.getVoices();
      if (!list.length && !settled) return;
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(list);
    };
    try {
      if (window.speechSynthesis.getVoices().length) {
        resolve(window.speechSynthesis.getVoices());
        return;
      }
      window.speechSynthesis.addEventListener('voiceschanged', finish);
      window.setTimeout(finish, 700);
    } catch {
      resolve([]);
    }
  });
}

const App: React.FC = () => {
  const account = useAccount();
  const [view, setView] = useState<AppView>('config');
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInPrompt, setSignInPrompt] = useState(false);
  const [practiceType, setPracticeType] = useState<PracticeType>('reading');
  const [contentFormat, setContentFormat] = useState<ContentFormat>('text');
  const [dialogueTurns, setDialogueTurns] = useState<DialogueTurn[]>([]);
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
  const [quizLoading, setQuizLoading] = useState(false);
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(20);
  const [loadingNote, setLoadingNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVocabularyModalOpen, setIsVocabularyModalOpen] = useState(false);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => {
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch { /* ignore */ }
    return 'system';
  });
  const [path, setPath] = useState(() => window.location.pathname.replace(/\/+$/, '') || '/');
  const [fontStep, setFontStep] = useState(readFontStep);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number | null>(null);
  const [activeTurn, setActiveTurn] = useState<number | null>(null);
  const [storyReviewOpen, setStoryReviewOpen] = useState(false);

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
  const elapsedMsRef = useRef(0);
  const pausedRef = useRef(false);
  const pauseModeRef = useRef<'native' | 'restart' | null>(null);
  const rateRef = useRef(1);
  const speedRef = useRef(1);
  const voiceRef = useRef<VoiceChoice>('british');
  const levelAppliedRef = useRef(false);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  const darkOn = themeChoice === 'dark' || (themeChoice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const dark = themeChoice === 'dark' || (themeChoice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('theme', themeChoice);
    } catch {
      /* ignore blocked storage */
    }
  }, [themeChoice]);

  useEffect(() => {
    if (themeChoice !== 'system') return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.classList.toggle('dark', query.matches);
      document.documentElement.style.colorScheme = query.matches ? 'dark' : 'light';
    };
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [themeChoice]);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname.replace(/\/+$/, '') || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const invitePrompted = useRef(false);
  useEffect(() => {
    try {
      const code = normalizeInviteCode(new URLSearchParams(window.location.search).get('code') || '');
      if (code) localStorage.setItem(ACADEMY_INVITE_KEY, code);
    } catch {
      /* ignore blocked storage */
    }
  }, []);

  useEffect(() => {
    if (invitePrompted.current || !account.ready || !account.signedIn || !account.academyChecked) return;
    if (account.academyRole === 'student' || account.plan === 'academy') return;
    if (path !== '/' && path !== '/join') return;
    let code = '';
    let dismissed = '';
    try {
      code = normalizeInviteCode(localStorage.getItem(ACADEMY_INVITE_KEY) || '');
      dismissed = localStorage.getItem(ACADEMY_INVITE_DISMISSED_KEY) || '';
    } catch {
      return;
    }
    if (!code || dismissed === code) return;
    invitePrompted.current = true;
    if (path !== '/join') {
      window.history.replaceState({}, '', '/join');
      setPath('/join');
    }
  }, [account.ready, account.signedIn, account.academyChecked, account.academyRole, account.plan, path]);

  useEffect(() => {
    speedRef.current = account.speed;
    voiceRef.current = account.voice;
  }, [account.speed, account.voice]);

  useEffect(() => {
    if (account.theme === 'light' || account.theme === 'dark' || account.theme === 'system') {
      setThemeChoice(account.theme);
    }
  }, [account.theme]);

  useEffect(() => {
    if (!account.defaultLevel || levelAppliedRef.current) return;
    levelAppliedRef.current = true;
    setConfig((current) => ({ ...current, level: cefrToLessonLevel(account.defaultLevel || 'A2') }));
  }, [account.defaultLevel]);

  useEffect(() => {
    try {
      localStorage.setItem('storyFontStep', String(fontStep));
    } catch {
      /* ignore blocked storage */
    }
  }, [fontStep]);

  useEffect(() => {
    try {
      window.speechSynthesis.getVoices();
      const prime = () => window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener('voiceschanged', prime);
      return () => window.speechSynthesis.removeEventListener('voiceschanged', prime);
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    return () => {
      stoppedByUserRef.current = true;
      playIdRef.current += 1;
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        window.speechSynthesis.cancel();
      } catch { /* ignore */ }
      if (highlightTimerRef.current) clearInterval(highlightTimerRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (boundaryFallbackTimerRef.current) clearTimeout(boundaryFallbackTimerRef.current);
    };
  }, []);

  const getLetter = (idx: number) => String.fromCharCode(65 + idx);

  const handleCancelGenerate = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setQuizLoading(false);
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
    const speakers = contentFormat === 'dialogue' ? nextDialogueSpeakers() : undefined;
    const requestConfig: ConfigOptions = {
      level: levelLabel,
      topic: chosen.label,
      wordCount: config.wordCount,
      questionCount: config.questionCount,
      practiceType,
      format: contentFormat,
      speakers,
    };

    if (!account.ready) return;
    if (!account.signedIn) {
      setError(null);
      focusSignIn();
      return;
    }

    setIsLoading(true);
    setQuizLoading(false);
    setError(null);
    setSignInOpen(false);
    setSignInPrompt(false);
    setLoadingNote('Writing the story...');
    setLoadingStartedAt(Date.now());
    setLoadingEstimate(12);
    let storyShown = false;

    try {
      const result = await generateStoryAndQuiz(requestConfig, {
        signal: controller.signal,
        onStory: (draft) => {
          if (controller.signal.aborted) return;
          storyShown = true;
          setStory(draft.story);
          setDialogueTurns(contentFormat === 'dialogue' ? draft.dialogue : []);
          setVocabulary(draft.vocabulary);
          setQuiz([]);
          setUserAnswers([]);
          setStoryTopic({
            label: draft.resolvedTopic || chosen.label,
            surprise: chosen.surprise,
          });
          setCurrentQuestionIndex(0);
          setShowTranscript(false);
          setIsLoading(false);
          setLoadingStartedAt(null);
          setLoadingNote(null);
          setQuizLoading(true);
          setView('story');
          void account.refreshProfile();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      });
      if (controller.signal.aborted) return;
      if (!result.quiz.length) throw new Error('The quiz was empty. Please try again.');

      setStory(result.story);
      setDialogueTurns(contentFormat === 'dialogue' ? result.dialogue : []);
      setQuiz(result.quiz);
      setVocabulary(result.vocabulary);
      setUserAnswers(new Array(result.quiz.length).fill(''));
      setCurrentQuestionIndex(0);
      setQuizLoading(false);
      const title = result.resolvedTopic || chosen.label;
      void saveLesson({
        story: result.story,
        quiz: result.quiz,
        vocabulary: result.vocabulary,
        dialogue: result.dialogue,
        level: config.level,
        levelLabel: levelLabel,
        topic: title,
        title,
        mode: practiceType,
        format: contentFormat,
        wordCount: config.wordCount,
      }, title).catch(() => undefined);
    } catch (err) {
      setQuizLoading(false);
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        setView('config');
        return;
      }
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      if (!storyShown) setView('config');
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
      stopSpeaking();
      const score = quiz.reduce((acc, question, index) => acc + (question.correctAnswer === userAnswers[index] ? 1 : 0), 0);
      const wrongAnswers = quiz.flatMap((question, index) => {
        const userAnswer = userAnswers[index] || '';
        if (userAnswer === question.correctAnswer) return [];
        return [{ question: question.question, userAnswer, correctAnswer: question.correctAnswer }];
      });
      void saveTestResult({
        level: LEVELS.find((level) => level.value === config.level)?.label ?? config.level,
        topic: storyTopic?.label ?? config.topic,
        title: storyTopic?.label ?? config.topic,
        score,
        total: quiz.length,
        wrongAnswers,
      }).catch(() => undefined);
      const next = withStoryReview(
        { questionIndex: currentQuestionIndex, answers: userAnswers, reviewOpen: storyReviewOpen },
        false
      );
      setCurrentQuestionIndex(next.questionIndex);
      setUserAnswers(next.answers);
      setStoryReviewOpen(next.reviewOpen);
      setView('results');
    }
  };

  const stopSpeaking = useCallback(() => {
    stoppedByUserRef.current = true;
    pausedRef.current = false;
    pauseModeRef.current = null;
    playIdRef.current += 1;
    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      window.speechSynthesis.cancel();
    } catch { /* ignore */ }
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
    setIsPaused(false);
    setCurrentWordIndex(null);
    setActiveTurn(null);
    elapsedMsRef.current = 0;
    setElapsedMs(0);
    setDurationMs(0);
    durationMsRef.current = 0;
    setPlaybackRate(null);
    setError(null);
    utteranceRef.current = null;
    setTimeout(() => { stoppedByUserRef.current = false; }, 120);
  }, []);

  const runProgressClock = useCallback(() => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = window.setInterval(() => {
      if (pausedRef.current) return;
      const elapsed = Date.now() - playbackStartRef.current;
      const next = Math.min(durationMsRef.current, Math.max(0, elapsed));
      elapsedMsRef.current = next;
      setElapsedMs(next);
    }, 200);
  }, []);

  const startQuiz = () => {
    setStoryReviewOpen(false);
    setCurrentQuestionIndex(0);
    setView('quiz');
    stopSpeaking();
  };

  const resetApp = () => {
    setView('config');
    setStory('');
    setDialogueTurns([]);
    setQuiz([]);
    setVocabulary([]);
    setStoryTopic(null);
    setUserAnswers([]);
    setCurrentQuestionIndex(0);
    setStoryReviewOpen(false);
    setError(null);
    setIsVocabularyModalOpen(false);
    setShowTranscript(false);
    setCurrentWordIndex(null);
    stopSpeaking();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const playSpeak = useCallback((rate: number = 1, options?: { text?: string; keepClock?: boolean; fromTurn?: number }) => {
    const spoken = (options?.text ?? story).trim();
    if (!story || !spoken) return;
    const playId = ++playIdRef.current;
    const keepClock = Boolean(options?.keepClock);
    setError(null);
    stoppedByUserRef.current = false;
    pausedRef.current = false;
    pauseModeRef.current = null;
    setIsPaused(false);
    rateRef.current = rate;

    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      window.speechSynthesis.cancel();
    } catch { /* ignore */ }
    if (highlightTimerRef.current) {
      clearInterval(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    if (boundaryFallbackTimerRef.current) {
      clearTimeout(boundaryFallbackTimerRef.current);
      boundaryFallbackTimerRef.current = null;
    }
    if (keepClock) {
      setIsSpeaking(true);
      isSpeakingRef.current = true;
    } else {
      setIsSpeaking(false);
    }
    if (!keepClock) setCurrentWordIndex(null);
    firstBoundaryHeardRef.current = false;

    const words = story.split(/\s+/).filter(Boolean);
    const lessonTurns = dialogueTurns.length ? dialogueTurns : parseDialogue(story);
    const dialogueLines = contentFormat === 'dialogue' ? speechLines(lessonTurns) : [];
    const speakingDialogue = dialogueLines.length > 0 && options?.text == null;
    const startTurn = speakingDialogue ? Math.max(0, Math.min(dialogueLines.length - 1, options?.fromTurn ?? 0)) : 0;
    const isAndroid = isAndroidUserAgent(navigator.userAgent);
    const timing = speechTiming(rate);
    if (keepClock) {
      playbackStartRef.current = Date.now() - elapsedMsRef.current;
    } else {
      const duration = speakingDialogue
        ? dialogueLines.reduce((sum, line) => sum + estimateSpeechMs(line.text, rate), 0)
        : estimateSpeechMs(story, rate);
      durationMsRef.current = duration;
      playbackStartRef.current = Date.now();
      elapsedMsRef.current = 0;
      setDurationMs(duration);
      setElapsedMs(0);
      setActiveTurn(null);
    }
    setPlaybackRate(rate);
    runProgressClock();

    const noteFraction = (fraction: number) => {
      if (pausedRef.current) return;
      const elapsed = Math.max(0, Math.min(1, fraction)) * durationMsRef.current;
      playbackStartRef.current = Date.now() - elapsed;
      elapsedMsRef.current = Math.min(durationMsRef.current, elapsed);
      setElapsedMs(elapsedMsRef.current);
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
        if (pausedRef.current) return;
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
      if (playId !== playIdRef.current || pausedRef.current) return;
      if (boundaryFallbackTimerRef.current) {
        clearTimeout(boundaryFallbackTimerRef.current);
        boundaryFallbackTimerRef.current = null;
      }
      clearHighlight();
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      pauseModeRef.current = null;
      setIsSpeaking(false);
      setIsPaused(false);
      setCurrentWordIndex(null);
      setActiveTurn(null);
      elapsedMsRef.current = durationMsRef.current;
      setElapsedMs(durationMsRef.current);
    };

    const failToStart = () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (boundaryFallbackTimerRef.current) {
        clearTimeout(boundaryFallbackTimerRef.current);
        boundaryFallbackTimerRef.current = null;
      }
      pausedRef.current = false;
      pauseModeRef.current = null;
      durationMsRef.current = 0;
      elapsedMsRef.current = 0;
      setDurationMs(0);
      setElapsedMs(0);
      setIsPaused(false);
      setIsSpeaking(false);
      setError('Could not play audio. Your browser may not support this feature.');
    };

    const handleError = (event: SpeechSynthesisErrorEvent) => {
      if (playId !== playIdRef.current || pausedRef.current) return;
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

    if (speakingDialogue) {
      const lines = dialogueLines.slice(startTurn);
      void whenVoicesReady().then((liveVoices) => {
        if (playId !== playIdRef.current || pausedRef.current) return;
        const accentPrefix = voiceRef.current === 'american' ? 'en-us' : 'en-gb';
        const listed = liveVoices.map((voice) => ({
          name: voice.name,
          lang: voice.lang,
          voiceURI: voice.voiceURI,
          default: voice.default,
        }));
        const accentVoices = listed.filter((voice) => voice.lang.toLowerCase().replace('_', '-').startsWith(accentPrefix));
        const voices = voicesBySpeaker(speakersWithGender(lessonTurns), accentVoices.length ? accentVoices : listed);
        try {
          lines.forEach((line, index) => {
            const utterance = new SpeechSynthesisUtterance(line.text);
            const choice = voices[line.speaker.toLowerCase()] ?? Object.values(voices)[0];
            const live = liveVoices.find((voice) => choice?.voiceURI && voice.voiceURI === choice.voiceURI)
              ?? liveVoices.find((voice) => voice.name === choice?.name && voice.lang === choice?.lang);
            if (live) utterance.voice = live;
            utterance.lang = choice?.lang || (voiceRef.current === 'american' ? 'en-US' : 'en-GB');
            const pitch = choice?.pitch ?? 1;
            utterance.pitch = pitch < 0.75 ? 0.8 : pitch;
            utterance.rate = rate * (choice?.rateScale ?? 1);
            utterance.onstart = () => {
              if (playId !== playIdRef.current) return;
              setActiveTurn(line.turnIndex);
              setIsSpeaking(true);
            };
            utterance.onend = () => {
              if (index === lines.length - 1) finish();
            };
            utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
              const err = event.error || '';
              if (err === 'interrupted' || err === 'canceled') return;
              handleError(event);
            };
            window.speechSynthesis.speak(utterance);
          });
          setIsSpeaking(true);
        } catch {
          failToStart();
        }
      });
      return;
    }

    if (isAndroid) {
      setTimeout(() => {
        if (playId !== playIdRef.current || pausedRef.current) return;
        const utterance = new SpeechSynthesisUtterance(spoken);
        utterance.lang = voiceRef.current === 'american' ? 'en-US' : 'en-GB';
        utterance.rate = rate;
        utterance.onend = finish;
        utterance.onerror = handleError;
        utteranceRef.current = utterance;
        try {
          window.speechSynthesis.speak(utterance);
          setIsSpeaking(true);
        } catch {
          failToStart();
        }
      }, 60);
      return;
    }

    if (!keepClock) {
      boundaryFallbackTimerRef.current = window.setTimeout(() => {
        if (!firstBoundaryHeardRef.current && !pausedRef.current) startFallback();
      }, 900);
    }

    setTimeout(() => {
      if (playId !== playIdRef.current || pausedRef.current) return;
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.lang = voiceRef.current === 'american' ? 'en-US' : 'en-GB';
      utterance.rate = rate;
      if (!keepClock) utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (pausedRef.current) return;
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
        failToStart();
      }
    }, 60);
  }, [contentFormat, dialogueTurns, story, runProgressClock]);

  const pausePlayback = useCallback(() => {
    if (pausedRef.current || !isSpeakingRef.current) return;
    const frozen = Math.min(durationMsRef.current, Math.max(0, Date.now() - playbackStartRef.current));
    elapsedMsRef.current = frozen;
    setElapsedMs(frozen);
    pausedRef.current = true;
    setIsPaused(true);

    const android = isAndroidUserAgent(navigator.userAgent);
    let native = false;
    if (!android && window.speechSynthesis.speaking) {
      try {
        window.speechSynthesis.pause();
        native = window.speechSynthesis.paused === true && window.speechSynthesis.speaking === true;
      } catch {
        native = false;
      }
    }
    if (native) {
      pauseModeRef.current = 'native';
      return;
    }

    pauseModeRef.current = 'restart';
    playIdRef.current += 1;
    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      window.speechSynthesis.cancel();
    } catch { /* ignore */ }
    setIsSpeaking(false);
  }, []);

  const resumePlayback = useCallback(() => {
    if (!pausedRef.current) return;
    const elapsed = elapsedMsRef.current;
    const rate = rateRef.current || 1;
    if (pauseModeRef.current === 'native') {
      let resumed = false;
      try {
        window.speechSynthesis.resume();
        resumed = window.speechSynthesis.paused === false && window.speechSynthesis.speaking === true;
      } catch {
        resumed = false;
      }
      if (resumed) {
        pausedRef.current = false;
        pauseModeRef.current = null;
        setIsPaused(false);
        setIsSpeaking(true);
        playbackStartRef.current = Date.now() - elapsed;
        runProgressClock();
        return;
      }
    }
    if (contentFormat === 'dialogue') {
      const lines = speechLines(dialogueTurns.length ? dialogueTurns : parseDialogue(story));
      const durations = lines.map((line) => estimateSpeechMs(line.text, rate));
      const turn = resumeTurnIndex(durations, elapsed);
      playbackStartRef.current = Date.now() - elapsed;
      playSpeak(rate, { keepClock: true, fromTurn: turn });
      return;
    }
    const words = story.split(/\s+/).filter(Boolean);
    const index = resumeWordIndex(words, elapsed, durationMsRef.current);
    const text = textFromWordIndex(words, index);
    playbackStartRef.current = Date.now() - elapsed;
    playSpeak(rate, { text: text || story, keepClock: true });
  }, [contentFormat, dialogueTurns, playSpeak, runProgressClock, story]);

  const openStoryReview = () => {
    const next = withStoryReview(
      { questionIndex: currentQuestionIndex, answers: userAnswers, reviewOpen: storyReviewOpen },
      true
    );
    setCurrentQuestionIndex(next.questionIndex);
    setUserAnswers(next.answers);
    setStoryReviewOpen(next.reviewOpen);
  };

  const closeStoryReview = () => {
    const next = withStoryReview(
      { questionIndex: currentQuestionIndex, answers: userAnswers, reviewOpen: storyReviewOpen },
      false
    );
    setCurrentQuestionIndex(next.questionIndex);
    setUserAnswers(next.answers);
    setStoryReviewOpen(next.reviewOpen);
    stopSpeaking();
  };

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

  const formatButtonClass = (active: boolean) =>
    `flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all duration-200 ${
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
      <div className="mb-6">
        <p className="mb-3 text-center text-lg font-semibold text-slate-900 dark:text-slate-50" role="status">
          Selected format: {contentFormat === 'dialogue' ? 'Dialogue' : 'Text'}
        </p>
        <div className="grid grid-cols-2 gap-4" role="group" aria-label="Format">
          <button
            type="button"
            onClick={() => setContentFormat('text')}
            aria-pressed={contentFormat === 'text'}
            className={formatButtonClass(contentFormat === 'text')}
          >
            <span className="font-semibold text-base">Text</span>
            <span className={`mt-0.5 text-sm ${contentFormat === 'text' ? 'text-blue-50' : 'text-slate-700 dark:text-slate-200'}`}>
              A story or monologue
            </span>
          </button>
          <button
            type="button"
            onClick={() => setContentFormat('dialogue')}
            aria-pressed={contentFormat === 'dialogue'}
            className={formatButtonClass(contentFormat === 'dialogue')}
          >
            <span className="font-semibold text-base">Dialogue</span>
            <span className={`mt-0.5 text-sm ${contentFormat === 'dialogue' ? 'text-blue-50' : 'text-slate-700 dark:text-slate-200'}`}>
              Two speakers
            </span>
          </button>
        </div>
      </div>
      <Configurator config={config} setConfig={setConfig} onGenerate={handleGenerate} isLoading={isLoading} />
    </div>
  );

  const fontClass = FONT_STEPS[fontStep].className;
  const androidDevice = isAndroidUserAgent(typeof navigator === 'undefined' ? '' : navigator.userAgent);

  const TextSizeControl = () => (
    <div className="mt-4">
      <p className="text-center text-base font-semibold text-slate-900 dark:text-slate-50 mb-2">
        Text size: {FONT_STEPS[fontStep].label}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Text size">
        {FONT_STEPS.map((step, index) => {
          const selected = index === fontStep;
          return (
            <button
              key={step.label}
              type="button"
              aria-pressed={selected}
              onClick={() => setFontStep(index)}
              className={
                selected
                  ? 'bg-blue-700 text-white border-2 border-blue-800 font-bold text-base px-4 py-2 rounded-lg'
                  : 'bg-white text-slate-900 border-2 border-slate-700 font-semibold text-base px-4 py-2 rounded-lg hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-50 dark:border-slate-200 dark:hover:bg-slate-700'
              }
            >
              {step.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const ListeningControls = () => (
    <div className="mt-6">
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center">
        <button
          type="button"
          onClick={() => playSpeak(speedRef.current)}
          className="bg-green-700 hover:bg-green-800 text-white font-bold py-3 px-6 rounded-lg text-lg"
        >
          Play
        </button>
        <button
          type="button"
          onClick={() => playSpeak(speedRef.current * 0.75)}
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg text-lg"
        >
          Slower
        </button>
        <button
          type="button"
          onClick={stopSpeaking}
          className="bg-red-300 hover:bg-red-400 text-red-950 font-bold py-3 px-6 rounded-lg text-lg"
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
        <div className="mt-4 max-w-lg mx-auto flex w-full flex-col gap-3 sm:flex-row sm:items-center">
          {(isSpeaking || isPaused) && (
            <button
              type="button"
              onClick={isPaused ? resumePlayback : pausePlayback}
              aria-pressed={isPaused}
              className="shrink-0 bg-violet-700 hover:bg-violet-800 text-white font-bold py-3 px-5 rounded-lg text-lg"
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-3 text-base font-medium text-slate-900 dark:text-slate-50 mb-1">
              <span>{formatClock(elapsedMs)}</span>
              <span data-audio-state={isPaused ? 'paused' : isSpeaking ? 'playing' : 'finished'}>
                {isPaused
                  ? 'Paused'
                  : isSpeaking
                    ? playbackRate != null && playbackRate < 1
                      ? 'Playing slower'
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
        </div>
      )}
    </div>
  );

  const DialogueLines = ({ highlight }: { highlight: boolean }) => {
    const turns: DialogueTurn[] = parseDialogue(story);
    return (
      <div
        className={`mt-4 space-y-3 leading-relaxed ${fontClass}`}
        data-transcript={highlight ? (androidDevice ? 'static' : 'synced') : undefined}
      >
        {turns.map((turn, index) => {
          const active = highlight && !androidDevice && index === activeTurn;
          return (
            <p
              key={`${turn.speaker}-${index}`}
              className={active ? 'rounded bg-amber-200 px-1 text-slate-900' : 'text-slate-900 dark:text-slate-50'}
            >
              <span className="font-bold">{turn.speaker}:</span>{' '}
              <DefinedText text={turn.line} />
            </p>
          );
        })}
      </div>
    );
  };

  const TranscriptText = () => {
    if (!showTranscript) return null;
    if (contentFormat === 'dialogue' && parseDialogue(story).length > 0) {
      return <DialogueLines highlight />;
    }
    if (androidDevice) {
      return (
        <DefinedText
          text={story}
          transcript="static"
          className={`mt-4 block whitespace-pre-wrap leading-relaxed text-slate-900 dark:text-slate-50 ${fontClass}`}
        />
      );
    }
    return (
      <DefinedText
        text={story}
        transcript="synced"
        highlightIndex={currentWordIndex}
        className={`mt-4 block leading-relaxed text-slate-900 dark:text-slate-50 ${fontClass}`}
      />
    );
  };

  const StoryScreen = () => (
    <>
      <HomeButton />
      <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-lg w-full max-w-3xl mx-auto">
        <h2 className="text-lg sm:text-3xl font-bold text-center text-slate-900 dark:text-slate-50 whitespace-nowrap">
          {practiceType === 'reading' ? 'Read the Story' : 'Listen to the Story'}
        </h2>
        <p className="mt-2 text-center text-sm sm:text-base font-semibold leading-snug text-slate-900 dark:text-slate-50">
          Topic: {storyTopic?.label ?? TOPICS.find((topic) => topic.value === config.topic)?.label ?? config.topic} · Level: {LEVELS.find((level) => level.value === config.level)?.label ?? config.level} · Format: {contentFormat === 'dialogue' ? 'Dialogue' : 'Text'}
        </p>

        <TextSizeControl />

        {practiceType === 'listening' && <ListeningControls />}

        {practiceType === 'reading' && (
          contentFormat === 'dialogue' && parseDialogue(story).length > 0 ? (
            <DialogueLines highlight={false} />
          ) : (
            <DefinedText
              text={story}
              className={`mt-6 block whitespace-pre-wrap leading-relaxed text-slate-900 dark:text-slate-50 ${fontClass}`}
            />
          )
        )}

        {practiceType === 'listening' && <TranscriptText />}

        {quizLoading && (
          <div className="mt-6 flex items-center justify-center gap-3 text-slate-900 dark:text-slate-50" role="status">
            <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-4 border-blue-700 border-t-transparent" aria-hidden="true"></span>
            <span className="text-base font-semibold">Writing the questions...</span>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-300 dark:border-slate-600 flex flex-col sm:flex-row-reverse justify-center items-center gap-4">
          <button
            type="button"
            onClick={startQuiz}
            disabled={quizLoading || quiz.length === 0}
            className="w-full sm:w-auto bg-blue-700 hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 text-white font-bold py-3 px-8 rounded-lg text-lg"
          >
            {quizLoading ? 'Writing the questions...' : 'Start Quiz'}
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
          <h2 className="text-2xl font-bold text-center mb-4 text-slate-900 dark:text-slate-50">
            {practiceType === 'reading' ? 'Reading Comprehension Quiz' : 'Listening Comprehension Quiz'}
          </h2>
          <button
            type="button"
            onClick={openStoryReview}
            className="mb-6 w-full bg-indigo-700 hover:bg-indigo-800 text-white font-bold py-3 px-4 rounded-lg text-lg"
          >
            {practiceType === 'reading' ? 'Review story' : 'Listen again'}
          </button>
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

  const legalPage = legalPageFromPath(window.location.pathname);
  if (legalPage) return <LegalDocument page={legalPage} />;
  if (!account.ready) return <AuthLoading />;

  const showLanding = !account.signedIn;
  const statusText = planStatusText(account.plan, account.lessonsLeft, account.academyRole === 'student');
  const inviteCode = (() => {
    try {
      const fromUrl = normalizeInviteCode(new URLSearchParams(window.location.search).get('code') || '');
      if (fromUrl) return fromUrl;
      return normalizeInviteCode(localStorage.getItem(ACADEMY_INVITE_KEY) || '');
    } catch {
      return '';
    }
  })();

  const signedOutPage = (
    <div className="min-h-screen text-slate-900 dark:text-slate-50 flex flex-col items-center px-3 pt-2 pb-4 sm:px-5 sm:pb-6 transition-colors duration-300">
      <DictionaryPopup />
      {isLoading && loadingStartedAt != null && (
        <Loader
          startedAt={loadingStartedAt}
          estimateSeconds={loadingEstimate}
          note={loadingNote}
          onCancel={handleCancelGenerate}
        />
      )}
      {storyReviewOpen && view === 'quiz' && (
        <div
          className="fixed inset-0 z-40 overflow-y-auto bg-slate-100 dark:bg-slate-900"
          role="dialog"
          aria-modal="true"
          aria-label={practiceType === 'reading' ? 'Review story' : 'Listen again'}
        >
          <div className="sticky top-0 z-10 border-b border-slate-300 bg-slate-100 px-4 py-4 dark:border-slate-600 dark:bg-slate-900">
            <div className="mx-auto w-full max-w-3xl">
              <button
                type="button"
                onClick={closeStoryReview}
                className="w-full sm:w-auto bg-blue-700 hover:bg-blue-800 text-white font-bold text-lg py-3 px-6 rounded-lg"
              >
                Back to quiz
              </button>
              <p className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-50">
                You are on question {currentQuestionIndex + 1} of {quiz.length}. Your answers are saved.
              </p>
            </div>
          </div>
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            <TextSizeControl />
            {practiceType === 'listening' ? (
              <>
                <ListeningControls />
                <TranscriptText />
              </>
            ) : (
              contentFormat === 'dialogue' && parseDialogue(story).length > 0 ? (
                <DialogueLines highlight={false} />
              ) : (
                <DefinedText
                  text={story}
                  className={`mt-6 block whitespace-pre-wrap leading-relaxed text-slate-900 dark:text-slate-50 ${fontClass}`}
                />
              )
            )}
            <button
              type="button"
              onClick={closeStoryReview}
              className="mt-8 w-full bg-blue-700 hover:bg-blue-800 text-white font-bold text-lg py-3 px-6 rounded-lg"
            >
              Back to quiz
            </button>
          </div>
        </div>
      )}
      {!account.signedIn && view !== 'story' && (
        <header className="mb-3 w-full max-w-4xl mx-auto">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:gap-4">
              <UKFlagIcon className="h-14 w-14 shrink-0 rounded-lg shadow-md sm:h-20 sm:w-20" />
              {showLanding ? (
                <p className="text-left text-2xl font-fun leading-tight tracking-wide sm:text-4xl">
                  <span className="text-blue-800 dark:text-blue-300">Your daily </span>
                  <span className="text-red-700 dark:text-red-400">English Test!</span>
                </p>
              ) : (
                <h1 className="text-left text-2xl font-fun leading-tight tracking-wide sm:text-4xl">
                  <span className="text-blue-800 dark:text-blue-300">Your daily </span>
                  <span className="text-red-700 dark:text-red-400">English Test!</span>
                </h1>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {account.signedIn ? (
                <>
                  <p className="max-w-[12rem] truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{account.email}</p>
                  {account.plan === 'free' && (
                    <p className="text-sm text-slate-800 dark:text-slate-100">
                      Free lessons left: {account.lessonsLeft} of {FREE_LESSON_LIMIT}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => { void signOut(); }}
                    className="rounded-lg border-2 border-slate-900 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 dark:border-slate-100 dark:text-white dark:hover:bg-slate-700"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => focusSignIn()}
                  className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-bold text-white hover:bg-blue-800 sm:px-4 sm:py-2 sm:text-base"
                >
                  Sign in
                </button>
              )}
              {view === 'config' && (
                <button
                  type="button"
                  onClick={() => setThemeChoice(darkOn ? 'light' : 'dark')}
                  aria-pressed={darkOn}
                  className="inline-flex shrink-0 items-center rounded-lg border-2 border-slate-900 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 sm:px-4 sm:py-2 sm:text-base dark:border-slate-100 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                >
                  {darkOn ? 'Light mode' : 'Dark mode'}
                </button>
              )}
            </div>
          </div>
          {!showLanding && (
            <>
              <h2 className="mt-2 text-center text-lg font-bold text-slate-900 dark:text-white sm:text-2xl md:text-3xl">
                English Comprehension Practice
              </h2>
              <p className="mt-1 text-center text-base text-slate-800 dark:text-slate-100 sm:text-lg">
                Practice reading and listening with short stories and quizzes.
              </p>
            </>
          )}
        </header>
      )}

      {signInOpen && !account.signedIn && !showLanding && (
        <SignInBox prompt={signInPrompt} onClose={() => { setSignInOpen(false); setSignInPrompt(false); }} />
      )}

      {showLanding ? <Landing /> : (
      <main className="w-full">
        {view === 'config' && statusText && (
          <p className="mx-auto mb-4 w-fit rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-800 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100">
            {statusText}
          </p>
        )}
        {error && (
          <div className="w-full max-w-2xl mx-auto bg-red-100 border border-red-700 text-red-900 px-4 py-3 rounded-lg relative mb-6 text-base" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        {renderContent()}
      </main>
      )}
      {!account.signedIn && <SiteFooter />}
    </div>
  );

  const shellItem: ShellItem = path === '/progress' ? 'progress' : path === '/saved' ? 'saved' : path === '/profile' ? 'profile' : path === '/academy' ? 'academy' : path === '/join' ? 'join' : 'lesson';
  const go = (next: string) => {
    const clean = next.replace(/\/+$/, '') || '/';
    const current = window.location.pathname.replace(/\/+$/, '') || '/';
    if (current !== clean) window.history.pushState({}, '', clean);
    setPath(clean);
    if (clean === '/') resetApp();
    window.scrollTo({ top: 0 });
  };
  const openSaved = (lesson: Record<string, unknown>) => {
    stopSpeaking();
    const quizItems = Array.isArray(lesson.quiz) ? lesson.quiz as QuizQuestion[] : [];
    setStory(String(lesson.story ?? ''));
    setQuiz(quizItems);
    setVocabulary(Array.isArray(lesson.vocabulary) ? lesson.vocabulary as VocabularyItem[] : []);
    setDialogueTurns(Array.isArray(lesson.dialogue) ? lesson.dialogue as DialogueTurn[] : parseDialogue(String(lesson.story ?? '')));
    setUserAnswers(new Array(quizItems.length).fill(''));
    setCurrentQuestionIndex(0);
    setStoryReviewOpen(false);
    setPracticeType(lesson.mode === 'listening' ? 'listening' : 'reading');
    setContentFormat(lesson.format === 'dialogue' ? 'dialogue' : 'text');
    if (typeof lesson.level === 'string') setConfig((current) => ({ ...current, level: lesson.level as string }));
    setStoryTopic({ label: String(lesson.title ?? lesson.topic ?? 'Lesson'), surprise: false });
    setView('story');
    const current = window.location.pathname.replace(/\/+$/, '') || '/';
    if (current !== '/') window.history.pushState({}, '', '/');
    setPath('/');
    window.scrollTo({ top: 0 });
  };
  const cefr = (['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const).includes(account.defaultLevel as CefrLevel)
    ? account.defaultLevel as CefrLevel
    : 'A2';

  if (!account.signedIn) return signedOutPage;

  return (
    <AppShell active={shellItem} onNavigate={go} onSignOut={() => { void signOut(); }} email={account.email} status={statusText} showAcademy={account.plan === 'academy'}>
      {shellItem === 'progress' && <ProgressPage onCreate={() => go('/')} />}
      {shellItem === 'saved' && <SavedLessonsPage onOpen={openSaved} onCreate={() => go('/')} />}
      {shellItem === 'academy' && account.plan === 'academy' && <AcademyPage />}
      {shellItem === 'academy' && account.plan !== 'academy' && (
        <p className="text-base">This page is for academy accounts.</p>
      )}
      {shellItem === 'join' && (
        <JoinAcademyPage
          code={inviteCode}
          onJoined={() => {
            try {
              localStorage.removeItem(ACADEMY_INVITE_KEY);
              localStorage.removeItem(ACADEMY_INVITE_DISMISSED_KEY);
            } catch { /* ignore */ }
            void account.refreshProfile();
            go('/');
          }}
          onNotNow={() => {
            try { localStorage.setItem(ACADEMY_INVITE_DISMISSED_KEY, inviteCode); } catch { /* ignore */ }
            go('/');
          }}
        />
      )}
      {shellItem === 'profile' && (
        <ProfilePage
          userId={account.userId}
          email={account.email}
          plan={account.plan}
          lessonsLeft={account.lessonsLeft}
          theme={themeChoice}
          defaultLevel={cefr}
          voice={account.voice}
          speed={account.speed}
          displayName={account.displayName}
          academyRole={account.academyRole}
          academyName={account.academyName}
          onTheme={setThemeChoice}
          onSaved={(next) => {
            setThemeChoice(next.theme);
            speedRef.current = next.speed;
            voiceRef.current = next.voice;
            levelAppliedRef.current = true;
            setConfig((current) => ({ ...current, level: cefrToLessonLevel(next.defaultLevel) }));
            void account.refreshProfile();
          }}
          onAcademyChanged={() => { void account.refreshProfile(); }}
        />
      )}
      {shellItem === 'lesson' && signedOutPage}
    </AppShell>
  );
};

export default App;
