import test from 'node:test';
import assert from 'node:assert/strict';
import { B2_EXERCISES, C1_EXERCISES, levelAccess } from '../levelProgress.ts';
import { averagePercent, bestPercent, cefrToLessonLevel, chartX, chartY, dayStreak, formatResultDate, lessonModeLabel } from '../progressStats.ts';

test('streak counts consecutive local days and stops after a gap', () => {
  const today = new Date(2026, 9, 31);
  const dates = [
    new Date(2026, 9, 31, 9),
    new Date(2026, 9, 30, 22),
    new Date(2026, 9, 29, 1),
    new Date(2026, 9, 27, 12),
  ];
  assert.equal(dayStreak(dates, today), 3);
  assert.equal(dayStreak([new Date(2026, 9, 28)], today), 0);
  assert.equal(dayStreak([new Date(2026, 9, 30, 8)], today), 1);
});

test('lesson mode labels name reading, audio, and grammar', () => {
  assert.equal(lessonModeLabel('reading'), 'Reading');
  assert.equal(lessonModeLabel('listening'), 'Audio');
  assert.equal(lessonModeLabel('grammar'), 'Grammar');
  assert.equal(lessonModeLabel(null), '—');
  assert.equal(lessonModeLabel(undefined), '—');
});

test('score summaries ignore empty tests', () => {
  const rows = [
    { score: 4, total: 5 },
    { score: 1, total: 0 },
    { score: 8, total: 10 },
  ];
  assert.equal(averagePercent(rows), 80);
  assert.equal(bestPercent(rows), 80);
  assert.equal(cefrToLessonLevel('C1'), 'advanced');
  assert.equal(cefrToLessonLevel('B2'), 'intermediate');
  assert.equal(cefrToLessonLevel('B1'), 'beginner');
  assert.equal(cefrToLessonLevel('A2'), 'beginner');
  assert.equal(cefrToLessonLevel('C2'), 'advanced');
});

test('B2 and C1 stay open for people who already use them', () => {
  const fresh = levelAccess('B1', []);
  assert.equal(fresh.b2, false);
  assert.equal(fresh.c1, false);
  const earned = levelAccess('B1', Array.from({ length: B2_EXERCISES }, () => ({ level: 'Beginner', score: 4, total: 5, mode: 'reading' })));
  assert.equal(earned.b2, true);
  assert.equal(earned.b2Kept, false);
  assert.equal(earned.c1, false);
  const kept = levelAccess('C1', [{ level: 'Beginner', score: 1, total: 5, mode: 'reading' }]);
  assert.equal(kept.b2, true);
  assert.equal(kept.c1, true);
  assert.equal(kept.b2Kept, true);
  assert.equal(kept.c1Kept, true);
  const short = levelAccess('B1', [{ level: 'B2', score: 5, total: 5, mode: 'grammar' }]);
  assert.equal(short.b2, true);
  assert.equal(short.c1, false);
  const almost = levelAccess('B1', Array.from({ length: C1_EXERCISES - 1 }, () => ({ level: 'Intermediate', score: 8, total: 10, mode: 'listening' })));
  assert.equal(almost.c1, false);
  assert.equal(almost.b2Passes, C1_EXERCISES - 1);
});

test('a single chart score has a point and higher scores sit higher', () => {
  assert.equal(chartX(0, 1), 50);
  assert.ok(chartX(0, 2) < chartX(1, 2));
  assert.ok(chartY(100) < chartY(50));
  assert.ok(chartY(50) < chartY(0));
  assert.equal(formatResultDate(new Date(2026, 9, 31, 9, 57)), '31 Oct 2026, 09:57');
});
