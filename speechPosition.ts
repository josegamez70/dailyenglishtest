/** Where to restart speech after a pause, using the estimated timeline. */
export function resumeWordIndex(words: string[], elapsedMs: number, durationMs: number): number {
  if (words.length === 0) return 0;
  if (!(durationMs > 0) || elapsedMs <= 0) return 0;
  const fraction = Math.min(1, elapsedMs / durationMs);
  const index = Math.min(words.length - 1, Math.floor(fraction * words.length));
  let start = 0;
  for (let i = 0; i < index; i++) {
    if (/[.!?]["')\]]*$/.test(words[i])) start = i + 1;
  }
  if (start >= words.length) return words.length - 1;
  return start;
}

export function textFromWordIndex(words: string[], wordIndex: number): string {
  if (words.length === 0) return '';
  const start = Math.max(0, Math.min(wordIndex, words.length));
  return words.slice(start).join(' ');
}
