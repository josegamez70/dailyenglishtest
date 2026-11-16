export type ThemeChoice = 'light' | 'dark' | 'system' | 'retro95';

export function isThemeChoice(value: string | null | undefined): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system' || value === 'retro95';
}

/** Retro 95 is its own look. System is the only choice that follows the device. */
export function isDarkTheme(choice: ThemeChoice, systemDark: boolean): boolean {
  return choice === 'dark' || (choice === 'system' && systemDark);
}
