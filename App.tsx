import React, { useState, useCallback, useRef, useEffect } from "react";
import Configurator from "./Configurator";
import Loader from "./Loader";
import VocabularyModal from "./VocabularyModal";
import { generateStoryAndQuiz } from "./services/geminiService";
import type { ConfigOptions, QuizQuestion, VocabularyItem } from "./types";

const App: React.FC = () => {
  const [view, setView] = useState<"config" | "story" | "quiz" | "results">("config");
  const [practiceType, setPracticeType] = useState<"reading" | "listening">("reading");
  const [config, setConfig] = useState<ConfigOptions>({
    level: "A1",
    topic: "daily life",
    wordCount: 100,
    questionCount: 5,
  });
  const [story, setStory] = useState("");
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([]);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVocabularyModalOpen, setIsVocabularyModalOpen] = useState(false);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null);

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
      setUserAnswers(new Array(result.quiz.length).fill(""));
      setView("story");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
      setView("config");
    } finally {
      setIsLoading(false);
    }
  };

  const stopSpeaking = useCallback(() => {
    stoppedByUserRef.current = true;
    try {
      window.speechSynthesis.cancel();
    } catch {}
    if (highlightTimerRef.current) {
      clearInterval(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    setIsSpeaking(false);
    setCurrentWordIndex(null);
    setError(null);
    utteranceRef.current = null;
    setTimeout(() => (stoppedByUserRef.current = false), 120);
  }, []);

  const clearHighlightTimer = () => {
    if (highlightTimerRef.current) {
      clearInterval(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
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
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(story);
        utterance.lang = "en-US";
        utterance.rate = rate;

        utterance.onend = () => {
          clearHighlightTimer();
          setIsSpeaking(false);
          setCurrentWordIndex(null);
        };

        utterance.onerror = (e: any) => {
          clearHighlightTimer();
          if (stoppedByUserRef.current) return;
          setError("Could not play audio.");
          setIsSpeaking(false);
        };

        utteranceRef.current = utterance;
        try {
          window.speechSynthesis.speak(utterance);
          setIsSpeaking(true);
          startFallback();
        } catch {
          setError("Audio could not be generated.");
          setIsSpeaking(false);
        }
      }, 60);
      return;
    }

    const fallbackTimer = window.setTimeout(() => {
      if (!firstBoundaryHeardRef.current) {
        startFallback();
      }
    }, 900);

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(story);
      utterance.lang = "en-US";
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
        setError("Could not play audio.");
        setIsSpeaking(false);
      };

      utteranceRef.current = utterance;
      try {
        window.speechSynthesis.speak(utterance);
        setIsSpeaking(true);
      } catch {
        clearTimeout(fallbackTimer);
        setError("Audio could not be generated.");
        setIsSpeaking(false);
      }
    }, 60);
  }, [story, isSpeaking]);

  useEffect(() => {
    return () => {
      if (isSpeaking) stopSpeaking();
    };
  }, [isSpeaking, stopSpeaking]);

  const startQuiz = () => {
    setCurrentQuestionIndex(0);
    setView("quiz");
    if (isSpeaking) stopSpeaking();
  };

  const resetApp = () => {
    setView("config");
    setStory("");
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

  return (
    <div className="min-h-screen p-4">
      {isLoading && <Loader />}
      {error && <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div>}

      {view === "config" && (
        <Configurator
          config={config}
          setConfig={setConfig}
          onGenerate={handleGenerate}
          practiceType={practiceType}
          setPracticeType={setPracticeType}
        />
      )}

      {view === "story" && (
        <div className="max-w-3xl mx-auto">
          {practiceType === "listening" && (
            <div className="mb-4 flex gap-3">
              <button onClick={() => playSpeak(1)} className="bg-green-600 text-white p-2 rounded">Play 1x</button>
              <button onClick={() => playSpeak(0.5)} className="bg-yellow-500 text-white p-2 rounded">Play 0.5x</button>
              <button onClick={stopSpeaking} className="bg-gray-700 text-white p-2 rounded">Stop</button>
              <button onClick={() => setShowTranscript(!showTranscript)} className="bg-red-600 text-white p-2 rounded">
                {showTranscript ? "Hide Transcript" : "Show Transcript"}
              </button>
            </div>
          )}
          {practiceType === "reading" && <p>{story}</p>}
          {practiceType === "listening" && showTranscript && (
            <p>
              {story.split(" ").map((word, idx) => (
                <span
                  key={idx}
                  style={{
                    color: idx === currentWordIndex ? "red" : "inherit",
                    fontWeight: idx === currentWordIndex ? "bold" : "normal",
                  }}
                >
                  {word}{" "}
                </span>
              ))}
            </p>
          )}
          <button onClick={startQuiz} className="bg-blue-600 text-white p-2 rounded mt-4">Start Quiz</button>
          <button onClick={() => setIsVocabularyModalOpen(true)} className="border p-2 rounded ml-2">View Vocabulary</button>
          <VocabularyModal isOpen={isVocabularyModalOpen} onClose={() => setIsVocabularyModalOpen(false)} vocabulary={vocabulary} />
        </div>
      )}

      {view === "quiz" && (
        <div className="max-w-3xl mx-auto">
          <h2>Question {currentQuestionIndex + 1} of {quiz.length}</h2>
          <p>{quiz[currentQuestionIndex].question}</p>
          {quiz[currentQuestionIndex].options.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => {
                const newAnswers = [...userAnswers];
                newAnswers[currentQuestionIndex] = opt;
                setUserAnswers(newAnswers);
                setCurrentQuestionIndex(currentQuestionIndex + 1);
              }}
              className="block border p-2 rounded my-2"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {view === "results" && (
        <div className="max-w-3xl mx-auto">
          <h2>Results</h2>
          {quiz.map((q, idx) => (
            <div key={idx} className="mb-4">
              <p><strong>Q:</strong> {q.question}</p>
              <p><strong>Your answer:</strong> {userAnswers[idx]}</p>
              <p><strong>Correct:</strong> {q.correctAnswer}</p>
            </div>
          ))}
          <button onClick={resetApp} className="bg-blue-600 text-white p-2 rounded">Go Home</button>
        </div>
      )}
    </div>
  );
};

export default App;
