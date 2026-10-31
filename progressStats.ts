export function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Consecutive local days with a test, counting today or ending yesterday. */
export function dayStreak(dates: Date[], today = new Date()): number {
  const keys = new Set(dates.map(localDayKey));
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!keys.has(localDayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!keys.has(localDayKey(cursor))) return 0;
  }
  let count = 0;
  while (keys.has(localDayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function averagePercent(rows: { score: number; total: number }[]): number {
  const usable = rows.filter((row) => row.total > 0);
  if (!usable.length) return 0;
  const sum = usable.reduce((acc, row) => acc + (row.score / row.total) * 100, 0);
  return Math.round(sum / usable.length);
}

export function bestPercent(rows: { score: number; total: number }[]): number {
  const usable = rows.filter((row) => row.total > 0);
  if (!usable.length) return 0;
  return Math.round(Math.max(...usable.map((row) => (row.score / row.total) * 100)));
}

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

const CHART_TOP = 18;
const CHART_BOTTOM = 90;

/** Vertical position in a 0–100 viewBox. 100% is near the top. */
export function chartY(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  return CHART_TOP + ((100 - clamped) / 100) * (CHART_BOTTOM - CHART_TOP);
}

/** Horizontal position in a 0–100 viewBox. One score sits in the middle. */
export function chartX(index: number, count: number): number {
  if (count <= 1) return 50;
  const inset = 6;
  return inset + (index / (count - 1)) * (100 - inset * 2);
}

/** Short local date, for example "31 Oct 2026, 09:57". */
export function formatResultDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function cefrToLessonLevel(level: string): 'beginner' | 'intermediate' | 'advanced' {
  const key = level.toUpperCase();
  if (key === 'C1' || key === 'C2' || key.includes('ADVANCED')) return 'advanced';
  if (key === 'B1' || key === 'B2' || key.includes('INTERMEDIATE')) return 'intermediate';
  return 'beginner';
}
