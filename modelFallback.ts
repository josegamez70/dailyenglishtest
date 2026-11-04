/** Free-tier model used once when the primary model is overloaded or times out. */
export const OVERLOAD_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

export function isOverloadStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 504;
}

/** One fallback model, and only if this attempt has not already called it. */
export function overloadFallbackModel(triedModels: string[]): string | null {
  if (triedModels.includes(OVERLOAD_FALLBACK_MODEL)) return null;
  return OVERLOAD_FALLBACK_MODEL;
}
