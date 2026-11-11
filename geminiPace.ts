import { readHttpStatus } from './modelFallback.ts';

/** Minimum time between Gemini calls in the bank job. 5s is 12 requests per minute. */
export const GEMINI_GAP_DEFAULT_MS = 5000;
export const GEMINI_GAP_MAX_MS = 60_000;
/** Same-cell waits after a 429 or 503. Jitter is added on top. */
export const GEMINI_BACKOFF_MS = [5_000, 10_000, 20_000, 40_000] as const;

const MODEL_NAME = /^[a-z0-9][a-z0-9._-]{0,80}$/;

let pace: (() => Promise<void>) | null = null;
let modelOverride: string | null = null;

/** Bank-only. Live lesson requests leave these unset. */
export function setExerciseBankGemini(options: { pace: (() => Promise<void>) | null; model: string | null }): void {
  pace = options.pace;
  modelOverride = options.model;
}

export function clearExerciseBankGemini(): void {
  pace = null;
  modelOverride = null;
}

export function exerciseBankGeminiPace(): (() => Promise<void>) | null {
  return pace;
}

/** Null means the bank uses the same model list as a live lesson. */
export function exerciseBankGeminiModel(): string | null {
  return modelOverride;
}

export class RefillPause extends Error {
  readonly refillPause = true;

  constructor() {
    super('refill_pause');
    this.name = 'RefillPause';
  }
}

export function isRefillPause(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { refillPause?: boolean }).refillPause === true);
}

export function readGeminiGapMs(raw: string | undefined): number {
  const text = raw?.trim() ?? '';
  if (!text) return GEMINI_GAP_DEFAULT_MS;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || value > GEMINI_GAP_MAX_MS) return GEMINI_GAP_DEFAULT_MS;
  return value;
}

/** Empty or invalid keeps the live model list. */
export function readBankGeminiModel(raw: string | undefined): string | null {
  const text = raw?.trim() ?? '';
  if (!text || !MODEL_NAME.test(text)) return null;
  return text;
}

export function geminiGapWaitMs(lastAt: number, now: number, gapMs: number): number {
  if (gapMs <= 0 || lastAt <= 0) return 0;
  return Math.max(0, lastAt + gapMs - now);
}

export function geminiIsDailyQuota(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /per day|retry in \d+\s*h/i.test(message);
}

export function geminiIsBusy(error: unknown): boolean {
  if (geminiIsDailyQuota(error)) return false;
  const status = readHttpStatus(error);
  if (status === 429 || status === 503) return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /resource_exhausted|resource has been exhausted|too many requests|rate limit|story service is busy/i.test(message);
}

function secondsFrom(value: string): number | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)s?$/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
}

/** Server hint from Retry-After, retryDelay, or "retry in 12s". */
export function geminiRetryDelayMs(error: unknown): number | null {
  const seen = new Set<unknown>();
  const walk = (value: unknown): number | null => {
    if (value == null || seen.has(value)) return null;
    if (typeof value === 'string') {
      const delay = value.match(/retryDelay["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)s/i)
        || value.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
      if (delay) return Math.round(Number(delay[1]) * 1000);
      return null;
    }
    if (typeof value !== 'object') return null;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (typeof record.retryDelay === 'string' || typeof record.retryDelay === 'number') {
      const parsed = typeof record.retryDelay === 'number'
        ? Math.round(record.retryDelay * 1000)
        : secondsFrom(record.retryDelay);
      if (parsed != null) return parsed;
    }
    const header = record['retry-after'] ?? record.retryAfter;
    if (typeof header === 'string' || typeof header === 'number') {
      const parsed = secondsFrom(String(header));
      if (parsed != null) return parsed;
    }
    for (const child of Object.values(record)) {
      const found = walk(child);
      if (found != null) return found;
    }
    return null;
  };
  return walk(error);
}

export function geminiBackoffMs(attemptIndex: number, retryAfterMs: number | null, random: () => number = Math.random): number {
  const base = GEMINI_BACKOFF_MS[Math.min(Math.max(0, attemptIndex), GEMINI_BACKOFF_MS.length - 1)];
  const honored = retryAfterMs != null && retryAfterMs > base ? retryAfterMs : base;
  const jitter = Math.round(Math.min(1, Math.max(0, random())) * 1000);
  return honored + jitter;
}

export function geminiProblemText(error: unknown): string {
  const status = readHttpStatus(error);
  const upstream = (error as { upstream?: { message?: string; status?: number } } | null)?.upstream;
  const raw = upstream?.message || (error instanceof Error ? error.message : String(error ?? ''));
  const clean = raw
    .replace(/AIza[\w-]{10,}/g, 'REDACTED')
    .replace(/key=[^&\s"]+/gi, 'key=REDACTED')
    .replace(/\s+/g, ' ')
    .trim();
  const code = status || upstream?.status || 0;
  return (code ? `${code} ${clean}` : clean).slice(0, 500);
}

/**
 * Runs one Gemini step. A 429 or 503 waits and tries the same step again.
 * A daily quota, or the last backoff, throws the original error.
 * Not enough time left throws RefillPause so the hop can chain.
 */
export async function retryWhileBusy<T>(input: {
  run: () => Promise<T>;
  deadline: number;
  reserveMs: number;
  sleep: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  onBusy: (info: { waitMs: number; detail: string }) => Promise<void>;
}): Promise<T> {
  const now = input.now ?? (() => Date.now());
  const random = input.random ?? Math.random;
  for (let attempt = 0; attempt <= GEMINI_BACKOFF_MS.length; attempt += 1) {
    try {
      return await input.run();
    } catch (error) {
      if (isRefillPause(error)) throw error;
      const last = attempt === GEMINI_BACKOFF_MS.length;
      if (!geminiIsBusy(error) || geminiIsDailyQuota(error) || last) throw error;
      const waitMs = geminiBackoffMs(attempt, geminiRetryDelayMs(error), random);
      if (now() + waitMs + input.reserveMs > input.deadline) throw new RefillPause();
      await input.onBusy({ waitMs, detail: geminiProblemText(error) });
      await input.sleep(waitMs);
    }
  }
  throw new Error('gemini retry ended');
}
