/**
 * A public @ the learner chose. It is not the display name.
 * 3 to 24 letters, numbers, or underscores. An email never qualifies.
 */
export function usernameToken(input: string): string {
  const raw = input.trim().replace(/^@+/, '');
  if (!/^[\p{L}\p{N}_]{3,24}$/u.test(raw)) return '';
  return raw;
}

export function profileHandle(value: string): string {
  const token = usernameToken(value);
  return token ? `@${token}` : '';
}

export function usernameFormatError(input: string): string | null {
  if (!input.trim()) return 'Choose a username.';
  if (!usernameToken(input)) return 'Use 3 to 24 letters, numbers, or underscores.';
  return null;
}
