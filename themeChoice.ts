export type ThemeChoice = 'light' | 'dark' | 'system' | 'retro95';

/** Bump this to put everyone back on Retro 95 once. Later choices stay saved. */
export const THEME_PREF_VERSION = 2;
export const THEME_STORAGE_KEY = 'theme';
export const THEME_VERSION_KEY = 'theme-pref-version';

export function isThemeChoice(value: string | null | undefined): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system' || value === 'retro95';
}

export function themeEpochKey(userId: string): string {
  return `theme-epoch-${userId}`;
}

/** Missing storage, or a copy from before this version, opens Retro 95. */
export function resolveThemeBoot(input: { version: number; stored: string | null }): ThemeChoice {
  if (input.version < THEME_PREF_VERSION) return 'retro95';
  return isThemeChoice(input.stored) ? input.stored : 'retro95';
}

/** Read the skin and, on the first visit of this version, store Retro 95. */
export function readThemeBoot(): ThemeChoice {
  try {
    const version = Number(localStorage.getItem(THEME_VERSION_KEY) || '0');
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const choice = resolveThemeBoot({ version, stored });
    if (version < THEME_PREF_VERSION) {
      localStorage.setItem(THEME_VERSION_KEY, String(THEME_PREF_VERSION));
      localStorage.setItem(THEME_STORAGE_KEY, 'retro95');
    }
    return choice;
  } catch {
    return 'retro95';
  }
}

export function userNeedsRetroReset(userId: string): boolean {
  try {
    return Number(localStorage.getItem(themeEpochKey(userId)) || '0') < THEME_PREF_VERSION;
  } catch {
    return false;
  }
}

export function markThemeEpoch(userId: string): void {
  try {
    localStorage.setItem(themeEpochKey(userId), String(THEME_PREF_VERSION));
  } catch {
    /* storage can be blocked */
  }
}

/** Retro 95 is its own look. System is the only choice that follows the device. */
export function isDarkTheme(choice: ThemeChoice, systemDark: boolean): boolean {
  return choice === 'dark' || (choice === 'system' && systemDark);
}
