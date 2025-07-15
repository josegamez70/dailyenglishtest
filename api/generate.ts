// This is a serverless function that will be deployed to Vercel, Netlify, etc.
// It will live in the /api directory.
// e.g. /api/generate.ts

import { GoogleGenAI, Type } from "@google/genai";
import type { ConfigOptions } from '../types';

// This function is the handler for the serverless function.
// It's often named 'handler' or follows the file-based routing convention of the hosting provider.
// For Vercel, the default export is the handler.
export default async function handler(request: Request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (!process.env.API_KEY) {
        return new Response(JSON.stringify({ error: 'API_KEY environment variable is not set on the server.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const config: ConfigOptions = await request.json();
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const storyDataSchema = {
            type: Type.OBJECT,
            properties: {
                story: {
                    type: Type.STRING,
                    description: "The generated story text. It should not contain a title."
                },
                vocabulary: {
                    type: Type.ARRAY,
                    description: "An array of 5 key vocabulary words from the story, each with a simple definition.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            word: { type: Type.STRING, description: "A key vocabulary word." },
                            definition: { type: Type.STRING, description: "A simple definition of the word." }
                        },
                        required: ["word", "definition"]
                    }
                },
                quiz: {
                    type: Type.ARRAY,
                    description: "An array of quiz questions based on the story.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            question: { type: Type.STRING, description: "The quiz question." },
                            options: {
                                type: Type.ARRAY,
                                description: "Four multiple-choice options.",
                                items: { type: Type.STRING }
                            },
                            correctAnswer: { type: Type.STRING, description: "The correct answer from the options." }
                        },
                        required: ["question", "options", "correctAnswer"]
                    }
                }
            },
            required: ["story", "vocabulary", "quiz"]
        };

        const prompt = `
Generate content for an English language learner with the following specifications. The entire output must be a single JSON object that conforms to the provided schema.

- **Learner Level**: ${config.level}
- **Topic**: ${config.topic}
- **Story Length**: Approximately ${config.wordCount} words.
- **Vocabulary Words**: Exactly 5 key words from the story.
- **Quiz Questions**: Exactly ${config.questionCount} questions.

**Content Generation Instructions**:
1.  **Story**: Write an engaging story based on the topic and level. The story must be in English. Do not include a title.
2.  **Vocabulary**: From the story you wrote, identify exactly 5 key vocabulary words important for a learner at this level. Provide a simple, clear definition for each word in English.
3.  **Quiz**: Based on the story, create a quiz with exactly ${config.questionCount} multiple-choice questions to test comprehension. The questions should cover main ideas, specific details, and vocabulary from the text. Provide four distinct options for each question, with only one being correct.
`;
        
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: storyDataSchema,
            }
        });
        
        const responseJson = JSON.parse(result.text);

        if (!responseJson.story || !responseJson.vocabulary || !responseJson.quiz) {
            throw new Error("AI returned an invalid data structure.");
        }
        
        return new Response(JSON.stringify(responseJson), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Error in serverless function:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        return new Response(JSON.stringify({ error: `Failed to generate content from AI: ${errorMessage}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
