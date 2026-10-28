/** Map a saved text-size index onto the current list. Extra large (old index 3) becomes Large. */
export function clampedFontStep(saved: number | null, stepCount: number): number {
  const fallback = Math.min(1, Math.max(0, stepCount - 1));
  if (saved == null || !Number.isInteger(saved) || saved < 0) return fallback;
  if (saved >= stepCount) return stepCount - 1;
  return saved;
}
