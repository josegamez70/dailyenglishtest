/** Free-tier model used once when the primary model is overloaded or times out. */
export const OVERLOAD_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

/** A model call shorter than this cannot finish before the function deadline. */
export const MIN_MODEL_TIMEOUT_MS = 4000;

/**
 * Time kept back after the last primary so a fast 503 still has a fallback turn.
 * The next primary must not be given the rest of the window.
 */
export const FALLBACK_RESERVE_MS = 8000;

export type ModelAttemptFailure = { status: number; message: string; model?: string };

export function isOverloadStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 504;
}

/** One fallback model, and only if this attempt has not already called it. */
export function overloadFallbackModel(triedModels: string[]): string | null {
  if (triedModels.includes(OVERLOAD_FALLBACK_MODEL)) return null;
  return OVERLOAD_FALLBACK_MODEL;
}

/** HTTP status from the SDK error, or from a message such as "[503 Service Unavailable]". */
export function readHttpStatus(error: unknown): number {
  const record = error as { status?: unknown; code?: unknown } | null;
  const raw = record ? (record.status ?? record.code) : 0;
  const direct = typeof raw === 'number'
    ? raw
    : typeof raw === 'string' && /^\d{3}$/.test(raw)
      ? Number(raw)
      : 0;
  if (Number.isFinite(direct) && direct >= 100) return direct;
  const message = error instanceof Error ? error.message : String(error ?? '');
  const bracket = message.match(/\[(\d{3})\b/);
  if (bracket) return Number(bracket[1]);
  const overload = message.match(/\b(429|503|504)\b/);
  if (overload) return Number(overload[1]);
  return 0;
}

export function primaryAttemptTimeout(remainingMs: number, laterCount: number, previousWasOverload: boolean): number {
  if (laterCount > 0) return Math.min(16000, remainingMs - 7000);
  if (previousWasOverload) return Math.min(12000, remainingMs - FALLBACK_RESERVE_MS);
  return Math.min(20000, remainingMs - 800);
}

export function fallbackAttemptTimeout(remainingMs: number): number {
  return Math.min(12000, remainingMs - 800);
}

export type ModelLoopHooks = {
  deadline: number;
  now?: () => number;
  models: string[];
  isUnavailable?: (model: string) => boolean;
  markUnavailable?: (model: string) => void;
  /** thinking true applies the model's low-thinking setting. A 400 retry passes false. */
  call: (model: string, timeoutMs: number, thinking: boolean) => Promise<string>;
  scrub?: (message: string) => string;
  log?: (entry: Record<string, unknown>) => void;
  onPrimarySuccess?: (model: string) => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

/**
 * Try the primary models, then one free-tier fallback on 429, 503, or 504.
 * A slow last primary cannot use the time reserved for that fallback.
 */
export async function runModelLoop(hooks: ModelLoopHooks): Promise<string> {
  const now = hooks.now ?? (() => Date.now());
  const isUnavailable = hooks.isUnavailable ?? (() => false);
  const markUnavailable = hooks.markUnavailable ?? (() => {});
  const scrub = hooks.scrub ?? ((message: string) => message);
  const log = hooks.log ?? (() => {});
  let lastError: unknown;
  let lastModel = '';
  let previousWasOverload = false;
  const attempts: ModelAttemptFailure[] = [];

  const describe = (error: unknown, model?: string): ModelAttemptFailure => ({
    status: readHttpStatus(error),
    message: scrub(errorMessage(error)),
    model,
  });

  const note = (error: unknown, modelName: string) => {
    lastError = error;
    lastModel = modelName;
    const failure = describe(error, modelName);
    attempts.push(failure);
    log({ stage: 'gen_error', modelName, status: failure.status, message: failure.message });
    return { status: failure.status, message: errorMessage(error) };
  };

  const models = hooks.models;
  for (let index = 0; index < models.length; index += 1) {
    const modelName = models[index];
    if (isUnavailable(modelName)) continue;
    const remaining = hooks.deadline - now();
    const laterCount = models.slice(index + 1).filter((name) => !isUnavailable(name)).length;
    const timeout = primaryAttemptTimeout(remaining, laterCount, previousWasOverload);
    if (timeout < MIN_MODEL_TIMEOUT_MS) break;
    try {
      log({ stage: 'gen_start', modelName, timeout });
      const text = await hooks.call(modelName, timeout, true);
      if (text) {
        hooks.onPrimarySuccess?.(modelName);
        return text;
      }
    } catch (error) {
      const noted = note(error, modelName);
      if (noted.status === 404) markUnavailable(modelName);
      const laterNames = models.slice(index + 1).filter((name) => !isUnavailable(name));
      const laterModel = laterNames.length > 0;
      const timeLeft = hooks.deadline - now();
      const dailyQuota = /per day|retry in \d+h/i.test(noted.message);
      if (isOverloadStatus(noted.status) && !dailyQuota) {
        const fallbackMs = fallbackAttemptTimeout(timeLeft);
        const nextLater = Math.max(0, laterNames.length - 1);
        const nextTimeout = laterModel ? primaryAttemptTimeout(timeLeft, nextLater, true) : 0;
        if (!laterModel && timeLeft > MIN_MODEL_TIMEOUT_MS) break;
        if (laterModel && nextTimeout < MIN_MODEL_TIMEOUT_MS && fallbackMs >= MIN_MODEL_TIMEOUT_MS) break;
      }
      if (noted.status === 400 && /invalid argument/i.test(noted.message) && timeLeft > 8000) {
        const retryTimeout = laterModel
          ? Math.min(16000, timeLeft - 8000)
          : Math.min(24000, timeLeft - 700);
        if (retryTimeout >= MIN_MODEL_TIMEOUT_MS) {
          try {
            const text = await hooks.call(modelName, retryTimeout, false);
            if (text) {
              hooks.onPrimarySuccess?.(modelName);
              return text;
            }
          } catch (thinkingError) {
            note(thinkingError, modelName);
          }
        }
      }
      if (![404, 400, 429, 500, 502, 503, 504].includes(noted.status) && noted.status) break;
      previousWasOverload = isOverloadStatus(noted.status);
    }
  }

  const upstream = describe(lastError, lastModel);
  const fallback = isOverloadStatus(upstream.status)
    ? overloadFallbackModel(attempts.map((attempt) => attempt.model ?? ''))
    : null;
  const fallbackTimeout = fallbackAttemptTimeout(hooks.deadline - now());
  if (fallback && !isUnavailable(fallback) && fallbackTimeout >= MIN_MODEL_TIMEOUT_MS) {
    try {
      log({ stage: 'gen_fallback', modelName: fallback, timeout: fallbackTimeout });
      const text = await hooks.call(fallback, fallbackTimeout, true);
      if (text) return text;
    } catch (error) {
      const noted = note(error, fallback);
      if (noted.status === 404) markUnavailable(fallback);
      if (noted.status === 400 && /invalid argument/i.test(noted.message) && hooks.deadline - now() > 5000) {
        const retryTimeout = Math.min(10000, hooks.deadline - now() - 800);
        if (retryTimeout >= MIN_MODEL_TIMEOUT_MS) {
          try {
            const text = await hooks.call(fallback, retryTimeout, false);
            if (text) return text;
          } catch (retryError) {
            note(retryError, fallback);
          }
        }
      }
    }
  }

  const busy = upstream.status === 429 || upstream.status === 503;
  const timedOut = upstream.status === 504;
  throw Object.assign(
    new Error(
      busy
        ? 'The story service is busy. Please try again.'
        : timedOut
          ? 'The story service took too long. Please try again.'
          : 'The lesson could not be created. Please try again.'
    ),
    { status: busy || timedOut ? upstream.status : 502, upstream, attempts },
  );
}
