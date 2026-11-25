import { madridDayKey, shiftMadridDay } from './tasks.ts';

export const VOCAB_ANSWERS = 4;
export const LISTENING_RUN = 5;
export const STREAK_DAYS = 3;

export const MILESTONES = [1, 5, 10, 25, 50] as const;

export type BadgeId =
  | 'exercises_1'
  | 'exercises_5'
  | 'exercises_10'
  | 'exercises_25'
  | 'exercises_50'
  | 'reading_1'
  | 'listening_1'
  | 'grammar_1'
  | 'vocab_4'
  | 'listening_5'
  | 'streak_3'
  | 'perfect_1';

export type BadgeKind = 'milestone' | 'practice' | 'level';

export type BadgeStats = {
  reading: number;
  listening: number;
  grammar: number;
  vocabAnswers: number;
  /** Exercises where every answer was correct. */
  perfect: number;
  /** Madrid calendar days that have a scored Reading, Listening, or Grammar exercise. */
  days: string[];
};

export type BadgeView = {
  id: BadgeId;
  kind: 'milestone' | 'practice';
  label: string;
  rule: string;
  detail: string;
  progress: string;
  unlocked: boolean;
  icon: string;
};

/** Reserved for DET-26. Not shown and not awarded. */
export const LEVEL_BADGE_PLAN = [
  {
    id: 'level_b2',
    kind: 'level' as const,
    level: 'B2' as const,
    rule: 'After DET-26: move from B1 to B2 once 5 exercises are at 80% or better.',
  },
  {
    id: 'level_c1',
    kind: 'level' as const,
    level: 'C1' as const,
    rule: 'After DET-26: move from B2 to C1 once 7 exercises are at 80% or better.',
  },
] as const;

type BadgeCopy = {
  kind: 'milestone' | 'practice';
  label: string;
  rule: string;
  icon: string;
  need: number;
};

const COPY: Record<BadgeId, BadgeCopy> = {
  exercises_1: {
    kind: 'milestone',
    label: '1 Exercise',
    rule: 'Finish 1 Reading, Listening, or Grammar exercise.',
    icon: '/badges/set/exercises_1.svg',
    need: 1,
  },
  exercises_5: {
    kind: 'milestone',
    label: '5 Exercises',
    rule: 'Finish 5 Reading, Listening, or Grammar exercises.',
    icon: '/badges/set/exercises_5.svg',
    need: 5,
  },
  exercises_10: {
    kind: 'milestone',
    label: '10 Exercises',
    rule: 'Finish 10 Reading, Listening, or Grammar exercises.',
    icon: '/badges/set/exercises_10.svg',
    need: 10,
  },
  exercises_25: {
    kind: 'milestone',
    label: '25 Exercises',
    rule: 'Finish 25 Reading, Listening, or Grammar exercises.',
    icon: '/badges/set/exercises_25.svg',
    need: 25,
  },
  exercises_50: {
    kind: 'milestone',
    label: '50 Exercises',
    rule: 'Finish 50 Reading, Listening, or Grammar exercises.',
    icon: '/badges/set/exercises_50.svg',
    need: 50,
  },
  reading_1: {
    kind: 'practice',
    label: 'Reading',
    rule: 'Finish 1 Reading exercise.',
    icon: '/badges/set/reading_1.svg',
    need: 1,
  },
  listening_1: {
    kind: 'practice',
    label: 'Listening',
    rule: 'Finish 1 Listening exercise.',
    icon: '/badges/set/listening_1.svg',
    need: 1,
  },
  grammar_1: {
    kind: 'practice',
    label: 'Grammar',
    rule: 'Finish 1 Grammar exercise.',
    icon: '/badges/set/grammar_1.svg',
    need: 1,
  },
  vocab_4: {
    kind: 'practice',
    label: 'Vocabulary',
    rule: 'Answer 4 Vocabulary quiz questions, the shortest quiz.',
    icon: '/badges/set/vocab_4.svg',
    need: VOCAB_ANSWERS,
  },
  listening_5: {
    kind: 'practice',
    label: 'Listening 5',
    rule: 'Finish 5 Listening exercises.',
    icon: '/badges/set/listening_5.svg',
    need: LISTENING_RUN,
  },
  streak_3: {
    kind: 'practice',
    label: '3-day streak',
    rule: 'Finish an exercise on 3 days in a row, using the date in Spain.',
    icon: '/badges/set/streak_3.svg',
    need: STREAK_DAYS,
  },
  perfect_1: {
    kind: 'practice',
    label: 'Perfect score',
    rule: 'Finish 1 exercise with every answer correct.',
    icon: '/badges/set/perfect_1.svg',
    need: 1,
  },
};

export const BADGE_ORDER: BadgeId[] = [
  'exercises_1',
  'exercises_5',
  'exercises_10',
  'exercises_25',
  'exercises_50',
  'reading_1',
  'listening_1',
  'grammar_1',
  'vocab_4',
  'listening_5',
  'streak_3',
  'perfect_1',
];

export function emptyBadgeStats(): BadgeStats {
  return { reading: 0, listening: 0, grammar: 0, vocabAnswers: 0, perfect: 0, days: [] };
}

export function exerciseCount(stats: BadgeStats): number {
  return stats.reading + stats.listening + stats.grammar;
}

/** Consecutive Madrid days with an exercise, counting today or ending yesterday. */
export function madridStreak(days: readonly string[], now = new Date()): number {
  const keys = new Set(days);
  const today = madridDayKey(now);
  const start = keys.has(today) ? today : keys.has(shiftMadridDay(today, -1)) ? shiftMadridDay(today, -1) : '';
  if (!start) return 0;
  let cursor = start;
  let count = 0;
  while (keys.has(cursor)) {
    count += 1;
    cursor = shiftMadridDay(cursor, -1);
  }
  return count;
}

function progressCount(id: BadgeId, stats: BadgeStats, now: Date): number {
  if (id.startsWith('exercises_')) return exerciseCount(stats);
  if (id === 'reading_1') return stats.reading;
  if (id === 'listening_1' || id === 'listening_5') return stats.listening;
  if (id === 'grammar_1') return stats.grammar;
  if (id === 'vocab_4') return stats.vocabAnswers;
  if (id === 'streak_3') return madridStreak(stats.days, now);
  return stats.perfect;
}

export function badgeUnlocked(id: BadgeId, stats: BadgeStats, now = new Date()): boolean {
  return progressCount(id, stats, now) >= COPY[id].need;
}

function progressLine(id: BadgeId, stats: BadgeStats, now: Date): string {
  const current = progressCount(id, stats, now);
  const need = COPY[id].need;
  if (id === 'streak_3') return `${current} of ${need} days in a row`;
  if (id === 'vocab_4') return `${current} of ${need} quiz answers`;
  if (id === 'perfect_1') return `${current} of ${need} perfect scores`;
  if (id === 'reading_1') return `${current} of ${need} Reading exercises`;
  if (id === 'listening_1' || id === 'listening_5') return `${current} of ${need} Listening exercises`;
  if (id === 'grammar_1') return `${current} of ${need} Grammar exercises`;
  return `${current} of ${need} exercises`;
}

export function presentBadges(stats: BadgeStats, now = new Date()): BadgeView[] {
  return BADGE_ORDER.map((id) => {
    const copy = COPY[id];
    const unlocked = badgeUnlocked(id, stats, now);
    const progress = progressLine(id, stats, now);
    return {
      id,
      kind: copy.kind,
      label: copy.label,
      rule: copy.rule,
      detail: unlocked
        ? `You earned this. ${copy.rule} ${progress}.`
        : `${copy.rule} ${progress}.`,
      progress,
      unlocked,
      icon: copy.icon,
    };
  });
}

/** Level-up badges stay empty until DET-26 stores a level change. */
export function presentLevelBadges(): BadgeView[] {
  return [];
}

export function freshBadges(before: BadgeStats, after: BadgeStats, now = new Date()): BadgeId[] {
  return BADGE_ORDER.filter((id) => !badgeUnlocked(id, before, now) && badgeUnlocked(id, after, now));
}

export function addExercise(
  stats: BadgeStats,
  mode: 'reading' | 'listening' | 'grammar',
  at = new Date(),
  result?: { score: number; total: number },
): BadgeStats {
  const day = madridDayKey(at);
  const perfect = result && result.total > 0 && result.score >= result.total ? stats.perfect + 1 : stats.perfect;
  return {
    ...stats,
    [mode]: stats[mode] + 1,
    perfect,
    days: stats.days.includes(day) ? stats.days : [...stats.days, day],
  };
}

export function addVocabAnswers(stats: BadgeStats, count: number): BadgeStats {
  return { ...stats, vocabAnswers: stats.vocabAnswers + Math.max(0, count) };
}
