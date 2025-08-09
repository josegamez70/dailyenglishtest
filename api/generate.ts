import type { Handler } from '@netlify/functions';
import { GoogleGenerativeAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL_NAME = 'gemini-1.5-flash'; // rápido y suficiente para este caso

type GenResponse = {
  story: string;
  quiz: { question: string; options: string[]; correctAnswer: string }[];
  vocabulary: { word: string; definition: string }[];
};

function wordCountOf(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function trimToMaxWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  let trimmed = words.slice(0, maxWords).join(' ').trim();
  if (!/[.!?…]$/.test(trimmed)) trimmed += '.';
  return trimmed;
}

export const handler: Handler = async (event) => {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('Missing GEMINI_API_KEY in environment');
    }

    const body = JSON.parse(event.body || '{}');
    const promptStr = body.prompt || '{}';

    // Los parámetros vienen como string JSON desde el frontend
    let params: {
      level?: string;
      topic?: string;
      wordCount?: number;
      questionCount?: number;
      vocabularyCount?: number;
    } = {};
    try {
      params = JSON.parse(promptStr);
    } catch {
      // si viniera malformado, usamos defaults
      params = {};
    }

    const level = params.level || 'intermediate';
    const topic = params.topic || 'daily_life';
    const target = Number(params.wordCount) || 150; // 100/150/200
    const questionCount = Number(params.questionCount) || 5;
    const vocabularyCount = Number(params.vocabularyCount) || 10;

    // Tolerancia ±10%
    const tolerance = Math.max(10, Math.round(target * 0.1));
    const minWords = target - tolerance;
    const maxWords = target + tolerance;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Prompt con requisitos claros y salida JSON estricta
    const sysPrompt = `
You are an English teacher. Create content for a ${level} student about "${topic}".
Requirements:
- Story length: BETWEEN ${minWords} AND ${maxWords} words (inclusive). Stay in range.
- Questions: exactly ${questionCount}, multiple choice with 4 options, include "correctAnswer".
- Vocabulary: exactly ${vocabularyCount} keywords from the story with definitions.
- Language: English, clear and level-appropriate.
Output: ONLY JSON (no markdown fences, no commentary) with this schema:
{
  "story": "string",
  "quiz": [
    { "question": "string", "options": ["string","string","string","string"], "correctAnswer": "string" }
  ],
  "vocabulary": [
    { "word": "string", "definition": "string" }
  ]
}
If you cannot follow the constraints, rewrite and try again—do not refuse, just comply.
    `.trim();

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: sysPrompt }] }],
      generationConfig: {
        responseMimeType: 'application/json' // fuerza JSON plano
      }
    });

    const text = result.response.text() || '{}';

    // Parse robusto
    let parsed: GenResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}$/);
      if (!match) {
        throw new Error('Model did not return valid JSON');
      }
      parsed = JSON.parse(match[0]);
    }

    // Saneamos story y vocabulario por si se pasa del máximo
    if (parsed.story) {
      const wc = wordCountOf(parsed.story);
      // Si excede el máximo, recortamos al máximo permitido
      if (wc > maxWords) {
        parsed.story = trimToMaxWords(parsed.story, maxWords);
      }
      // Si está por debajo del mínimo, lo aceptamos (el usuario pidió "más o menos"),
      // pero podrías reintentar aquí si quisieras reforzar el mínimo.
    }

    if (Array.isArray(parsed.vocabulary)) {
      if (parsed.vocabulary.length > vocabularyCount) {
        parsed.vocabulary = parsed.vocabulary.slice(0, vocabularyCount);
      }
    } else {
      parsed.vocabulary = [];
    }

    // Aseguramos que hay exactamente questionCount preguntas (si se pasa, cortamos)
    if (Array.isArray(parsed.quiz) && parsed.quiz.length > questionCount) {
      parsed.quiz = parsed.quiz.slice(0, questionCount);
    }

    return {
      statusCode: 200,
      body: JSON.stringify(parsed)
    };
  } catch (err: any) {
    console.error('generate.ts error:', err?.message || err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err?.message || 'Unknown error' })
    };
  }
};
