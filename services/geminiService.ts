import { ConfigOptions, QuizQuestion, VocabularyItem } from '../types';

export async function generateStoryAndQuiz(config: ConfigOptions): Promise<{
  story: string;
  quiz: QuizQuestion[];
  vocabulary: VocabularyItem[];
}> {
  try {
    // Vocabulario fijo = 10
    const vocabularyCount = 10;

    // Enviamos parámetros claros al backend
    const payload = {
      level: config.level,
      topic: config.topic,
      wordCount: config.wordCount,          // 100 | 150 | 200
      questionCount: config.questionCount,  // nº preguntas
      vocabularyCount                       // 10
    };

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: JSON.stringify(payload) })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error generating story and quiz:', error);
    throw error;
  }
}
