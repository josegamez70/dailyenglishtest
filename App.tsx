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

  // NEW: States for tokenized story for consistent rendering and highlighting
  const [storyRenderTokens, setStoryRenderTokens] = useState<string[]>([]);
  const [highlightableTokens, setHighlightableTokens] = useState<string[]>([]);

  // Refs para controlar síntesis y fallbacks
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const stoppedByUserRef = useRef(false);
  const highlightTimerRef = useRef<number | null>(null);
  const firstBoundaryHeardRef = useRef(false);
  const isSpeakingRef = useRef(false); // Para que el setInterval lea el estado actualizado

  // Update ref when isSpeaking state changes
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // NEW: Process story into tokens when it changes
  useEffect(() => {
    if (story) {
      // Regex to split by words (\b\w+\b) or non-space characters ([^\s]) while keeping spaces
      // Example: "Hello, world!" -> ["Hello", ",", " ", "world", "!"]
      const tokens = story.split(/(\b\w+\b|[^\s])/g).filter(token => token !== '');
      setStoryRenderTokens(tokens);
      setHighlightableTokens(tokens.filter(token => !/\s/.test(token)));
    } else {
      setStoryRenderTokens([]);
      setHighlightableTokens([]);
    }
  }, [story]);

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
    // Small window to ignore "interrupted/canceled" errors
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
   * Reproduces audio with:
   * - Previous queue clearing (cancel()).
   * - Desktop/laptop: onboundary (precise) and fallback if it doesn't arrive.
   * - Android: force time-based fallback (onboundary is unreliable).
   * - Adjusted fallback: calibrated for speed + longer pauses at . ! ?
   */
  const playSpeak = useCallback((rate: number = 1) => {
    // Ensure story and processed tokens are available
    if (!story || highlightableTokens.length === 0) {
      setError('Story or tokens not ready for playback.');
      return;
    }
    setError(null);
    stoppedByUserRef.current = false;

    // Clear previous synthesis and timers
    window.speechSynthesis.cancel();
    clearHighlightTimer();
    setIsSpeaking(false);
    setCurrentWordIndex(null);
    firstBoundaryHeardRef.current = false;

    const isAndroid = /android/i.test(navigator.userAgent);

    // WPM (Words Per Minute) calibrated by speed
    const baseWpm =
      rate <= 0.6 ? 140 :
      rate < 1.1 ? 190 :
      230;

    // Fine-tuning by speed (slight adjustment)
    const tune =
      rate <= 0.6 ? 0.92 :
      rate < 1.1 ? 0.98 :
      1.0;

    // Additional adjustment for setInterval speed (msPerWord)
    const speedFactorBase = 1.017;
    const speedFactor =
      rate <= 0.6
        ? speedFactorBase * 1.04 // 4% slower
        : (rate >= 0.95 && rate <= 1.05)
          ? speedFactorBase * 0.98 // 2% faster
          : speedFactorBase;

    const msPerWord = (60_000 / baseWpm) * tune * speedFactor;

    // Pause ticks (how many msPerWord intervals to hold the current word)
    const PAUSE_TICKS_SENTENCE = rate <= 0.6 ? 7 : 4;
    const PAUSE_TICKS_COMMA    = rate <= 0.6 ? 3 : 1;

    // --- Time-based Fallback ---
    const startFallback = () => {
      let i = 0; // This is the index for highlightableTokens
      let extraHold = 0;
      setCurrentWordIndex(0); // Highlight the first word immediately

      highlightTimerRef.current = window.setInterval(() => {
        // Stop if not speaking or explicitly stopped by user
        if (!isSpeakingRef.current || stoppedByUserRef.current) {
          clearHighlightTimer();
          setCurrentWordIndex(null);
          setIsSpeaking(false); // Ensure isSpeaking is false on stop/end
          return;
        }

        if (extraHold > 0) {
          extraHold--;
          return;
        }

        i++;
        if (i >= highlightableTokens.length) {
          clearHighlightTimer();
          setCurrentWordIndex(null);
          setIsSpeaking(false); // Stop speaking state when all words are highlighted
          return;
        }
        setCurrentWordIndex(i);

        // Apply pauses based on the last character of the word that just passed
        const currentToken = highlightableTokens[i - 1];
        if (currentToken) {
          const lastChar = currentToken.slice(-1);
          if (/[.!?]/.test(lastChar)) {
            extraHold = PAUSE_TICKS_SENTENCE;
          } else if (/[,:;]/.test(lastChar)) {
            extraHold = PAUSE_TICKS_COMMA;
          }
        }
      }, msPerWord) as unknown as number;
    };

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
      // Ignore "interrupted" or "canceled" errors if user stopped playback
      if (stoppedByUserRef.current || err === 'interrupted' || err === 'canceled') {
        setIsSpeaking(false);
        setCurrentWordIndex(null);
        return;
      }
      setError('Could not play audio. Your browser may not support this feature.');
      setIsSpeaking(false);
      setCurrentWordIndex(null);
    };

    // Small delay to ensure previous `cancel()` has taken effect in all browsers
    setTimeout(() => {
      utteranceRef.current = utterance;
      try {
        window.speechSynthesis.speak(utterance);
        setIsSpeaking(true);

        if (isAndroid) {
          // On Android, always start the time-based fallback
          startFallback();
        } else {
          // Desktop/laptop: try using onboundary. If no boundary event after a delay, use fallback.
          const fallbackTimer = window.setTimeout(() => {
            if (!firstBoundaryHeardRef.current) {
              startFallback();
            }
          }, 900); // Give it some time (e.g., 900ms) for onboundary to fire

          let tempOverallCharIndex = 0;
          let tempHighlightableIndex = 0;

          utterance.onboundary = (e: any) => {
            // Once a boundary event is received, cancel the fallback timer
            if (!firstBoundaryHeardRef.current) {
              firstBoundaryHeardRef.current = true;
              clearTimeout(fallbackTimer);
              clearHighlightTimer(); // Ensure fallback timer is not active
            }

            const charIndex = e?.charIndex ?? 0;

            // Find the corresponding word in highlightableTokens based on charIndex
            // Iterate through `storyRenderTokens` to accurately calculate character positions
            tempOverallCharIndex = 0;
            tempHighlightableIndex = 0;
            for (let i = 0; i < storyRenderTokens.length; i++) {
                const token = storyRenderTokens[i];
                if (!/\s/.test(token)) { // If it's a highlightable token (not a space)
                    // If the synthesis charIndex falls within this token, set it as current
                    if (charIndex >= tempOverallCharIndex && charIndex < tempOverallCharIndex + token.length) {
                        setCurrentWordIndex(tempHighlightableIndex);
                        break; // Found the current token
                    }
                    tempHighlightableIndex++; // Advance highlightable token index
                }
                tempOverallCharIndex += token.length; // Advance overall character index
            }
          };
        }
      } catch (err) {
        // Clear fallback timer if an error occurs immediately when speaking
        // (e.g., no voices available or invalid parameters)
        if (!isAndroid && fallbackTimer) clearTimeout(fallbackTimer);
        setError('Audio could not be generated. Please try again.');
        setIsSpeaking(false);
      }
    }, 60); // Small delay to allow cancel() to fully process
  }, [story, highlightableTokens, storyRenderTokens, stopSpeaking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isSpeaking) stopSpeaking();
    };
  }, [isSpeaking, stopSpeaking]); // Dependencies for useEffect

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

  const StoryScreen = () => {
    let currentHighlightableTokenIndex = 0; // Counter for mapping `storyRenderTokens` to `highlightableTokens`
    return (
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
            <div className="mt-4 text-lg leading-relaxed">
              {storyRenderTokens.map((token, idx) => {
                const isSpace = /\s/.test(token);
                let shouldHighlight = false;

                // Only consider highlighting if it's not a space
                if (!isSpace) {
                  if (currentHighlightableTokenIndex === currentWordIndex) {
                    shouldHighlight = true;
                  }
                  currentHighlightableTokenIndex++; // Increment for the next highlightable token
                }

                return (
                  <span
                    key={idx} // Using token index from storyRenderTokens for unique keys
                    style={{
                      color: shouldHighlight ? 'red' : 'inherit',
                      fontWeight: shouldHighlight ? 'bold' : 'normal',
                    }}
                  >
                    {token}
                  </span>
                );
              })}
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
  };

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