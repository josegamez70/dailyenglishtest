// api/generate.ts
import type { Handler } from '@netlify/functions';
import { GoogleGenerativeAI } from '@google/generative-ai';

/* ===================== Utils ===================== */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, tries = 3, base = 500) {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const status = Number(e?.status || e?.code);
      const retryable = [429, 500, 502, 503, 504].includes(status);
      if (!retryable || i === tries - 1) throw e;
      const delay = Math.min(base * (2 ** i) + Math.random() * 150, 4000);
      console.warn(`withRetry: try ${i + 1}/${tries} in ${delay}ms (status ${status})`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function withTimeout<T>(p: Promise<T>, ms = 23000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(Object.assign(new Error('CLIENT_TIMEOUT'), { status: 504 })), ms)
    )
  ]);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function buildPrompt(opts: {
  level?: string;
  topic?: string;
  wordCount?: number;
  questionCount?: number;
  vocabularyCount?: number;
  mode?: 'reading' | 'listening';
}) {
  const {
    level = 'Beginner',
    topic = 'daily life',
    wordCount = 150,
    questionCount = 6,
    vocabularyCount = 8,
    mode = 'reading'
  } = opts;

  const wcTarget = clamp(wordCount, 80, 300);

  return `
You are an English learning assistant. Create content for ${mode} comprehension at level ${level}.
Topic: "${topic}"

Return ONLY strict JSON with this shape (no markdown, no extra text):
{
  "story": "string (~${wcTarget} words)",
  "quiz": [
    { "question": "string", "options": ["A","B","C","D"], "correctAnswer": "A" }
  ],
  "vocabulary": [
    { "word": "string", "definition": "English explanation, short" }
  ]
}

Rules:
- Story ~${wcTarget} words, natural English, 1-3 short paragraphs.
- Exactly ${questionCount} quiz items, each with 4 options and one correctAnswer.
- Exactly ${vocabularyCount} vocabulary items from the story.
- Output valid minified JSON. No markdown or extra commentary.
  `.trim();
}

/* ===================== Config ===================== */
const MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

function pickApiKey() {
  return process.env.API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.VITE_API_KEY
    || process.env.GENAI_API_KEY;
}

/* ===================== Handler ===================== */
export const handler: Handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const API_KEY = pickApiKey();
    if (!API_KEY) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, code: 'NO_API_KEY', message: 'Missing API key' }),
      };
    }

    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    const body = JSON.parse(event.body || '{}');
    let params: any = {};
    try {
      params = JSON.parse(body.prompt || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, code: 'BAD_REQUEST', message: 'Invalid prompt JSON' }),
      };
    }

    const prompt = buildPrompt(params);
    const genAI = new GoogleGenerativeAI(API_KEY);

    let lastErr: any;
    let rawText = '';

    for (const modelName of MODELS) {
      try {
        console.log(JSON.stringify({ stage: 'gen_start', modelName }));
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await withRetry(
          () => withTimeout(
            model.generateContent({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.9,
                maxOutputTokens: 2048,
              },
            }),
            23000 // cortamos a 23s
          ),
          3,
          500
        );

        const text = typeof result.response?.text === 'function'
          ? result.response.text()
          : (result.response as any)?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        rawText = (text || '').trim();
        if (rawText) break; // éxito → salir
      } catch (e: any) {
        lastErr = e;
        const status = Number(e?.status || e?.code);
        console.error(JSON.stringify({ stage: 'gen_error', modelName, status, message: e?.message }));
        if (![429, 500, 502, 503, 504].includes(status)) break;
      }
    }

    if (!rawText) {
      const status = Number(lastErr?.status || lastErr?.code || 503);
      return {
        statusCode: [400, 401, 403, 404, 413].includes(status) ? status : 503,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          code: 'MODEL_UNAVAILABLE',
          message: 'El modelo está saturado. Intenta de nuevo en unos segundos.',
        }),
      };
    }

    // Limpiar y parsear JSON
    let parsed: any;
    try {
      const clean = rawText.replace(/^```json\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, code: 'BAD_MODEL_OUTPUT', message: 'Invalid JSON from model' }),
      };
    }

    // Validación mínima
    if (typeof parsed.story !== 'string' || !Array.isArray(parsed.quiz) || !Array.isArray(parsed.vocabulary)) {
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, code: 'BAD_MODEL_OUTPUT', message: 'Missing required fields' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify(parsed),
    };

  } catch (err: any) {
    console.error('generate.ts fatal:', err?.message || err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, code: 'SERVER_ERROR', message: err?.message || 'Unknown error' }),
    };
  }
};
