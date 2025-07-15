import type { ConfigOptions, VocabularyItem, QuizQuestion } from '../types';

export const generateStoryAndQuiz = async (config: ConfigOptions): Promise<{ story: string; vocabulary: VocabularyItem[]; quiz: QuizQuestion[] }> => {
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(config),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        
        return data;

    } catch (error) {
        console.error("Error fetching story and quiz from our API:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to generate content: ${error.message}`);
        }
        throw new Error("An unknown error occurred while communicating with our server.");
    }
};
