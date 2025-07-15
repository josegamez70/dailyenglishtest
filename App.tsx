
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { QuizQuestion, ConfigOptions, PracticeType, AppView, VocabularyItem } from './types';
import { LEVELS, TOPICS, WORD_COUNTS, QUESTION_COUNTS } from './constants';
import { generateStoryAndQuiz } from './services/geminiService';
import Configurator from './components/Configurator';
import Loader from './components/Loader';
import BookOpenIcon from './components/icons/BookOpenIcon';
import SoundWaveIcon from './components/icons/SoundWaveIcon';
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

    // Audio state
    const [isSpeaking, setIsSpeaking] = useState(false);
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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
    
    const startQuiz = () => {
        setCurrentQuestionIndex(0);
        setView('quiz');
         if (isSpeaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
        }
    }

    const resetApp = () => {
        setView('config');
        setStory('');
        setQuiz([]);
        setVocabulary([]);
        setUserAnswers([]);
        setCurrentQuestionIndex(0);
        setError(null);
        setIsVocabularyModalOpen(false);
        if (isSpeaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
        }
    };

    const handleSpeak = useCallback(() => {
        if (!story) return;

        if (isSpeaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
        } else {
            const utterance = new SpeechSynthesisUtterance(story);
            utterance.lang = 'en-US';
            utterance.onend = () => setIsSpeaking(false);
            utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
                // 'interrupted' is not a user-facing error. It happens when we programmatically call .cancel().
                // We should not log it as an error or show an error message to the user.
                if (e.error === 'interrupted') {
                    setIsSpeaking(false); // Make sure state is updated
                    return;
                }
                
                // For all other errors, log them and show a user-friendly message.
                console.error(`Speech synthesis error: ${e.error}`);

                let userMessage = 'Could not play audio. Your browser may not support this feature.';
                switch (e.error) {
                    case 'not-allowed':
                        userMessage = 'Audio permission denied. Please enable speech synthesis in your browser settings.';
                        break;
                    case 'language-unavailable':
                        userMessage = 'The English (US) voice is not available on your device.';
                        break;
                    case 'synthesis-failed':
                        userMessage = 'Audio could not be generated. Please try again.';
                        break;
                    case 'network':
                        userMessage = 'A network error prevented audio from playing.';
                        break;
                    case 'audio-busy':
                        userMessage = 'The audio device is busy. Please try again in a moment.';
                        break;
                }
                setError(userMessage);
                setIsSpeaking(false);
            };
            utteranceRef.current = utterance;
            window.speechSynthesis.speak(utterance);
            setIsSpeaking(true);
        }
    }, [story, isSpeaking]);

    useEffect(() => {
        return () => {
            if (isSpeaking) {
                window.speechSynthesis.cancel();
            }
        };
    }, [isSpeaking]);


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
            className="absolute top-4 right-4 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors z-10 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
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
                    <SoundWaveIcon className="w-8 h-8 mb-2 text-blue-500" />
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
                <h2 className="text-2xl font-bold mb-4 text-center text-slate-800 dark:text-slate-100">{practiceType === 'reading' ? 'Read the Story' : 'Listen to the Story'}</h2>
                
                {practiceType === 'listening' && (
                    <div className="mb-6 flex justify-center">
                        <button onClick={handleSpeak} className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg text-lg">
                            {isSpeaking ? 'Stop Audio' : 'Play Audio'}
                        </button>
                    </div>
                )}

                <div className={`prose prose-lg dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 ${practiceType === 'listening' ? 'text-center italic' : 'text-left'}`}>
                    {practiceType === 'reading' ? <p className="whitespace-pre-wrap">{story}</p> : <p>"{story.substring(0, 100)}..."</p>}
                </div>

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
                <div className="mb-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Question {currentQuestionIndex + 1} of {quiz.length}</p>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mt-1">
                        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${((currentQuestionIndex + 1) / quiz.length) * 100}%` }}></div>
                    </div>
                </div>
                <h3 className="text-xl md:text-2xl font-semibold mb-6 text-slate-800 dark:text-slate-100">{question.question}</h3>
                <div className="space-y-3">
                    {question.options.map((option, index) => (
                        <button key={index} onClick={() => handleAnswerSelect(option)} className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${userAnswers[currentQuestionIndex] === option ? 'bg-blue-100 dark:bg-blue-900 border-blue-500' : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'}`}>
                            {option}
                        </button>
                    ))}
                </div>
                 <button onClick={handleNextQuestion} disabled={!userAnswers[currentQuestionIndex]} className="mt-8 w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold py-3 px-4 rounded-lg text-lg">
                    {currentQuestionIndex < quiz.length - 1 ? 'Next Question' : 'Finish Quiz'}
                </button>
            </div>
        );
    };

    const ResultsScreen = () => {
        const score = quiz.reduce((acc, question, index) => acc + (question.correctAnswer === userAnswers[index] ? 1 : 0), 0);
        const percentage = Math.round((score / quiz.length) * 100);

        return (
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-lg w-full max-w-3xl mx-auto relative">
                <HomeButton />
                <h2 className="text-3xl font-bold text-center mb-2 text-slate-800 dark:text-slate-100">Quiz Complete!</h2>
                <p className="text-center text-xl text-slate-600 dark:text-slate-300 mb-6">You scored {score} out of {quiz.length} ({percentage}%)</p>
                <div className="space-y-4">
                    {quiz.map((question, index) => {
                        const userAnswer = userAnswers[index];
                        const isCorrect = question.correctAnswer === userAnswer;
                        return (
                            <div key={index} className={`p-4 rounded-lg border ${isCorrect ? 'border-green-300 bg-green-50 dark:bg-green-900/50 dark:border-green-700' : 'border-red-300 bg-red-50 dark:bg-red-900/50 dark:border-red-700'}`}>
                                <p className="font-semibold text-slate-800 dark:text-slate-100 mb-2">{index + 1}. {question.question}</p>
                                <div className="flex items-center">
                                    {isCorrect ? <CheckCircleIcon className="w-5 h-5 text-green-600 mr-2 flex-shrink-0" /> : <XCircleIcon className="w-5 h-5 text-red-600 mr-2 flex-shrink-0" />}
                                    <p className="text-sm text-slate-700 dark:text-slate-300">Your answer: {userAnswer}</p>
                                </div>
                                {!isCorrect && (
                                    <div className="flex items-center mt-1">
                                        <CheckCircleIcon className="w-5 h-5 text-green-600 mr-2 flex-shrink-0" />
                                        <p className="text-sm text-slate-700 dark:text-slate-300">Correct answer: {question.correctAnswer}</p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                <div className="mt-8 text-center">
                    <button onClick={resetApp} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-xl transition-transform hover:scale-105">
                        Try Another
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
                    <UKFlagIcon className="w-20 h-20 rounded-lg shadow-md" />
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
