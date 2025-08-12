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

  // Refs para controlar síntesis y fallbacks
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const stoppedByUserRef = useRef(false);
  const highlightTimerRef = useRef<number | null>(null);
  const firstBoundaryHeardRef = useRef(false);
  const isSpeakingRef = useRef(false);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

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
    // pequeña ventana para ignorar errores "interrupted/canceled"
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

  /**
   * Reproduce con:
   * - Limpieza de cola previa (cancel()).
   * - Desktop/laptop: onboundary (preciso) y fallback si no llega.
   * - Android: forzar fallback por tiempo (onboundary es poco fiable).
   * - Fallback ajustado: 13% más lento que el anterior + pausas más largas en . ! ?
   */
  const playSpeak = useCallback((rate: number = 1) => {
    if (!story) return;
    setError(null);
    stoppedByUserRef.current = false;

    // limpiar síntesis y timers anteriores
    window.speechSynthesis.cancel();
    clearHighlightTimer();
    setIsSpeaking(false);
    setCurrentWordIndex(null);
    firstBoundaryHeardRef.current = false;

    const words = story.split(/\s+/);
    const isAndroid = /android/i.test(navigator.userAgent);

    // WPM calibrado por velocidad
    const baseWpm =
      rate <= 0.6 ? 140 :
      rate < 1.1 ? 190 :
      230;

    // Afinado por velocidad (ligero ajuste)
    const tune =
      rate <= 0.6 ? 0.92 :
      rate < 1.1 ? 0.98 :
      1.0;

    // --- Fallback por tiempo (13% más lento que la versión previa) ---
    const startFallback = () => {
      let i = 0;
      setCurrentWordIndex(0);
      
const msPerWordBase = 60_000 / baseWpm;

// base de la versión actual
const speedFactorBase = 1.017;

// ✅ ajustes pedidos:
// - 0.5x  → 4% más lento  (×1.04)
// - 1x    → 2% más rápido (×0.98)
// - otros → igual que antes
const speedFactor =
  rate <= 0.6
    ? speedFactorBase * 1.04
    : (rate >= 0.95 && rate <= 1.05)
      ? speedFactorBase * 0.98
      : speedFactorBase;

const msPerWord = msPerWordBase * tune * speedFactor;

      // Pausas más lentas al final de frase (. ! ?) alrededor de 1x
      let extraHold = 0;
      highlightTimerRef.current = window.setInterval(() => {
        if (!isSpeakingRef.current) return;

        if (extraHold > 0) {
          extraHold--;
          return;
        }

        i++;
        if (i >= words.length) {
          clearHighlightTimer();
          return;
        }
        setCurrentWordIndex(i);

        const lastChar = words[i - 1]?.slice(-1);
        // En 1x hacemos la pausa doble (2 ticks) en fin de frase
        if (rate >= 0.95 && rate <= 1.05 && /[.!?]/.test(lastChar || '')) {
          extraHold = 2; // antes 1 → ahora 2 para "más lentas"
        }
      }, msPerWord) as unknown as number;
    };

    // En Android: siempre modo fallback por tiempo
    if (isAndroid) {
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
          const err = e?.error || '';
          if (stoppedByUserRef.current || err === 'interrupted' || 'canceled') {
            setIsSpeaking(false);
            setCurrentWordIndex(null);
            return;
          }
          setError('Could not play audio. Your browser may not support this feature.');
          setIsSpeaking(false);
          setCurrentWordIndex(null);
        };

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

    // Desktop/laptop → onboundary + fallback si no hay evento
    const fallbackTimer = window.setTimeout(() => {
      if (!firstBoundaryHeardRef.current) {
        startFallback();
      }
    }, 900);

    // Pequeño retardo para asegurar cola limpia en todos los navegadores
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(story);
      utterance.lang = 'en-US';
      utterance.rate = rate;

      utterance.onboundary = (e: any) => {
        // llegó al menos un boundary -> cancelar fallback por tiempo
        if (!firstBoundaryHeardRef.current) {
          firstBoundaryHeardRef.current = true;
          clearHighlightTimer();
        }
        const charIndex = e?.charIndex ?? 0;
        let count = 0;
        for (let i = 0; i < words.length; i++) {
          count += words[i].length + 1; // +1 por espacio
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
        const err = e?.error || '';
        if (stoppedByUserRef.current || err === 'interrupted' || err === 'canceled') {
          setIsSpeaking(false);
          setCurrentWordIndex(null);
          return;
        }
        setError('Could not play audio. Your browser may not support this feature.');
        setIsSpeaking(false);
        setCurrentWordIndex(null);
      };

      utteranceRef.current = utterance;
      try {
        window.speechSynthesis.speak(utterance);
        setIsSpeaking(true);
      } catch {
        clearTimeout(fallbackTimer);
        setError('Audio could not be generated. Please try again.');
        setIsSpeaking(false);
      }
    }, 60);
  }, [story]);

  useEffect(() => {
    return () => {
      if (isSpeaking) stopSpeaking();
    };
  }, [isSpeaking, stopSpeaking]);

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
          <span className="font-semibold text-slate-800 dark:text-slate-200">Reading</span>
        </button>
        <button
          onClick={() => setPracticeType('listening')}
          className={`flex flex-col items-center justify-center p-5 rounded-lg border-2 transition-all duration-200 ${practiceType === 'listening' ? 'bg-blue-100 dark:bg-blue-900 border-blue-500' : 'bg-white dark:bg-slate-800 border-transparent hover:border-blue-400'}`}
        >
          <HeadphonesIcon className="w-8 h-8 mb-2 text-blue-500" />
          <span className="font-semibold text-slate-800 dark:text-slate-200">Listening</span>
        </button>
      </div>
      <Configurator config={config} setConfig={setConfig} onGenerate={handleGenerate} isLoading={isLoading} />
    </div>
  );

  const StoryScreen = () => (
    <>
      <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-lg w-full max-w-3xl mx-auto relative">
        <HomeButton />
        <h2 className="text-xl sm:text-2xl font-bold mb-4 text-center text-slate-800 dark:text-slate-100 leading-tight break-words whitespace-pre-line">
          {practiceType === 'reading' ? 'Read the\nStory' : 'Listen to the\nStory'}
        </h2>

        {practiceType === 'listening' && (
          <div className="mb-6 flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center">
            <button
              onClick={() => playSpeak(1)}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg text-lg"
            >
              Play 1x
            </button>
            <button
              onClick={() => playSpeak(0.5)}
              className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-6 rounded-lg text-lg"
            >
              Play 0.5x
            </button>
            <button
              onClick={stopSpeaking}
              className="bg-slate-700 hover:bg-slate-800 text-white font-bold py-3 px-6 rounded-lg text-lg"
            >
              Stop
            </button>
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg text-lg"
            >
              {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
            </button>
          </div>
        )}

        {practiceType === 'reading' && (
          <p className="whitespace-pre-wrap">{story}</p>
        )}
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

        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row-reverse justify-center items-center gap-4">
          <button
            onClick={startQuiz}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
          >
            Start Quiz
          </button>
          {vocabulary.length > 0 && (
            <button
              onClick={() => setIsVocabularyModalOpen(true)}
              className="w-full sm:w-auto bg-transparent border-2 border-slate-400 text-slate-700 dark:text-slate-300 hover:bg-slate-400 hover:text-white dark:border-slate-500 dark:hover:bg-slate-500 dark:hover:text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
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
      <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-lg w-full max-w-2xl mx-auto relative">
        <HomeButton />
        <h2 className="text-2xl font-bold text-center mb-6 text-slate-800 dark:text-slate-100">
          {practiceType === 'reading' ? 'Reading Comprehension Quiz' : 'Listening Comprehension Quiz'}
        </h2>
        <div className="mb-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Question {currentQuestionIndex + 1} of {quiz.length}
          </p>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mt-1">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all"
              style={{ width: `${((currentQuestionIndex + 1) / quiz.length) * 100}%` }}
            ></div>
          </div>
        </div>
        <h3 className="text-xl md:text-2xl font-semibold mb-6 text-slate-800 dark:text-slate-100">{question.question}</h3>
        <div className="space-y-3">
          {question.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswerSelect(option)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                userAnswers[currentQuestionIndex] === option
                  ? 'bg-blue-100 dark:bg-blue-900 border-blue-500'
                  : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <button
          onClick={handleNextQuestion}
          disabled={!userAnswers[currentQuestionIndex]}
          className="mt-8 w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold py-3 px-4 rounded-lg text-lg"
        >
          {currentQuestionIndex < quiz.length - 1 ? 'Next Question' : 'Finish Quiz'}
        </button>
      </div>
    );
  };

  const ResultsScreen = () => {
    const score = quiz.reduce(
      (acc, question, index) => acc + (question.correctAnswer === userAnswers[index] ? 1 : 0),
      0
    );
    const percentage = Math.round((score / quiz.length) * 100);

    let feedback = 'Keep practicing!';
    if (percentage >= 80) feedback = 'Excellent job!';
    else if (percentage >= 50) feedback = 'Good effort!';

    return (
      <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-lg w-full max-w-3xl mx-auto relative">
        <HomeButton />
        <h2 className="text-3xl font-bold text-center mb-2 text-slate-800 dark:text-slate-100">Quiz Complete!</h2>
        <p className="text-center text-xl text-slate-600 dark:text-slate-300 mb-2">
          You scored {score} out of {quiz.length} ({percentage}%)
        </p>
        <p className="text-center text-lg font-semibold text-blue-600 dark:text-blue-400 mb-6">{feedback}</p>
        <div className="space-y-4">
          {quiz.map((question, index) => {
            const userAnswer = userAnswers[index];
            const isCorrect = question.correctAnswer === userAnswer;
            return (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  isCorrect
                    ? 'border-green-300 bg-green-50 dark:bg-green-900/50 dark:border-green-700'
                    : 'border-red-300 bg-red-50 dark:bg-red-900/50 dark:border-red-700'
                }`}
              >
                <p className="font-semibold text-slate-800 dark:text-slate-100 mb-2">
                  {index + 1}. {question.question}
                </p>
                <div className="flex items-center">
                  {isCorrect ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-600 mr-2 flex-shrink-0" />
                  ) : (
                    <XCircleIcon className="w-5 h-5 text-red-600 mr-2 flex-shrink-0" />
                  )}
                  <p className="text-sm text-slate-700 dark:text-slate-300">Your answer: {userAnswer}</p>
                </div>
                {!isCorrect && (
                  <div className="flex items-center mt-1">
                    <CheckCircleIcon className="w-5 h-5 text-green-600 mr-2 flex-shrink-0" />
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Correct answer: {question.correctAnswer}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
          <button
            onClick={resetApp}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-xl transition-transform hover:scale-105"
          >
            Try Another
          </button>
          <button
            onClick={() => setView('story')}
            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-8 rounded-lg text-xl transition-transform hover:scale-105"
          >
            Review Story
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen text-slate-800 dark:text-slate-200 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 transition-colors duration-300">
      {isLoading && <Loader />}
      <header className="w-full max-w-4xl mx-auto mb-6 text-center">
        <div className="flex justify-center items-center gap-4 mb-4">
          <UKFlagIcon className="w-28 h-28 rounded-lg shadow-md" />
          <h1 className="text-4xl font-fun tracking-wide">
            <span className="text-blue-800 dark:text-blue-400">Your daily </span>
            <span className="text-red-600 dark:text-red-500">English Test!</span>
          </h1>
        </div>
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
          English Comprehension Practice
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-2 text-base">
          Hone your skills with AI-powered stories and quizzes.
        </p>
      </header>

      <main className="w-full">
        {error && (
          <div className="w-full max-w-2xl mx-auto bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-6" role="alert">
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
