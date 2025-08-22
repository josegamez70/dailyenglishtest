import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

// ---------- Normalizador de quiz (A/B/C/D → texto de opción) ----------
type AnyQuiz = {
  question: string;
  options: string[];
  correctAnswer?: string;
  correct?: string;
  answer?: string;
  correctAnswerIndex?: number;
};

// Quita etiquetas tipo "A) ", "B. " al inicio de cada opción
const stripLabel = (s: string) =>
  s.replace(/^\s*[A-D]\s*(?:[\)\.\:\-]\s*|\-\s*)/i, '').trim();

const normalizeQuizData = (raw: AnyQuiz[]): QuizQuestion[] => {
  return raw.map((q) => {
    const options = (q.options || []).map(o => stripLabel(String(o || '')));
    const rawAns = (q.correctAnswer ?? q.correct ?? q.answer ?? '').toString().trim();

    // 1) índice explícito
    if (typeof q.correctAnswerIndex === 'number' && options[q.correctAnswerIndex]) {
      return { question: q.question, options, correctAnswer: options[q.correctAnswerIndex] };
    }

    // 2) letra A/B/C/D
    const letter = rawAns.match(/^[A-Z]/i)?.[0];
    if (letter) {
      const idx = letter.toUpperCase().charCodeAt(0) - 65;
      const pick = options[idx] ?? options[0] ?? '';
      return { question: q.question, options, correctAnswer: pick };
    }

    // 3) texto exacto o parcial
    const norm = stripLabel(rawAns);
    let idx = options.findIndex(o => o.toLowerCase() === norm.toLowerCase());
    if (idx === -1) idx = options.findIndex(o => o.toLowerCase().includes(norm.toLowerCase()));
    const pick = idx >= 0 ? options[idx] : (options[0] ?? '');
    return { question: q.question, options, correctAnswer: pick };
  });
};

// --- Subtítulos: trocear historia en frases de ~6 palabras, cortando también al fin de frase ---
// Esta función ya no se usa para el popup, pero se mantiene si se quisiera para otras cosas.
const chunkStoryToPhrases = (text: string, target: number = 6): string[] => {
  if (!text) return [];
  const tokens = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let buf: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    buf.push(w);
    const endOfSentence = /[.!?]$/.test(w);
    if (buf.length >= target || endOfSentence) {
      out.push(buf.join(' '));
      buf = [];
    }
  }
  if (buf.length) out.push(buf.join(' '));
  return out;
};

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

  // --- Detección móvil ya no influye directamente en los subtítulos popup,
  //     solo para posibles futuros usos o estilos.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent || '';
    const mobile = /android|iphone|ipad|ipod/i.test(ua) || window.innerWidth < 768;
    setIsMobile(mobile);
  }, []);

  // Subtítulos: phrases y currentPhraseIndex ya no son usados para el popup.
  // Se mantienen en caso de que la lógica se use para otras cosas.
  const phrases = useMemo(() => chunkStoryToPhrases(story, 6), [story]);
  const currentPhraseIndex = useMemo(() => {
    if (!phrases.length || currentWordIndex == null) return -1;
    const counts = phrases.map(p => p.split(/\s+/).length);
    const totalWords = counts.reduce((a, b) => a + b, 0);

    // Eliminado el SPEEDUP para mobile aquí ya que el popup de frases se ha quitado.
    // El resaltado de palabra a palabra gestiona su propia sincronización.
    const effectiveWordIndex = Math.min(
      totalWords - 1,
      Math.max(0, Math.floor(currentWordIndex)) // Ya no hay SPEEDUP aquí
    );

    let acc = 0;
    for (let i = 0; i < counts.length; i++) {
      acc += counts[i];
      if (effectiveWordIndex < acc) return i;
    }
    return phrases.length - 1;
  }, [phrases, currentWordIndex]); // isMobile ya no es dependencia aquí

  // Refs para controlar síntesis y fallbacks
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const stoppedByUserRef = useRef(false);
  const highlightTimerRef = useRef<number | null>(null);
  const firstBoundaryHeardRef = useRef(false);
  const isSpeakingRef = useRef(false);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  const getLetter = (idx: number) => String.fromCharCode(65 + idx); // A, B, C...

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await generateStoryAndQuiz(config);
      setStory(result.story);

      // Normaliza el quiz para que correctAnswer sea SIEMPRE el texto de una opción:
      const normalizedQuiz = normalizeQuizData(result.quiz as any);
      setQuiz(normalizedQuiz);

      setVocabulary(result.vocabulary);
      setUserAnswers(new Array(normalizedQuiz.length).fill(''));
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
    // ventana para ignorar errores "interrupted/canceled"
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
   * - Fallback ajustado: Calibrado para mejor sincronización en móvil.
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

    const words = story.split(/\s+/).filter(Boolean); // Filtrar palabras vacías
    const isAndroid = /android/i.test(navigator.userAgent);

    // --- Calibración de milisegundos por palabra (para el fallback) ---
    // Estos valores son ESTIMACIONES. Necesitarás probar en dispositivos reales
    // y ajustarlos si la sincronización no es perfecta.
    // Son los milisegundos que el temporizador esperará por CADA PALABRA.
    const getMsPerWord = (speechRate: number): number => {
      if (speechRate <= 0.6) return 420 // Para 0.5x - Ajustado a 280ms
      if (speechRate < 1.1) return 340// Para 1x - Ajustado a 180ms
      return 150; // Para velocidades más rápidas
    };

    const startFallback = () => {
      let i = 0;
      setCurrentWordIndex(0); // Empezar resaltado en la primera palabra

      const msPerWord = getMsPerWord(rate);

      // Pausas en milisegundos. Ajusta si el flujo se siente antinatural.
      const PAUSE_MS_SENTENCE = rate <= 0.6 ? 800 : 400; // fin de frase (. ! ?)
      const PAUSE_MS_COMMA    = rate <= 0.6 ? 200 : 100; // coma/;/: (opcional)

      let remainingPauseMs = 0;

      highlightTimerRef.current = window.setInterval(() => {
        if (!isSpeakingRef.current) { // Si se detiene la reproducción
          clearHighlightTimer();
          return;
        }

        if (remainingPauseMs > 0) {
          remainingPauseMs -= msPerWord; // Descontamos el tiempo de la palabra normal del tiempo de pausa
          if (remainingPauseMs <= 0) { // Si la pausa termina, avanzamos la palabra
              remainingPauseMs = 0;
              i++; // Avanza a la siguiente palabra después de la pausa
          } else { // Si la pausa continúa, no avanzamos la palabra actual en este tick
              return;
          }
        } else { // No hay pausa activa, avanzamos a la siguiente palabra
            i++;
        }

        if (i >= words.length) {
          clearHighlightTimer();
          setIsSpeaking(false);
          setCurrentWordIndex(null);
          return;
        }

        setCurrentWordIndex(i);

        // Calcular la pausa si la palabra anterior termina en puntuación
        // Se aplica a la palabra que ACABAMOS de "pronunciar" (i - 1)
        const previousWord = words[i - 1];
        if (previousWord) {
            const lastChar = previousWord.slice(-1);
            if (/[.!?]$/.test(lastChar)) { // $ asegura que es el último carácter
                remainingPauseMs = PAUSE_MS_SENTENCE;
            } else if (/[,:;]$/.test(lastChar)) { // $ asegura que es el último carácter
                remainingPauseMs = PAUSE_MS_COMMA;
            }
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
          startFallback(); // Iniciar el temporizador de resaltado
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
    }, 900); // Dar tiempo para que onboundary se dispare

    // Pequeño retardo para asegurar cola limpia en todos los navegadores
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(story);
      utterance.lang = 'en-US';
      utterance.rate = rate;

      utterance.onboundary = (e: any) => {
        // llegó al menos un boundary -> cancelar fallback por tiempo
        if (!firstBoundaryHeardRef.current) {
          firstBoundaryHeardRef.current = true;
          clearTimeout(fallbackTimer); // Asegúrate de limpiar el timer de fallback
          clearHighlightTimer(); // Y cualquier timer de resaltado si ya empezó
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
    {/* ELIMINADO: La barra de subtítulos flotante para móvil.
        Ahora el texto resaltado es la única forma de subtítulo. */}

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

      {/* Texto de la historia - siempre visible en modo Reading */}
      {practiceType === 'reading' && (
        <p className="whitespace-pre-wrap">{story}</p>
      )}

      {/* Transcripción con resaltado - ahora para todos los dispositivos si showTranscript es true */}
      {practiceType === 'listening' && showTranscript && (
        <div className="mt-4 text-base leading-relaxed text-slate-700 dark:text-slate-300">
          {story.split(/\s+/).filter(Boolean).map((word, idx) => ( // Split y filter para manejar espacios dobles
            <span
              key={idx}
              style={{
                color: idx === currentWordIndex ? 'red' : 'inherit',
                fontWeight: idx === currentWordIndex ? 'bold' : 'normal',
                backgroundColor: idx === currentWordIndex ? 'rgba(255, 255, 0, 0.3)' : 'transparent', // Un sutil resaltado de fondo
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
          {question.options.map((option, index) => {
            const letter = getLetter(index);
            return (
              <button
                key={index}
                onClick={() => handleAnswerSelect(option)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                  userAnswers[currentQuestionIndex] === option
                    ? 'bg-blue-100 dark:bg-blue-900 border-blue-500'
                    : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                {/* Envolver el contenido en un único nodo para evitar error JSX */}
                <span>
                  <span className="font-semibold mr-2">{letter}.</span> {option}
                </span>
              </button>
            );
          })}
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
            const correctText = question.correctAnswer;

            // calcular letras para user y correct
            const userIdx = question.options.findIndex(o => o === userAnswer);
            const correctIdx = question.options.findIndex(o => o === correctText);
            const userLetter = userIdx >= 0 ? getLetter(userIdx) : null;
            const correctLetter = correctIdx >= 0 ? getLetter(correctIdx) : null;

            const isCorrect = correctText === userAnswer;

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
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    Your answer: {userLetter ? `${userLetter}. ` : ''}{userAnswer || '—'}
                  </p>
                </div>
                {!isCorrect && (
                  <div className="flex items-center mt-1">
                    <CheckCircleIcon className="w-5 h-5 text-green-600 mr-2 flex-shrink-0" />
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Correct answer: {correctLetter ? `${correctLetter}. ` : ''}{correctText}
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