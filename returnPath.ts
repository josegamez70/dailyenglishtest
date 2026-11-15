/** App pages a sign-in link may return to. The home page is not stored. */
export const APP_RETURN_PATHS = new Set([
  '/task-packs',
  '/tasks',
  '/grammar',
  '/saved',
  '/vocabulary',
  '/progress',
  '/profile',
  '/academy',
  '/join',
]);

/** The magic-link target is the page the person already opened. */
export function signInReturnUrl(location: { origin: string; pathname: string; search: string }): string {
  return `${location.origin}${location.pathname}${location.search}`;
}

const TASK_PACK_PATH = /^\/task-packs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function taskPackIdFromPath(path: string): string | null {
  const clean = path.replace(/\/+$/, '') || '/';
  return clean.match(TASK_PACK_PATH)?.[1] ?? null;
}

export function isTaskPacksPath(path: string): boolean {
  const clean = path.replace(/\/+$/, '') || '/';
  return clean === '/task-packs' || taskPackIdFromPath(clean) !== null;
}

export function isAppReturnPath(path: string): boolean {
  const clean = path.replace(/\/+$/, '') || '/';
  return APP_RETURN_PATHS.has(clean) || taskPackIdFromPath(clean) !== null;
}

/** After sign-in, open the stored page when this tab landed somewhere else. */
export function returnPathAfterSignIn(stored: string | null, current: string): string | null {
  if (!stored || !isAppReturnPath(stored) || stored === current) return null;
  return stored;
}
