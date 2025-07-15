
export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
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
}

export type PracticeType = 'reading' | 'listening';

export type AppView = 'config' | 'story' | 'quiz' | 'results';