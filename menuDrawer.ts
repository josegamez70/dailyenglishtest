/** A tap on the dimmed page, or the Escape key, closes the phone menu. */
export function drawerCloseReason(input: { key?: string; outside: boolean }): 'backdrop' | 'escape' | null {
  if (input.key === 'Escape') return 'escape';
  if (input.outside) return 'backdrop';
  return null;
}
