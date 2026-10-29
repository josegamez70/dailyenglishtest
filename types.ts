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

export type ContentFormat = 'text' | 'dialogue';

export interface ConfigOptions {
  level: string;
  topic: string;
  wordCount: number;
  questionCount: number;
  practiceType?: PracticeType;
  format?: ContentFormat;
  speakers?: { name: string; gender: 'female' | 'male' }[];
}

export type PracticeType = 'reading' | 'listening';

export type AppView = 'config' | 'story' | 'quiz' | 'results';
