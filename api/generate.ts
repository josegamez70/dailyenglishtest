import type { Handler } from '@netlify/functions';

type GenResponse = {
  story: string;
  quiz: { question: string; options: string[]; correctAnswer: string }[];
  vocabulary: { word: string; definition: string }[];
};

function wc(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
function trimTo(text: string, maxWords: number): string {
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

    // params vienen como string JSON desde el frontend
    let params: {
      level?: string;
      topic?: string;
      wordCount?: number;         // 100 | 150 | 200 (no tocar Configurator)
      questionCount?: number;
      vocabularyCount?: number;   // 10
    } = {};
    try { params = JSON.parse(promptStr); } catch { params = {}; }

    const level = params.level || 'intermediate';
    const topic = params.topic || 'daily_life';
    const target = Number(params.wordCount) || 100;      // 100/150/200
    const questionCount = Number(params.questionCount) || 5;
    const vocabularyCount = Number(params.vocabularyCount) || 10;

    // margen estricto ±5 palabras
    const minWords = target - 5;
    const maxWords = target + 5;

    const schema = `
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
HARD CONSTRAINTS:
- Story length: target ${target} words (ACCEPTABLE RANGE: ${minWords}-${maxWords}). Count words strictly.
- Questions: exactly ${questionCount}, multiple choice with 4 options, include "correctAnswer".
- Vocabulary: exactly ${vocabularyCount} keywords from the story with short definitions.
OUTPUT: ONLY JSON (no markdown fences), matching this schema:
${schema}
If the story is out of range, adjust length and return JSON again (do not refuse).
`.trim();

    // 1) primer intento
    let parsed: GenResponse = await callGeminiJSON(API_KEY, basePrompt);

    // 2) si queda fuera por abajo, reintenta hasta 4 veces; si se pasa por arriba, recorta
    let count = wc(parsed.story || '');
    let tries = 0;

    while (count < minWords && tries < 4) {
      const rewritePrompt = `
Expand the story so its length is within ${minWords}-${maxWords} words (current: ${count}).
Keep topic "${topic}" and ${level} level. Return FULL JSON (story, ${questionCount} questions, ${vocabularyCount} vocabulary items) with the same schema, no markdown.
Current JSON:
${JSON.stringify(parsed)}
`.trim();

      parsed = await callGeminiJSON(API_KEY, rewritePrompt);
      count = wc(parsed.story || '');
      tries++;
    }

    if (count > maxWords) {
      parsed.story = trimTo(parsed.story || '', maxWords);
    }

    // normalización y cortes por arriba
    if (!Array.isArray(parsed.quiz)) parsed.quiz = [];
    if (!Array.isArray(parsed.vocabulary)) parsed.vocabulary = [];
    if (parsed.quiz.length > questionCount) parsed.quiz = parsed.quiz.slice(0, questionCount);
    if (parsed.vocabulary.length > vocabularyCount) parsed.vocabulary = parsed.vocabulary.slice(0, vocabularyCount);

    return { statusCode: 200, body: JSON.stringify(parsed) };
  } catch (err: any) {
    console.error('generate.ts error:', err?.message || err);
    return { statusCode: 500, body: JSON.stringify({ error: err?.message || 'Unknown error' }) };
  }
};
