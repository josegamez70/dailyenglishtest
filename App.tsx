import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { QuizQuestion, ConfigOptions, PracticeType, AppView, VocabularyItem } from './types';
import { LEVELS, TOPICS, WORD_COUNTS, QUESTION_COUNTS } from './constants';
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
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isVocabularyModalOpen, setIsVocabularyModalOpen] = useState(false);

  // Audio / transcript
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null);

  // Refs para control de audio
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const stoppedByUserRef = useRef(false);
  const highlightTimerRef = useRef<number | null>(null);
  const firstBoundaryHeardRef = useRef(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await generateStoryAndQuiz(config);
      setStory(result.story);
      setQuiz(result.quiz);
      setVocabulary(result.vocabulary);
      setUserAnswers(new Array(result.quiz.length).fill(''));
      setView('story');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      setView('config');
    } finally {
      setIsLoading(false);
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

  const clearHighlightTimer = () => {
    if (highlightTimerRef.current) {
      clearInterval(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
  };

  const stopSpeaking = useCallback(() => {
    stoppedByUserRef.current = true;
    try { window.speechSynthesis.cancel(); } catch {}
    clearHighlightTimer();
    setIsSpeaking(false);
    setCurrentWordIndex(null);
    setError(null);
    utteranceRef.current = null;
    setTimeout(() => (stoppedByUserRef.current = false), 120);
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
    setUserAnswers([]);
    setCurrentQuestionIndex(0);
    setError(null);
    setIsVocabularyModalOpen(false);
    setShowTranscript(false);
    setCurrentWordIndex(null);
    if (isSpeaking) stopSpeaking();
  };

  const playSpeak = useCallback((rate: number = 1) => {
    if (!story) return;
    setError(null);
    stoppedByUserRef.current = false;

    window.speechSynthesis.cancel();
    clearHighlightTimer();
    setIsSpeaking(false);
    setCurrentWordIndex(null);
    firstBoundaryHeardRef.current = false;

    const words = story.split(/\s+/);
    const wpm = rate <= 0.6 ? 110 : rate < 1.1 ? 180 : 220;
    const isAndroid = /android/i.test(navigator.userAgent);

    // función de fallback por tiempo
    const startFallback = () => {
      let i = 0;
      setCurrentWordIndex(0);
      const msPerWord = 60_000 / wpm;
      highlightTimerRef.current = window.setInterval(() => {
        if (!isSpeaking) return;
        i++;
        if (i >= words.length) {
          clearHighlightTimer();
          return;
        }
        setCurrentWordIndex(i);
      }, msPerWord) as unknown as number;
    };

    if (isAndroid) {
      // en Android: siempre modo fallback
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(story);
        utterance.lang = 'en-US';
        utterance.rate = rate;

        utterance.onend = () => {
          clearHighlightTimer();
          setIsSpeaking(false);
          setCurrentWordIndex(null);
        };

        utterance.onerror = (e: any) => {
          clearHighlightTimer();
          if (stoppedByUserRef.current) return;
          setError('Could not play audio.');
          setIsSpeaking(false);
        };

        utteranceRef.current = utterance;
        try {
          window.speechSynthesis.speak(utterance);
          setIsSpeaking(true);
          startFallback();
        } catch {
          setError('Audio could not be generated.');
          setIsSpeaking(false);
        }
      }, 60);
      return;
    }

    // desktop/laptop → onboundary + fallback si no hay evento
    const fallbackTimer = window.setTimeout(() => {
      if (!firstBoundaryHeardRef.current) {
        startFallback();
      }
    }, 900);

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(story);
      utterance.lang = 'en-US';
      utterance.rate = rate;

      utterance.onboundary = (e: any) => {
        if (!firstBoundaryHeardRef.current) {
          firstBoundaryHeardRef.current = true;
          clearHighlightTimer();
        }
        const charIndex = e?.charIndex ?? 0;
        let count = 0;
        for (let i = 0; i < words.length; i++) {
          count += words[i].length + 1;
          if (count > charIndex) {
            setCurrentWordIndex(i);
            break;
          }
        }
      };

      utterance.onend = () => {
        clearTimeout(fallbackTimer);
        clearHighlightTimer();
        setIsSpeaking(false);
        setCurrentWordIndex(null);
      };

      utterance.onerror = (e: any) => {
        clearTimeout(fallbackTimer);
        clearHighlightTimer();
        if (stoppedByUserRef.current) return;
        setError('Could not play audio.');
        setIsSpeaking(false);
      };

      utteranceRef.current = utterance;
      try {
        window.speechSynthesis.speak(utterance);
        setIsSpeaking(true);
      } catch {
        clearTimeout(fallbackTimer);
        setError('Audio could not be generated.');
        setIsSpeaking(false);
      }
    }, 60);
  }, [story, isSpeaking]);

  useEffect(() => {
    return () => {
      if (isSpeaking) stopSpeaking();
    };
  }, [isSpeaking, stopSpeaking]);

  const HomeButton = () => (
    <button
      onClick={resetApp}
      className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white border-2 border-blue-500 hover:border-blue-400 transition-all z-10 p-2 rounded-full shadow-lg"
      aria-label="Go to home screen"
    >
      <HomeIcon className="w-6 h-6" />
    </button>
  );

  const ConfigScreen = () => (
    <div className="w-full max-w-2xl mx-auto">
      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={() => setPracticeType('reading')}
          className={`flex flex-col items-center justify-center p-5 rounded-lg border-2 transition-all duration-200 ${practiceType === 'reading' ? 'bg-blue-100 dark:bg-blue-900 border-blue-500' : 'bg-white dark:bg-slate-800 border-transparent hover:border-blue-400'}`}
        >
          <BookOpenIcon className="w-8 h-8 mb-2 text-blue-500" />
          <span className="font-semibold">Reading</span>
        </button>
        <button
          onClick={() => setPracticeType('listening')}
          className={`flex flex-col items-center justify-center p-5 rounded-lg border-2 transition-all duration-200 ${practiceType === 'listening' ? 'bg-blue-100 dark:bg-blue-900 border-blue-500' : 'bg-white dark:bg-slate-800 border-transparent hover:border-blue-400'}`}
        >
          <HeadphonesIcon className="w-8 h-8 mb-2 text-blue-500" />
          <span className="font-semibold">Listening</span>
        </button>
      </div>
      <Configurator config={config} setConfig={setConfig} onGenerate={handleGenerate} isLoading={isLoading} />
    </div>
  );

  const StoryScreen = () => (
    <>
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg w-full max-w-3xl mx-auto relative">
        <HomeButton />
        <h2 className="text-xl font-bold mb-4 text-center">
          {practiceType === 'reading' ? 'Read the Story' : 'Listen to the Story'}
        </h2>

        {practiceType === 'listening' && (
          <div className="mb-6 flex flex-wrap gap-3 justify-center">
            <button onClick={() => playSpeak(1)} className="bg-green-600 text-white font-bold py-3 px-6 rounded-lg">Play 1x</button>
            <button onClick={() => playSpeak(0.5)} className="bg-yellow-500 text-white font-bold py-3 px-6 rounded-lg">Play 0.5x</button>
            <button onClick={stopSpeaking} className="bg-slate-700 text-white font-bold py-3 px-6 rounded-lg">Stop</button>
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg"
            >
              {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
            </button>
          </div>
        )}

        {practiceType === 'reading' && <p>{story}</p>}
        {practiceType === 'listening' && showTranscript && (
          <div className="mt-4">
            {story.split(' ').map((word, idx) => (
              <span
                key={idx}
                style={{
                  color: idx === currentWordIndex ? 'red' : 'inherit',
                  fontWeight: idx === currentWordIndex ? 'bold' : 'normal',
                }}
              >
                {word}{' '}
              </span>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-col sm:flex-row-reverse gap-4">
          <button onClick={startQuiz} className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg">Start Quiz</button>
          {vocabulary.length > 0 && (
            <button onClick={() => setIsVocabularyModalOpen(true)} className="border border-slate-400 py-3 px-8 rounded-lg">
              View Vocabulary
            </button>
          )}
        </div>
      </div>
      <VocabularyModal isOpen={isVocabularyModalOpen} onClose={() => setIsVocabularyModalOpen(false)} vocabulary={vocabulary} />
    </>
  );

  // ... QuizScreen y ResultsScreen igual que antes ...

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      {isLoading && <Loader />}
      {error && <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div>}
      {view === 'config' && <ConfigScreen />}
      {view === 'story' && <StoryScreen />}
      {/* Aquí incluirías QuizScreen y ResultsScreen como en tu código actual */}
    </div>
  );
};

export default App;
