import { madridDayKey, shiftMadridDay } from './tasks.ts';

export const AUDIO_LESSONS = 5;
export const VOCAB_ANSWERS = 4;
export const WALKMAN_DAYS = 3;
export const BMX_EXERCISES = 25;

export type BadgeId =
  | 'reading'
  | 'listening'
  | 'grammar'
  | 'vocabulary'
  | 'audio'
  | 'video'
  | 'walkman'
  | 'bmx';

export type BadgeStats = {
  reading: number;
  listening: number;
  grammar: number;
  vocabAnswers: number;
  /** Madrid calendar days that have a scored Reading, Listening, or Grammar exercise. */
  days: string[];
};

export type BadgeView = {
  id: BadgeId;
  label: string;
  rule: string;
  unlocked: boolean;
  comingSoon: boolean;
  icon: string;
};

export const BADGE_ORDER: BadgeId[] = [
  'reading',
  'listening',
  'grammar',
  'vocabulary',
  'audio',
  'video',
  'walkman',
  'bmx',
];

const COPY: Record<BadgeId, { label: string; rule: string; icon: string }> = {
  reading: {
    label: 'Reading Completed',
    rule: 'Finish 1 Reading exercise.',
    icon: '/badges/reading.svg',
  },
  listening: {
    label: 'Listening Completed',
    rule: 'Finish 1 Listening exercise.',
    icon: '/badges/listening.svg',
  },
  grammar: {
    label: 'Grammar Completed',
    rule: 'Finish 1 Grammar exercise.',
    icon: '/badges/grammar.svg',
  },
  vocabulary: {
    label: 'Vocabulary Completed',
    rule: 'Answer 4 Vocabulary quiz questions, the shortest quiz.',
    icon: '/badges/vocabulary.svg',
  },
  audio: {
    label: 'Audio Lesson Completed',
    rule: 'Finish 5 Listening exercises.',
    icon: '/badges/audio.svg',
  },
  video: {
    label: 'Video Lesson Completed',
    rule: 'Coming soon. There is no video lesson to complete yet.',
    icon: '/badges/video.svg',
  },
  walkman: {
    label: 'Walkman Challenge',
    rule: 'Finish an exercise on 3 days in a row, using the date in Spain.',
    icon: '/badges/walkman.svg',
  },
  bmx: {
    label: 'BMX Master',
    rule: 'Finish 25 Reading, Listening, or Grammar exercises.',
    icon: '/badges/bmx.svg',
  },
};

export function emptyBadgeStats(): BadgeStats {
  return { reading: 0, listening: 0, grammar: 0, vocabAnswers: 0, days: [] };
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

export function badgeUnlocked(id: BadgeId, stats: BadgeStats, now = new Date()): boolean {
  if (id === 'reading') return stats.reading >= 1;
  if (id === 'listening') return stats.listening >= 1;
  if (id === 'grammar') return stats.grammar >= 1;
  if (id === 'vocabulary') return stats.vocabAnswers >= VOCAB_ANSWERS;
  if (id === 'audio') return stats.listening >= AUDIO_LESSONS;
  if (id === 'video') return false;
  if (id === 'walkman') return madridStreak(stats.days, now) >= WALKMAN_DAYS;
  return stats.reading + stats.listening + stats.grammar >= BMX_EXERCISES;
}

export function presentBadges(stats: BadgeStats, now = new Date()): BadgeView[] {
  return BADGE_ORDER.map((id) => ({
    id,
    label: COPY[id].label,
    rule: COPY[id].rule,
    icon: COPY[id].icon,
    unlocked: badgeUnlocked(id, stats, now),
    comingSoon: id === 'video',
  }));
}

export function freshBadges(before: BadgeStats, after: BadgeStats, now = new Date()): BadgeId[] {
  return BADGE_ORDER.filter((id) => id !== 'video' && !badgeUnlocked(id, before, now) && badgeUnlocked(id, after, now));
}

export function addExercise(stats: BadgeStats, mode: 'reading' | 'listening' | 'grammar', at = new Date()): BadgeStats {
  const day = madridDayKey(at);
  return {
    ...stats,
    [mode]: stats[mode] + 1,
    days: stats.days.includes(day) ? stats.days : [...stats.days, day],
  };
}

export function addVocabAnswers(stats: BadgeStats, count: number): BadgeStats {
  return { ...stats, vocabAnswers: stats.vocabAnswers + Math.max(0, count) };
}
