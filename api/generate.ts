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

async function callGeminiJSON(apiKey: string, prompt: string) {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' +
    apiKey;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Gemini API error: ${resp.status} ${resp.statusText} – ${t}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}$/);
    if (!match) throw new Error('Model did not return valid JSON');
    return JSON.parse(match[0]);
  }
}

export const handler: Handler = async (event) => {
  try {
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) throw new Error('Missing API_KEY in environment');

    const body = JSON.parse(event.body || '{}');
    const promptStr = body.prompt || '{}';

    let params: {
      level?: string;
      topic?: string;
      wordCount?: number;
      questionCount?: number;
      vocabularyCount?: number;
    } = {};
    try {
      params = JSON.parse(promptStr);
    } catch { params = {}; }

    const level = params.level || 'intermediate';
    const topic = params.topic || 'daily_life';
    const target = Number(params.wordCount) || 150;           // 100 | 150 | 200
    const questionCount = Number(params.questionCount) || 5;
    const vocabularyCount = Number(params.vocabularyCount) || 10;

    // Rango permitido ±10% (mínimo 10 palabras)
    const tolerance = Math.max(10, Math.round(target * 0.1));
    const minWords = target - tolerance;
    const maxWords = target + tolerance;

    const baseSchema = `
{
  "story": "string",
  "quiz": [
    { "question": "string", "options": ["string","string","string","string"], "correctAnswer": "string" }
  ],
  "vocabulary": [
    { "word": "string", "definition": "string" }
  ]
}`.trim();

    const basePrompt = `
You are an English teacher. Create content for a ${level} student about "${topic}".
Requirements:
- Story length: BETWEEN ${minWords} AND ${maxWords} words (inclusive).
- Questions: exactly ${questionCount}, multiple choice with 4 options, include "correctAnswer".
- Vocabulary: exactly ${vocabularyCount} keywords from the story with short definitions.
- Language: English only.
Output: ONLY JSON (no markdown fences) with this schema:
${baseSchema}
If the story is out of range, rewrite and try again—do not refuse.
`.trim();

    // 1º intento
    let parsed: GenResponse = await callGeminiJSON(API_KEY, basePrompt);

    // Longitud: si excede, recortamos; si es corta, reintentamos hasta 2 veces
    let wc = wordCountOf(parsed.story || '');
    let attempts = 0;

    while (wc < minWords && attempts < 2) {
      // Reescritura para alcanzar el rango
      const rewritePrompt = `
Rewrite the following story so that its length is BETWEEN ${minWords} AND ${maxWords} words (inclusive).
Keep the same topic and level. Return ONLY JSON with the same schema as before.

Original JSON:
${JSON.stringify(parsed, null, 2)}
`.trim();

      parsed = await callGeminiJSON(API_KEY, rewritePrompt);
      wc = wordCountOf(parsed.story || '');
      attempts++;
    }

    if (wc > maxWords) {
      parsed.story = trimToMaxWords(parsed.story || '', maxWords);
    }

    // Normalizamos arrays
    if (!Array.isArray(parsed.quiz)) parsed.quiz = [];
    if (!Array.isArray(parsed.vocabulary)) parsed.vocabulary = [];

    // Cortes finales por arriba
    if (parsed.quiz.length > questionCount) {
      parsed.quiz = parsed.quiz.slice(0, questionCount);
    }
    if (parsed.vocabulary.length > vocabularyCount) {
      parsed.vocabulary = parsed.vocabulary.slice(0, vocabularyCount);
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
