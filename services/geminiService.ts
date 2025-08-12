// src/services/geminiService.ts
import type { ConfigOptions, QuizQuestion, VocabularyItem } from '../types';

type GenResponse = {
  story: string;
  quiz: { question: string; options: string[]; correctAnswer: string }[];
  vocabulary: { word: string; definition: string }[];
};

const API_URL = '/api/generate';

// --- Helper para reintentos con backoff ---
async function fetchWithRetry(input: RequestInfo, init: RequestInit, tries = 2) {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(input, init);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const msg = text || `HTTP ${res.status}`;
        const e = new Error(msg);
        (e as any).status = res.status;
        throw e;
      }
      return res;
    } catch (e: any) {
      lastErr = e;
      const status = Number(e?.status || 0);
      const retryable =
        [429, 502, 503, 504].includes(status) ||
        /temporarily|overloaded|try again/i.test(e?.message || '');
      if (!retryable || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1))); // backoff corto
    }
  }
  throw lastErr;
}

// --- Función principal ---
export async function generateStoryAndQuiz(
  config: ConfigOptions
): Promise<{
  story: string;
  quiz: QuizQuestion[];
  vocabulary: VocabularyItem[];
}> {
  const payload = {
    prompt: JSON.stringify({
      level: config.level,
      topic: config.topic,
      wordCount: config.wordCount,
      questionCount: config.questionCount,
      vocabularyCount: 8,
      mode: config.practiceType || 'reading',
    }),
  };

  const res = await fetchWithRetry(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  // Limpiar y parsear JSON
  const raw = await res.text();
  const clean = raw.replace(/^```json\s*|\s*```$/g, '').trim();

  let data: GenResponse;
  try {
    data = JSON.parse(clean);
  } catch (e) {
    throw new Error('BAD_MODEL_OUTPUT: invalid JSON from server');
  }

  // Validaciones mínimas
  if (
    !data ||
    typeof data.story !== 'string' ||
    !Array.isArray(data.quiz) ||
    !Array.isArray(data.vocabulary)
  ) {
    throw new Error('BAD_MODEL_OUTPUT: missing fields');
  }

  // Tipado seguro
  const story = data.story.trim();
  const quiz = data.quiz.map((q) => ({
    question: q.question,
    options: Array.isArray(q.options) ? q.options : [],
    correctAnswer: q.correctAnswer,
  }));
  const vocabulary = data.vocabulary.map((v) => ({
    word: v.word,
    definition: v.definition,
  }));

  return { story, quiz, vocabulary };
}
