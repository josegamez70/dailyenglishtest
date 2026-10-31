import test from 'node:test';
import assert from 'node:assert/strict';
import { averagePercent, bestPercent, cefrToLessonLevel, chartX, chartY, dayStreak, formatResultDate } from '../progressStats.ts';

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
  assert.equal(cefrToLessonLevel('A2'), 'beginner');
});

test('a single chart score has a point and higher scores sit higher', () => {
  assert.equal(chartX(0, 1), 50);
  assert.ok(chartX(0, 2) < chartX(1, 2));
  assert.ok(chartY(100) < chartY(50));
  assert.ok(chartY(50) < chartY(0));
  assert.equal(formatResultDate(new Date(2026, 9, 31, 9, 57)), '31 Oct 2026, 09:57');
});
