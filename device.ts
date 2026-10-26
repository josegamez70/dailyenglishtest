/** Android speechSynthesis boundary events are not reliable enough to highlight words. */
export function isAndroidUserAgent(userAgent: string): boolean {
  return /android/i.test(userAgent || '');
}
