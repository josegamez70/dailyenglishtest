import type { Handler } from '@netlify/functions';

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
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) throw new Error('Missing GEMINI_API_KEY in environment');

    // Body desde el frontend: { prompt: JSON.stringify({ level, topic, wordCount, questionCount, vocabularyCount:10 }) }
    const body = JSON.parse(event.body || '{}');
    const promptStr = body.prompt || '{}';

    // Parámetros
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
      params = {};
    }

    const level = params.level || 'intermediate';
    const topic = params.topic || 'daily_life';
    const target = Number(params.wordCount) || 150; // 100 | 150 | 200
    const questionCount = Number(params.questionCount) || 5;
    const vocabularyCount = Number(params.vocabularyCount) || 10;

    // Tolerancia ±10% (o mínimo 10 palabras)
    const tolerance = Math.max(10, Math.round(target * 0.1));
    const minWords = target - tolerance;
    const maxWords = target + tolerance;

    // Prompt claro + salida JSON estricta
    const sysPrompt = `
You are an English teacher. Create content for a ${level} student about "${topic}".
Requirements:
- Story length: BETWEEN ${minWords} AND ${maxWords} words (inclusive). Stay within range.
- Questions: exactly ${questionCount}, multiple choice with 4 options, include "correctAnswer".
- Vocabulary: exactly ${vocabularyCount} keywords from the story with short definitions.
- Language: English only.
Output: ONLY JSON (no markdown fences) with this schema:
{
  "story": "string",
  "quiz": [
    { "question": "string", "options": ["string","string","string","string"], "correctAnswer": "string" }
  ],
  "vocabulary": [
    { "word": "string", "definition": "string" }
  ]
}
If the story is out of range, rewrite and try again—do not refuse.
    `.trim();

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + API_KEY;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: sysPrompt }] }],
        generationConfig: { responseMimeType: 'application/json' } // fuerza JSON plano
      })
    });

    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`Gemini API error: ${resp.status} ${resp.statusText} – ${t}`);
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    // Parse robusto
    let parsed: GenResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}$/);
      if (!match) throw new Error('Model did not return valid JSON');
      parsed = JSON.parse(match[0]);
    }

    // Saneos:
    // 1) Longitud de historia (si excede, recortamos al máximo permitido)
    if (parsed.story) {
      const wc = wordCountOf(parsed.story);
      if (wc > maxWords) parsed.story = trimToMaxWords(parsed.story, maxWords);
      // si queda por debajo del mínimo, lo aceptamos como “más o menos”
    } else {
      parsed.story = '';
    }

    // 2) Vocabulario: exactamente vocabularyCount
    if (Array.isArray(parsed.vocabulary)) {
      if (parsed.vocabulary.length > vocabularyCount) {
        parsed.vocabulary = parsed.vocabulary.slice(0, vocabularyCount);
      }
    } else {
      parsed.vocabulary = [];
    }

    // 3) Quiz: asegurar número de preguntas máximo = questionCount
    if (Array.isArray(parsed.quiz)) {
      if (parsed.quiz.length > questionCount) {
        parsed.quiz = parsed.quiz.slice(0, questionCount);
      }
    } else {
      parsed.quiz = [];
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
