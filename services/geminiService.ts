// services/geminiService.ts
import type { ConfigOptions, QuizQuestion, VocabularyItem } from '../types';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-1.5-flash';

const getApiKey = () =>
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
  (typeof process !== 'undefined' && (process as any).env?.VITE_GEMINI_API_KEY);

function extractJson(text: string): any {
  if (!text) throw new Error('Empty response from model.');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const payload = fenced ? fenced[1] : text;
  const first = payload.indexOf('{');
  const last = payload.lastIndexOf('}');
  const sliced = first >= 0 && last > first ? payload.slice(first, last + 1) : payload.trim();
  const noTrailingCommas = sliced.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(noTrailingCommas);
}

export async function generateStoryAndQuiz(
  config: ConfigOptions
): Promise<{ story: string; quiz: QuizQuestion[]; vocabulary: VocabularyItem[] }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      'Missing VITE_GEMINI_API_KEY. Set it in your environment variables (e.g., Netlify env vars or .env.local).'
    );
  }

  // Wildcard topic handling
  const topicPrompt =
    config.topic === 'wildcard'
      ? 'any interesting or surprising topic'
      : `the topic '${config.topic}'`;

  // Rango ±10 palabras
  const minWords = Math.max(20, (config.wordCount as number) - 10);
  const maxWords = (config.wordCount as number) + 10;

  const prompt = `
Generate a story of about ${config.wordCount} words
(minimum ${minWords} words, maximum ${maxWords} words)
on ${topicPrompt}, suitable for ${config.level} learners.

Constraints:
- Use clear, CEFR-appropriate vocabulary for the selected level (${config.level}).
- Keep the narrative coherent and engaging.
- After the story, provide a quiz with ${config.questionCount} multiple-choice questions.
- Each question must include 4 options.
- "correctAnswer" must match exactly one of the options (not a letter or index).
- Provide a "vocabulary" list with 6–10 words from the story and their definitions.
Return only valid JSON with fields: "story", "quiz", "vocabulary".
`.trim();

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  let text: string;
  try {
    const result = await model.generateContent(prompt);
    text = await result.response.text();
  } catch (err: any) {
    console.error('Gemini API error:', err);
    throw new Error('Could not generate content. Please try again.');
  }

  let data: any;
  try {
    data = extractJson(text);
  } catch (err) {
    console.error('JSON parse error:', err, '\nRAW TEXT:\n', text);
    throw new Error('Model returned invalid JSON. Please try again.');
  }

  if (!data.story || !Array.isArray(data.quiz) || data.quiz.length === 0) {
    throw new Error('Generated content incomplete. Please try again.');
  }

  const quiz: QuizQuestion[] = data.quiz.map((q: any) => ({
    question: String(q?.question || ''),
    options: Array.isArray(q?.options) ? q.options.map((o: any) => String(o || '')) : [],
    correctAnswer: String(q?.correctAnswer || q?.correct || q?.answer || ''),
    correctAnswerIndex:
      typeof q?.correctAnswerIndex === 'number' ? q.correctAnswerIndex : undefined,
  }));

  const vocabulary: VocabularyItem[] = (data.vocabulary || []).map((v: any) => ({
    word: String(v?.word || ''),
    definition: String(v?.definition || ''),
  }));

  return {
    story: String(data.story || ''),
    quiz,
    vocabulary,
  };
}

export default generateStoryAndQuiz;
