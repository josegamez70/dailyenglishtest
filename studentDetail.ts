import { averagePercent, localDayKey } from './progressStats.ts';

export type SkillId = 'reading' | 'listening' | 'grammar';

export type DetailTest = {
  createdAt: string;
  level: string;
  topic: string;
  title: string;
  score: number;
  total: number;
  mode: string | null;
};

/** Reading, Listening, and Grammar. Listening is the stored mode "listening" (shown as Audio on a test). */
export const SKILLS: { id: SkillId; label: string }[] = [
  { id: 'reading', label: 'Reading' },
  { id: 'listening', label: 'Listening' },
  { id: 'grammar', label: 'Grammar' },
];

/**
 * Rows the breakdown can show. B1, B2, and C1 are the teacher rows from the design.
 * Reading and listening tests are saved as Beginner, Intermediate, or Advanced, so those
 * bands get their own rows instead of being renamed. A row is omitted when its count is 0.
 */
export const LEVEL_ROWS: { key: string; label: string }[] = [
  { key: 'a1', label: 'A1' },
  { key: 'a2', label: 'A2' },
  { key: 'beginner', label: 'Beginner' },
  { key: 'b1', label: 'B1' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'b2', label: 'B2' },
  { key: 'c1', label: 'C1' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'c2', label: 'C2' },
];

const CEFR_KEYS = new Set(['a1', 'a2', 'b1', 'b2', 'c1', 'c2']);

export type LevelBreakdown = {
  label: string;
  average: number | null;
  count: number;
};

export type ActivityDay = {
  key: string;
  label: string;
  percent: number | null;
};

export type GrammarKind = 'Blanks' | 'Phrasal' | 'Order';

export function skillOf(mode: string | null | undefined): SkillId | null {
  if (mode === 'reading' || mode === 'listening' || mode === 'grammar') return mode;
  return null;
}

export function testsForSkill<T extends { mode: string | null }>(tests: T[], skill: SkillId): T[] {
  return tests.filter((test) => skillOf(test.mode) === skill);
}

/** Null when the skill has no scored test. Zero when every scored test is 0%. */
export function skillAverage(tests: DetailTest[], skill: SkillId): number | null {
  const rows = testsForSkill(tests, skill).filter((test) => test.total > 0);
  if (!rows.length) return null;
  return averagePercent(rows);
}

/** A CEFR code wins when the saved text contains one. Otherwise a lesson band name. */
export function levelKey(level: string): string | null {
  const text = level.trim().toLowerCase();
  if (!text) return null;
  const cefr = text.match(/\b(a1|a2|b1|b2|c1|c2)\b/);
  if (cefr) return cefr[1];
  if (text === 'beginner' || text === 'intermediate' || text === 'advanced') return text;
  return null;
}

export function savedLevelLabel(level: string): string {
  const key = levelKey(level);
  if (!key) return level.trim();
  return LEVEL_ROWS.find((item) => item.key === key)?.label ?? level.trim();
}

export function levelBreakdown(tests: DetailTest[], skill: SkillId): LevelBreakdown[] {
  const rows = testsForSkill(tests, skill);
  return LEVEL_ROWS.flatMap((item) => {
    const matching = rows.filter((test) => levelKey(test.level) === item.key);
    if (!matching.length) return [];
    const usable = matching.filter((test) => test.total > 0);
    return [{
      label: item.label,
      average: usable.length ? averagePercent(usable) : null,
      count: matching.length,
    }];
  });
}

export function levelEmptyMessage(tests: DetailTest[], skill: SkillId): string | null {
  if (levelBreakdown(tests, skill).length) return null;
  if (!testsForSkill(tests, skill).length) return 'No tests for this skill.';
  return 'No level saved on these tests.';
}

/** Profile CEFR when it is set. Otherwise the level that shows up most often. */
export function badgeLevel(profileLevel: string | null | undefined, tests: { level: string; createdAt: string }[]): string {
  const profileKey = levelKey(profileLevel ?? '');
  if (profileKey && CEFR_KEYS.has(profileKey)) return profileKey.toUpperCase();
  const counts = new Map<string, { count: number; latest: number }>();
  for (const test of tests) {
    const label = savedLevelLabel(test.level);
    const key = levelKey(test.level);
    if (!label || !key) continue;
    const time = Date.parse(test.createdAt);
    const current = counts.get(label) ?? { count: 0, latest: 0 };
    current.count += 1;
    if (!Number.isNaN(time) && time > current.latest) current.latest = time;
    counts.set(label, current);
  }
  let best = '';
  let bestCount = 0;
  let bestTime = -1;
  for (const [label, info] of counts) {
    if (info.count > bestCount || (info.count === bestCount && info.latest > bestTime)) {
      best = label;
      bestCount = info.count;
      bestTime = info.latest;
    }
  }
  return best;
}

export function scorePercent(score: number, total: number): number | null {
  if (!total || total < 0) return null;
  return Math.round((score / total) * 100);
}

export function newestFirst<T extends { createdAt: string }>(tests: T[]): T[] {
  return [...tests].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function matchGrammarKind(text: string): GrammarKind | null {
  const value = text.toLowerCase();
  if (value.includes('phrasal')) return 'Phrasal';
  if (value.includes('blank')) return 'Blanks';
  if (value.includes('put in order') || /\border\b/.test(value)) return 'Order';
  return null;
}

/** Short grammar label when the saved title or topic names the exercise. */
export function grammarSubtype(test: { mode: string | null; title: string; topic: string }): GrammarKind | null {
  if (test.mode !== 'grammar') return null;
  return matchGrammarKind(test.title) ?? matchGrammarKind(test.topic);
}

/** "May 28, 2025" and "10:34 AM". */
export function recentTestWhen(value: string): { date: string; time: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '', time: '' };
  return {
    date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date),
  };
}

/** One bar per local day for the last 14 days, oldest first. Null means no scored test that day. */
export function activityDays(
  tests: { createdAt: string; score: number; total: number }[],
  now = new Date(),
): ActivityDay[] {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days: ActivityDay[] = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - offset);
    days.push({
      key: localDayKey(date),
      label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
      percent: null,
    });
  }
  const grouped = new Map<string, { score: number; total: number }[]>();
  for (const day of days) grouped.set(day.key, []);
  for (const test of tests) {
    const date = new Date(test.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const bucket = grouped.get(localDayKey(date));
    if (!bucket) continue;
    bucket.push(test);
  }
  return days.map((day) => {
    const usable = (grouped.get(day.key) ?? []).filter((row) => row.total > 0);
    return { ...day, percent: usable.length ? averagePercent(usable) : null };
  });
}

export function studentIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get('student')?.trim() ?? '';
  return id || null;
}
