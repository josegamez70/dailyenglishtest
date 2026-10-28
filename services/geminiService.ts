import type { ConfigOptions, QuizQuestion, VocabularyItem } from '../types';
import { normalizeQuiz } from '../quizNormalize';
import { parseDialogue, renderDialogue, type DialogueTurn } from '../dialogue';

type GenResponse = {
  story?: string;
  quiz?: unknown[];
  vocabulary?: { word?: string; definition?: string }[];
  dialogue?: unknown;
  resolvedTopic?: string;
  ok?: boolean;
  message?: string;
};

const API_URL = '/api/generate';

class TimeoutError extends Error {
  constructor() {
    super('The request took too long. Please try again.');
    this.name = 'TimeoutError';
  }
}

async function fetchWithTimeout(
  resource: RequestInfo,
  init: RequestInit,
  ms: number,
  external?: AbortSignal
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onAbort);
  }
  try {
    return await fetch(resource, { ...init, signal: controller.signal });
  } catch (error) {
    if (external?.aborted) {
      const abortError = new Error('Cancelled');
      abortError.name = 'AbortError';
      throw abortError;
    }
    if (error instanceof Error && error.name === 'AbortError') throw new TimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  }
}

async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
  external?: AbortSignal,
  tries = 2
) {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchWithTimeout(input, init, 28000, external);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let message = text || `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(text) as { message?: string };
          if (parsed?.message) message = String(parsed.message);
        } catch {
          /* keep the raw text */
        }
        const error = new Error(message);
        (error as Error & { status?: number }).status = res.status;
        throw error;
      }
      return res;
    } catch (error) {
      lastErr = error;
      if (external?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
      const status = Number((error as { status?: number })?.status || 0);
      const retryable =
        (error instanceof Error && error.name === 'TimeoutError') ||
        [429, 502, 503, 504].includes(status);
      if (!retryable || i === tries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 600 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function generateStoryAndQuiz(
  config: ConfigOptions,
  options?: { signal?: AbortSignal }
): Promise<{
  story: string;
  quiz: QuizQuestion[];
  vocabulary: VocabularyItem[];
  dialogue: DialogueTurn[];
  resolvedTopic?: string;
}> {
  const payload = {
    prompt: JSON.stringify({
      level: config.level,
      topic: config.topic,
      wordCount: config.wordCount,
      questionCount: config.questionCount,
      vocabularyCount: 8,
      mode: config.practiceType === 'listening' ? 'listening' : 'reading',
      format: config.format === 'dialogue' ? 'dialogue' : 'text',
    }),
  };

  const res = await fetchWithRetry(
    API_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    options?.signal
  );

  const raw = await res.text();
  const clean = raw.replace(/^```json\s*|\s*```$/g, '').trim();

  let data: GenResponse;
  try {
    data = JSON.parse(clean);
  } catch {
    throw new Error('The lesson could not be read. Please try again.');
  }

  if (data?.ok === false) {
    throw new Error(data.message || 'The lesson could not be created. Please try again.');
  }

  if (!data || typeof data.story !== 'string' || !Array.isArray(data.quiz) || !Array.isArray(data.vocabulary)) {
    throw new Error('The lesson was incomplete. Please try again.');
  }

  const quiz = normalizeQuiz(data.quiz).filter((question) => question.question && question.options.length > 0);
  const vocabulary = data.vocabulary
    .map((item) => ({
      word: String(item?.word ?? '').trim(),
      definition: String(item?.definition ?? '').trim(),
    }))
    .filter((item) => item.word && item.definition);

  const format = config.format === 'dialogue' ? 'dialogue' : 'text';
  let story = data.story.trim();
  let dialogue = format === 'dialogue' ? parseDialogue(data.dialogue) : [];
  if (format === 'dialogue' && dialogue.length === 0) dialogue = parseDialogue(story);
  if (dialogue.length) story = renderDialogue(dialogue);

  return {
    story,
    quiz,
    vocabulary,
    dialogue,
    resolvedTopic: data.resolvedTopic ? String(data.resolvedTopic) : undefined,
  };
}
