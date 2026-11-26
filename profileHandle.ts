/**
 * A public @ taken from the display name already stored on the profile.
 * There is no separate handle column, and this value is not unique.
 * An email, or a name with no letters or digits, does not become an @.
 */
export function profileHandle(displayName: string): string {
  const raw = displayName.trim().slice(0, 40);
  if (!raw || raw.includes('@')) return '';
  const token = raw.replace(/[^\p{L}\p{N}_]+/gu, '').slice(0, 24);
  if (!token) return '';
  return `@${token}`;
}
