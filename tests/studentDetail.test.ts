import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityDays,
  badgeLevel,
  grammarSubtype,
  levelBreakdown,
  levelEmptyMessage,
  recentTestWhen,
  savedLevelLabel,
  scorePercent,
  skillAverage,
  studentIdFromSearch,
  type DetailTest,
} from '../studentDetail.ts';

function result(partial: Partial<DetailTest> & Pick<DetailTest, 'mode' | 'level' | 'score' | 'total'>): DetailTest {
  return {
    createdAt: partial.createdAt ?? '2026-10-01T10:00:00.000Z',
    topic: partial.topic ?? '',
    title: partial.title ?? '',
    ...partial,
  };
}

test('skill cards average one mode and ignore empty tests', () => {
  const tests = [
    result({ mode: 'reading', level: 'B1', score: 8, total: 10 }),
    result({ mode: 'reading', level: 'B1', score: 0, total: 0 }),
    result({ mode: 'listening', level: 'B2', score: 1, total: 2 }),
    result({ mode: 'grammar', level: 'C1', score: 0, total: 4 }),
  ];
  assert.equal(skillAverage(tests, 'reading'), 80);
  assert.equal(skillAverage(tests, 'listening'), 50);
  assert.equal(skillAverage(tests, 'grammar'), 0);
  assert.equal(skillAverage([], 'reading'), null);
});

test('level rows are B1, B2, and C1 and a row with no tests is hidden', () => {
  const tests = [
    result({ mode: 'reading', level: 'B1', score: 9, total: 10 }),
    result({ mode: 'reading', level: 'B1', score: 7, total: 10 }),
    result({ mode: 'reading', level: 'B2', score: 5, total: 10 }),
    result({ mode: 'reading', level: 'beginner', score: 10, total: 10 }),
    result({ mode: 'listening', level: 'C1', score: 4, total: 10 }),
    result({ mode: 'grammar', level: 'C1', score: 6, total: 10 }),
  ];
  assert.deepEqual(levelBreakdown(tests, 'reading'), [
    { label: 'Beginner', average: 100, count: 1 },
    { label: 'B1', average: 80, count: 2 },
    { label: 'B2', average: 50, count: 1 },
  ]);
  assert.deepEqual(levelBreakdown(tests, 'listening'), [
    { label: 'C1', average: 40, count: 1 },
  ]);
  assert.equal(levelEmptyMessage(tests, 'grammar'), null);
  assert.equal(levelEmptyMessage([], 'listening'), 'No tests for this skill.');
  assert.equal(levelEmptyMessage([
    result({ mode: 'grammar', level: '', score: 1, total: 1 }),
  ], 'grammar'), 'No level saved on these tests.');
  assert.equal(savedLevelLabel(' intermediate '), 'Intermediate');
  assert.equal(savedLevelLabel('B2'), 'B2');
});

test('the badge uses the profile level, then the most used test level', () => {
  const tests = [
    { level: 'B2', createdAt: '2026-10-02T00:00:00.000Z' },
    { level: 'B2', createdAt: '2026-10-03T00:00:00.000Z' },
    { level: 'C1', createdAt: '2026-10-04T00:00:00.000Z' },
  ];
  assert.equal(badgeLevel('b2', tests), 'B2');
  assert.equal(badgeLevel('  ', tests), 'B2');
  assert.equal(badgeLevel(null, [
    { level: 'B2', createdAt: '2026-10-02T00:00:00.000Z' },
    { level: 'C1', createdAt: '2026-10-05T00:00:00.000Z' },
  ]), 'C1');
  assert.equal(badgeLevel('Beginner', [
    { level: 'Intermediate', createdAt: '2026-10-02T00:00:00.000Z' },
  ]), 'Intermediate');
});

test('grammar subtype is read from the saved title and ignored for other modes', () => {
  assert.equal(grammarSubtype({ mode: 'grammar', title: 'Grammar: Phrasal verbs', topic: 'travel' }), 'Phrasal');
  assert.equal(grammarSubtype({ mode: 'grammar', title: 'Grammar: Fill in the blanks', topic: 'word order' }), 'Blanks');
  assert.equal(grammarSubtype({ mode: 'grammar', title: '', topic: 'Put in order' }), 'Order');
  assert.equal(grammarSubtype({ mode: 'reading', title: 'The order of the day', topic: '' }), null);
  assert.equal(grammarSubtype({ mode: 'grammar', title: 'Present perfect', topic: 'travel' }), null);
});

test('recent tests use a short date and a 12-hour time', () => {
  const when = recentTestWhen(new Date(2026, 4, 28, 10, 34).toISOString());
  assert.equal(when.date, 'May 28, 2026');
  assert.equal(when.time, '10:34 AM');
  assert.equal(scorePercent(4, 5), 80);
  assert.equal(scorePercent(0, 0), null);
});

test('the activity chart keeps 14 local days and skips older tests', () => {
  const now = new Date(2026, 10, 5, 15, 0, 0);
  const onDay = (day: number, hours: number) => new Date(2026, 10, day, hours).toISOString();
  const days = activityDays([
    { createdAt: onDay(5, 10), score: 8, total: 10 },
    { createdAt: onDay(5, 18), score: 4, total: 10 },
    { createdAt: onDay(4, 9), score: 0, total: 0 },
    { createdAt: onDay(22, 12), score: 10, total: 10 },
    { createdAt: 'not-a-date', score: 1, total: 1 },
  ], now);
  assert.equal(days.length, 14);
  assert.equal(days[0].key, '2026-10-23');
  assert.equal(days[13].key, '2026-11-05');
  assert.equal(days[13].percent, 60);
  assert.equal(days[12].percent, null);
  assert.equal(days[0].percent, null);
  assert.equal(studentIdFromSearch('?student=abc'), 'abc');
  assert.equal(studentIdFromSearch('?student='), null);
  assert.equal(studentIdFromSearch(''), null);
});
