// api/generate.ts
import type { Handler } from '@netlify/functions';
import { GoogleGenerativeAI } from '@google/generative-ai';

/* ===================== Utils ===================== */

type GenResponse = {
  story: string;
  quiz: { question: string; options: string[]; correctAnswer: string }[];
  vocabulary: { word: string; definition: string }[];
};

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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/* ============== Prompt builder (texto) ============== */

function buildPrompt(opts: {
  level?: string;
  topic?: string;
  wordCount?: number;      // 100 | 150 | 200
  questionCount?: number;  // p.ej. 6
  vocabularyCount?: number;// p.ej. 8
  mode?: 'reading' | 'listening';
}) {
  const {
    level = 'Beginner',
    topic = 'daily life',
    wordCount = 150,
    questionCount = 6,
    vocabularyCount = 8,
    mode = 'reading'
  } = opts || {};

  // Reforzamos límites por si algo llega raro
  const wcTarget = clamp(wordCount, 80, 300);
  const qCount = clamp(questionCount, 1, 20);
  const vCount = clamp(vocabularyCount, 1, 30);

  return `
You are an English learning assistant. Create content for ${mode} comprehension at level ${level}.
Topic: "${topic}"

Return ONLY strict JSON with this shape (no markdown, no extra text):
{
  "story": "string (~${wcTarget} words, natural English, 1-3 short paragraphs)",
  "quiz": [
    { "question": "string", "options": ["A","B","C","D"], "correctAnswer": "A" }
    // exactly ${qCount} items
  ],
  "vocabulary": [
    { "word": "string", "definition": "English explanation, short" }
    // exactly ${vCount} items
  ]
}

Rules:
- Story should be ~${wcTarget} words. Keep language consistent with ${level}.
- Quiz: multiple-choice with 4 options each; ensure exactly ${qCount} questions and one correctAnswer matching an option.
- Vocabulary: ${vCount} useful words/phrases from the story (no duplicates), with concise definitions in English.
- Output must be valid minified JSON. Do NOT include backticks, markdown, or explanations.
`.trim();
}

/* ============== Model helpers ============== */

const MODELS = [
  'gemini-2.0-flash',  // rápido (preferido)
  'gemini-1.5-flash',  // fallback 1
  'gemini-1.5-pro'     // fallback 2 (si está habilitado)
];

function pickApiKey() {
  // Aceptamos varias claves por compatibilidad
  return process.env.API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.VITE_API_KEY
    || process.env.GENAI_API_KEY;
}

/* ===================== Handler ===================== */

export const handler: Handler = async (event) => {
  try {
    const API_KEY = pickApiKey();
    if (!API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, code: 'NO_API_KEY', message: 'Missing API key' }),
      };
    }

    // CORS básico (por si llamas desde otro host)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    const body = JSON.parse(event.body || '{}');
    const promptStr = body.prompt || '{}';

    // Los parámetros llegan como string JSON desde el front
    let params: {
      level?: string;
      topic?: string;
      wordCount?: number;
      questionCount?: number;
      vocabularyCount?: number;
      mode?: 'reading' | 'listening';
    };
    try {
      params = JSON.parse(promptStr);
    } catch {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, code: 'BAD_REQUEST', message: 'Invalid prompt JSON' }),
      };
    }

    // Valores por defecto “seguros”
    const level = params.level || 'Beginner';
    const topic = params.topic || 'daily life';
    const wordCount = clamp(Number(params.wordCount || 150), 80, 300);
    const questionCount = clamp(Number(params.questionCount || 6), 1, 20);
    const vocabularyCount = clamp(Number(params.vocabularyCount || 8), 1, 30);
    const mode = params.mode || 'reading';

    const prompt = buildPrompt({ level, topic, wordCount, questionCount, vocabularyCount, mode });

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
            23000 // corta antes del timeout de Netlify
          ),
          3,
          500
        );

        const text = typeof result.response?.text === 'function'
          ? result.response.text()
          : (result.response as any)?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        rawText = (text || '').trim();
        if (rawText) break; // éxito → salimos
      } catch (e: any) {
        lastErr = e;
        const status = Number(e?.status || e?.code);
        console.error(JSON.stringify({ stage: 'gen_error', modelName, status, message: e?.message }));
        // sólo seguimos probando en casos transitorios
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

    // Intentamos parsear el JSON del modelo
    let parsed: GenResponse;
    try {
      // limpia envoltorios tipo ```json ... ```
      const clean = rawText.replace(/^```json\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(clean) as GenResponse;
    } catch (e: any) {
      console.error(JSON.stringify({ stage: 'parse_error', message: e?.message, sample: rawText.slice(0, 160) }));
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, code: 'BAD_MODEL_OUTPUT', message: 'Invalid JSON from model' }),
      };
    }

    // Normalización/correcciones
    if (typeof parsed.story !== 'string') parsed.story = '';
    if (!Array.isArray(parsed.quiz)) parsed.quiz = [];
    if (!Array.isArray(parsed.vocabulary)) parsed.vocabulary = [];

    // recortes superiores
    if (parsed.quiz.length > questionCount) parsed.quiz = parsed.quiz.slice(0, questionCount);
    if (parsed.vocabulary.length > vocabularyCount) parsed.vocabulary = parsed.vocabulary.slice(0, vocabularyCount);

    // asegura longitudes mínimas si vinieron menos (no inventamos; devolvemos tal cual)
    // recorte fino de palabras de story (si se pasó)
    const maxWords = clamp(wordCount + Math.ceil(wordCount * 0.12), 50, 400); // tolerancia ~12%
    if (wc(parsed.story) > maxWords) {
      parsed.story = trimTo(parsed.story, maxWords);
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
      body: JSON.stringify({ ok: false, code: 'SERVER_ERROR', message: err?.message || 'Unknown error' }),
    };
  }
};
