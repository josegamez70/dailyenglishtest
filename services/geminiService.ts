import type { ConfigOptions, QuizQuestion, VocabularyItem } from '../types';

type GenResponse = {
  story: string;
  quiz: { question: string; options: string[]; correctAnswer: string }[];
  vocabulary: { word: string; definition: string }[];
};

const API_URL = '/api/generate';

// --- Timeout helper ---
function fetchWithTimeout(resource: RequestInfo, options: RequestInit = {}, ms = 25000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(resource, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

// --- Reintentos básicos (la API ya reintenta en backend, aquí es backup) ---
async function fetchWithRetry(input: RequestInfo, init: RequestInit, tries = 2) {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchWithTimeout(input, init, 25000);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const e = new Error(text || `HTTP ${res.status}`);
        (e as any).status = res.status;
        throw e;
      }
      return res;
    } catch (e: any) {
      lastErr = e;
      const status = Number(e?.status || 0);
      const retryable =
        e?.name === 'AbortError' ||
        [429, 502, 503, 504].includes(status) ||
        /temporarily|overloaded|try again/i.test(e?.message || '');
      if (!retryable || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function generateStoryAndQuiz(
  config: ConfigOptions
): Promise<{ story: string; quiz: QuizQuestion[]; vocabulary: VocabularyItem[] }> {
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

  const raw = await res.text();
  const clean = raw.replace(/^```json\s*|\s*```$/g, '').trim();

  let data: GenResponse;
  try {
    data = JSON.parse(clean);
  } catch {
    throw new Error('BAD_MODEL_OUTPUT: invalid JSON from server');
  }

  if (
    !data ||
    typeof data.story !== 'string' ||
    !Array.isArray(data.quiz) ||
    !Array.isArray(data.vocabulary)
  ) {
    throw new Error('BAD_MODEL_OUTPUT: missing fields');
  }

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
