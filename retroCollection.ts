import { storedLevel } from './levelProgress.ts';
import { LEVEL_UNLOCKS_ENABLED } from './levelUnlocks.ts';
import { formatResultDate } from './progressStats.ts';
import { madridDayKey, shiftMadridDay } from './tasks.ts';

export type RetroGroup = 'exercises' | 'accuracy' | 'streaks' | 'levels' | 'vocabulary';

export type PracticeRow = {
  createdAt: string;
  level: string;
  score: number;
  total: number;
  mode?: string | null;
};

export type SavedWordRow = { createdAt: string };

export type StoredAchievement = { id: string; unlockedAt: string };

export type RetroBadge = {
  id: string;
  group: RetroGroup;
  label: string;
  rule: string;
  icon: string;
  current: number;
  need: number;
  progress: string;
  unlocked: boolean;
  earnedAt: string | null;
};

export const RETRO_GROUPS: { id: RetroGroup; label: string }[] = [
  { id: 'exercises', label: 'Exercises completed' },
  { id: 'accuracy', label: 'Accuracy' },
  { id: 'streaks', label: 'Day streaks' },
  { id: 'levels', label: 'Levels unlocked' },
  { id: 'vocabulary', label: 'Saved vocabulary' },
];

const EXERCISE_NEEDS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] as const;
const VOCAB_NEEDS = [1, 10, 50, 100, 500] as const;

const EXERCISE_ICON: Record<number, string> = {
  1: '/badges/pixel/exercises_1.svg',
  5: '/achievements/rookie_floppy.png',
  10: '/achievements/first_steps_cassette.png',
  25: '/achievements/retro_player_walkman.png',
  50: '/achievements/arcade_starter_joystick.png',
  100: '/achievements/century_club_bmx.png',
  250: '/achievements/power_user_gameboy.png',
  500: '/achievements/english_master_486.png',
  1000: '/achievements/retro_legend_arcade.png',
  2500: '/achievements/hall_of_fame_gold_cd.png',
  5000: '/achievements/ultimate_legend_trophy.png',
};

const EXERCISE_LEGACY: Record<number, string[]> = {
  5: ['rookie'],
  10: ['first_steps', 'reading_10', 'listening_10', 'grammar_10'],
  25: ['retro_player'],
  50: ['arcade_starter', 'reading_50', 'listening_50', 'grammar_50'],
  100: ['century_club', 'reading_100', 'listening_100', 'grammar_100'],
  250: ['power_user'],
  500: ['english_master', 'reading_500', 'listening_500', 'grammar_500'],
  1000: ['retro_legend'],
  2500: ['hall_of_fame'],
  5000: ['ultimate_legend'],
};

const VOCAB_LEGACY: Record<number, string[]> = {
  10: ['vocabulary_10'],
  50: ['vocabulary_50'],
  100: ['vocabulary_100'],
  500: ['vocabulary_500'],
};

function isPractice(row: PracticeRow): boolean {
  if (row.total <= 0 || row.score < 0 || row.score > row.total) return false;
  return !row.mode || row.mode === 'reading' || row.mode === 'listening' || row.mode === 'grammar';
}

function byTime(left: { createdAt: string }, right: { createdAt: string }): number {
  return left.createdAt.localeCompare(right.createdAt);
}

function earliest(values: Array<string | null>): string | null {
  const dated = values.filter((value): value is string => Boolean(value)).sort();
  return dated[0] ?? null;
}

function legacyDate(ids: readonly string[], stored: readonly StoredAchievement[]): string | null {
  const have = new Set(ids);
  const hits = stored.filter((row) => have.has(row.id)).map((row) => row.unlockedAt);
  return hits.sort()[0] ?? null;
}

function shown(current: number, need: number): string {
  return `${Math.min(current, need)}/${need}`;
}

function badge(input: {
  id: string;
  group: RetroGroup;
  label: string;
  rule: string;
  icon: string;
  current: number;
  need: number;
  earnedAt: string | null;
  legacyAt: string | null;
}): RetroBadge {
  const unlocked = input.current >= input.need || Boolean(input.legacyAt);
  return {
    id: input.id,
    group: input.group,
    label: input.label,
    rule: input.rule,
    icon: input.icon,
    current: input.current,
    need: input.need,
    progress: shown(input.current, input.need),
    unlocked,
    earnedAt: unlocked ? earliest([input.current >= input.need ? input.earnedAt : null, input.legacyAt]) : null,
  };
}

function streakEarnedOn(days: readonly string[], need: number): string | null {
  const unique = [...new Set(days)].sort();
  let run = 0;
  let previous = '';
  for (const day of unique) {
    run = previous && shiftMadridDay(previous, 1) === day ? run + 1 : 1;
    if (run >= need) return day;
    previous = day;
  }
  return null;
}

function bestStreak(days: readonly string[]): number {
  const unique = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let previous = '';
  for (const day of unique) {
    run = previous && shiftMadridDay(previous, 1) === day ? run + 1 : 1;
    if (run > best) best = run;
    previous = day;
  }
  return best;
}

export function earnedDateLabel(value: string | null): string {
  if (!value) return 'Not earned yet';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[month - 1]} ${year}`;
  }
  return formatResultDate(value) || 'Not earned yet';
}

export function presentRetroLegends(input: {
  results: readonly PracticeRow[];
  words: readonly SavedWordRow[];
  stored?: readonly StoredAchievement[];
  unlocksEnabled?: boolean;
}): RetroBadge[] {
  const stored = input.stored ?? [];
  const practice = input.results.filter(isPractice).sort(byTime);
  const days = practice.map((row) => madridDayKey(new Date(row.createdAt)));
  const accurate = practice.filter((row) => row.score / row.total >= 0.8);
  const perfect = practice.filter((row) => row.score >= row.total);
  const words = [...input.words].filter((word) => word.createdAt).sort(byTime);
  const b1 = practice.filter((row) => storedLevel(row.level) === 'B1' && row.score / row.total >= 0.8);
  const b2 = practice.filter((row) => storedLevel(row.level) === 'B2' && row.score / row.total >= 0.8);
  const streak = bestStreak(days);

  const exercises = EXERCISE_NEEDS.map((need) => badge({
    id: `exercises_${need}`,
    group: 'exercises',
    label: need === 1 ? '1 exercise' : `${need} exercises`,
    rule: `Finish ${need} Reading, Listening, or Grammar practice ${need === 1 ? 'exercise' : 'exercises'}.`,
    icon: EXERCISE_ICON[need],
    current: practice.length,
    need,
    earnedAt: practice[need - 1]?.createdAt ?? null,
    legacyAt: legacyDate([`exercises_${need}`, ...(EXERCISE_LEGACY[need] ?? [])], stored),
  }));

  const accuracy = [
    badge({
      id: 'acc_80_1',
      group: 'accuracy',
      label: '80% once',
      rule: 'Finish 1 practice exercise at 80% or more.',
      icon: '/badges/pixel/accuracy.svg',
      current: accurate.length,
      need: 1,
      earnedAt: accurate[0]?.createdAt ?? null,
      legacyAt: legacyDate(['acc_80_1'], stored),
    }),
    badge({
      id: 'acc_80_5',
      group: 'accuracy',
      label: '80% five times',
      rule: 'Finish 5 practice exercises at 80% or more.',
      icon: '/badges/pixel/accuracy.svg',
      current: accurate.length,
      need: 5,
      earnedAt: accurate[4]?.createdAt ?? null,
      legacyAt: legacyDate(['acc_80_5'], stored),
    }),
    badge({
      id: 'perfect_1',
      group: 'accuracy',
      label: 'Perfect score',
      rule: 'Finish 1 practice exercise with every answer correct.',
      icon: '/badges/pixel/perfect.svg',
      current: perfect.length,
      need: 1,
      earnedAt: perfect[0]?.createdAt ?? null,
      legacyAt: legacyDate(['perfect_1'], stored),
    }),
  ];

  const streaks = [3, 7].map((need) => badge({
    id: `streak_${need}`,
    group: 'streaks',
    label: `${need}-day streak`,
    rule: `Finish a practice exercise on ${need} days in a row, using the date in Spain.`,
    icon: '/badges/pixel/streak.svg',
    current: streak,
    need,
    earnedAt: streakEarnedOn(days, need),
    legacyAt: legacyDate([`streak_${need}`], stored),
  }));

  const levels = [
    badge({
      id: 'level_b2',
      group: 'levels',
      label: 'B2 unlocked',
      rule: 'Finish 5 B1 practice exercises at 80% or more. B2 opens on the Daily Challenge.',
      icon: '/badges/pixel/level_b2.svg',
      current: b1.length,
      need: 5,
      earnedAt: b1[4]?.createdAt ?? null,
      legacyAt: legacyDate(['level_b2'], stored),
    }),
    badge({
      id: 'level_c1',
      group: 'levels',
      label: 'C1 unlocked',
      rule: 'Finish 7 B2 practice exercises at 80% or more. C1 opens on the Daily Challenge.',
      icon: '/badges/pixel/level_c1.svg',
      current: b2.length,
      need: 7,
      earnedAt: b2[6]?.createdAt ?? null,
      legacyAt: legacyDate(['level_c1'], stored),
    }),
  ];

  const vocabulary = VOCAB_NEEDS.map((need) => badge({
    id: `vocab_${need}`,
    group: 'vocabulary',
    label: need === 1 ? '1 saved word' : `${need} saved words`,
    rule: `Save ${need} ${need === 1 ? 'word' : 'words'} in Vocabulary.`,
    icon: '/badges/pixel/vocab.svg',
    current: words.length,
    need,
    earnedAt: words[need - 1]?.createdAt ?? null,
    legacyAt: legacyDate([`vocab_${need}`, ...(VOCAB_LEGACY[need] ?? [])], stored),
  }));

  const unlocksEnabled = input.unlocksEnabled ?? LEVEL_UNLOCKS_ENABLED;
  const storedIds = new Set(stored.map((row) => row.id));
  const visibleLevels = unlocksEnabled ? levels : levels.filter((badge) => storedIds.has(badge.id));
  return [...exercises, ...accuracy, ...streaks, ...visibleLevels, ...vocabulary];
}
