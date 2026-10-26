export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  supportingSentence: string;
}

export interface VocabularyItem {
  word: string;
  definition: string;
}

export interface ConfigOptions {
  level: string;
  topic: string;
  wordCount: number;
  questionCount: number;
  practiceType?: PracticeType;
}

export type PracticeType = 'reading' | 'listening';

export type AppView = 'config' | 'story' | 'quiz' | 'results';
