import test from 'node:test';
import assert from 'node:assert/strict';
import { presentRetroLegends } from '../retroCollection.ts';

const row = (createdAt: string, level: string, score: number, total: number, mode = 'reading') => ({
  createdAt, level, score, total, mode,
});

test('retro legends use practice results, saved words, and older achievement rows', () => {
  const badges = presentRetroLegends({
    results: [
      row('2026-01-01T10:00:00.000Z', 'B1', 4, 5),
      row('2026-01-02T10:00:00.000Z', 'B1', 4, 5),
      row('2026-01-03T10:00:00.000Z', 'B1', 5, 5),
      row('2026-01-04T10:00:00.000Z', 'B1', 2, 5),
      row('2026-01-05T10:00:00.000Z', 'B1', 4, 5, 'daily'),
    ],
    words: [{ createdAt: '2026-02-01T10:00:00.000Z' }, { createdAt: '2026-02-02T10:00:00.000Z' }],
    stored: [{ id: 'rookie', unlockedAt: '2026-03-01T10:00:00.000Z' }],
  });
  const exercises = badges.find((badge) => badge.id === 'exercises_5');
  const accuracy = badges.find((badge) => badge.id === 'acc_80_5');
  const level = badges.find((badge) => badge.id === 'level_b2');
  const vocab = badges.find((badge) => badge.id === 'vocab_1');
  assert.equal(level, undefined);
  assert.equal(exercises?.unlocked, true);
  assert.equal(exercises?.current, 4);
  assert.equal(exercises?.progress, '4/5');
  assert.equal(accuracy?.current, 3);
  assert.equal(accuracy?.progress, '3/5');
  assert.equal(accuracy?.unlocked, false);
  assert.equal(vocab?.unlocked, true);
  assert.equal(vocab?.progress, '1/1');
  const groups = badges.map((badge) => badge.group);
  assert.ok(groups.indexOf('exercises') < groups.indexOf('accuracy'));
  assert.ok(groups.indexOf('accuracy') < groups.indexOf('streaks'));
  assert.equal(groups.includes('levels'), false);
  assert.ok(groups.indexOf('streaks') < groups.indexOf('vocabulary'));
  const counted = presentRetroLegends({
    results: [row('2026-01-01T10:00:00.000Z', 'B1', 4, 5)],
    words: [],
    unlocksEnabled: true,
  });
  const opened = counted.find((badge) => badge.id === 'level_b2');
  assert.equal(opened?.current, 1);
  assert.equal(opened?.progress, '1/5');
  assert.equal(opened?.unlocked, false);
  const kept = presentRetroLegends({
    results: [],
    words: [],
    stored: [{ id: 'level_b2', unlockedAt: '2026-03-02T10:00:00.000Z' }],
  });
  assert.equal(kept.find((badge) => badge.id === 'level_b2')?.unlocked, true);
});
