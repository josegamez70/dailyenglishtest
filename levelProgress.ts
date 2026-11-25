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
 * B1 is always open. B2 needs 5 B1 exercises at 80% or better. C1 needs 7 B2 exercises at 80% or better.
 * The same counts are reserved for the DET-25 level badges. A profile or a saved result at B2 or C1 keeps that level open.
 */
export function levelAccess(profileLevel: string | null | undefined, attempts: readonly LevelAttempt[]): LevelAccess {
  const profile = storedLevel(profileLevel) ?? 'B1';
  const used = new Set(attempts.map((attempt) => storedLevel(attempt.level)).filter((level): level is LevelBand => level != null));
  const b1Passes = attempts.filter((attempt) => passed(attempt, 'B1')).length;
  const b2Passes = attempts.filter((attempt) => passed(attempt, 'B2')).length;
  const b2Earned = b1Passes >= B2_EXERCISES;
  const c1Earned = b2Passes >= C1_EXERCISES;
  const b2Kept = !b2Earned && (profile === 'B2' || profile === 'C1' || used.has('B2') || used.has('C1'));
  const c1Kept = !c1Earned && (profile === 'C1' || used.has('C1'));
  return {
    b2: b2Earned || b2Kept,
    c1: c1Earned || c1Kept,
    b1Passes,
    b2Passes,
    b2Kept,
    c1Kept,
  };
}
