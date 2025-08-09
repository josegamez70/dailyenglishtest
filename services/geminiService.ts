import { ConfigOptions, QuizQuestion, VocabularyItem } from '../types';

export async function generateStoryAndQuiz(config: ConfigOptions): Promise<{
    story: string;
    quiz: QuizQuestion[];
    vocabulary: VocabularyItem[];
}> {
    try {
        // Duplicamos el número de palabras de vocabulario que se solicitan
        const vocabularyCount = Math.floor((config.wordCount / 10) * 2);

        const prompt = `
You are an English teacher. 
Generate an English story with about ${config.wordCount} words for a ${config.level} level student, 
about the topic: ${config.topic}.
After the story, create ${config.questionCount} comprehension multiple-choice questions with 4 options each, indicating the correct answer.
Finally, give me ${vocabularyCount} important vocabulary words from the story with their definitions.
Return the result in JSON with the structure:
{
  "story": "...",
  "quiz": [
    { "question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": "..." }
  ],
  "vocabulary": [
    { "word": "...", "definition": "..." }
  ]
}
        `;

        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
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
