export const B2_EXERCISES = 5;
export const C1_EXERCISES = 7;

export type LevelBand = 'B1' | 'B2' | 'C1';

export type LevelAttempt = {
  level: string;
  score: number;
  total: number;
  mode?: string | null;
};

export type LevelAccess = {
  b2: boolean;
  c1: boolean;
  b1Passes: number;
  b2Passes: number;
  /** Open because this account already used the level, not because the new count is met. */
  b2Kept: boolean;
  c1Kept: boolean;
};

/** Saved lesson labels the app already stores. Blank or unknown levels are not treated as B1. */
export function storedLevel(level: string | null | undefined): LevelBand | null {
  const key = String(level ?? '').trim().toUpperCase();
  if (key === 'C1' || key === 'C2' || key === 'ADVANCED') return 'C1';
  if (key === 'B2' || key === 'INTERMEDIATE') return 'B2';
  if (key === 'B1' || key === 'A1' || key === 'A2' || key === 'BEGINNER') return 'B1';
  return null;
}

function passed(attempt: LevelAttempt, level: LevelBand): boolean {
  if (attempt.total <= 0 || attempt.score < 0 || attempt.score > attempt.total) return false;
  if (attempt.mode && attempt.mode !== 'reading' && attempt.mode !== 'listening' && attempt.mode !== 'grammar') return false;
  if (storedLevel(attempt.level) !== level) return false;
  return attempt.score / attempt.total >= 0.8;
}

/**
 * Everyone starts at B1. B2 opens only after 5 B1 exercises at 80% or more.
 * C1 opens only after 7 B2 exercises at 80% or more.
 * A profile level or an old result does not open a level by itself.
 */
export function levelAccess(_profileLevel: string | null | undefined, attempts: readonly LevelAttempt[]): LevelAccess {
  const b1Passes = attempts.filter((attempt) => passed(attempt, 'B1')).length;
  const b2Passes = attempts.filter((attempt) => passed(attempt, 'B2')).length;
  return {
    b2: b1Passes >= B2_EXERCISES,
    c1: b2Passes >= C1_EXERCISES,
    b1Passes,
    b2Passes,
    b2Kept: false,
    c1Kept: false,
  };
}

export function levelRuleText(access: Pick<LevelAccess, 'b1Passes' | 'b2Passes'> | null): string {
  const b1 = access?.b1Passes ?? 0;
  const b2 = access?.b2Passes ?? 0;
  return `Everyone starts at B1. B2 opens after any 5 B1 exercises at 80% or more (${b1}/5). C1 opens after any 7 B2 exercises at 80% or more (${b2}/7). This is practice, not a certificate.`;
}
