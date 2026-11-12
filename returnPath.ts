/** App pages a sign-in link may return to. The home page is not stored. */
export const APP_RETURN_PATHS = new Set([
  '/task-packs',
  '/tasks',
  '/grammar',
  '/saved',
  '/progress',
  '/profile',
  '/academy',
  '/join',
]);

/** The magic-link target is the page the person already opened. */
export function signInReturnUrl(location: { origin: string; pathname: string; search: string }): string {
  return `${location.origin}${location.pathname}${location.search}`;
}

/** After sign-in, open the stored page when this tab landed somewhere else. */
export function returnPathAfterSignIn(stored: string | null, current: string): string | null {
  if (!stored || !APP_RETURN_PATHS.has(stored) || stored === current) return null;
  return stored;
}
