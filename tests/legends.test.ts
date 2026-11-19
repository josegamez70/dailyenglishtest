import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { earnedIds, isValidScoredLesson, legendMailStanding, legendTotal, lessonDedupeKey, nextGoal } from '../legends.ts';

test('retro legends count a finished scored lesson and keep the thresholds', async () => {
  assert.equal(isValidScoredLesson(3, 5), true);
  assert.equal(isValidScoredLesson(6, 5), false);
  assert.equal(isValidScoredLesson(0, 0), false);
  const counts = { reading: 12, listening: 3, grammar: 55, vocabulary: 0 };
  assert.equal(legendTotal(counts), 70);
  assert.deepEqual(earnedIds(counts), [
    'rookie', 'first_steps', 'retro_player', 'arcade_starter', 'reading_10', 'grammar_10', 'grammar_50',
  ]);
  assert.deepEqual(nextGoal(70, [5, 10, 25, 50, 100]), { need: 100, current: 70 });
  const standing = legendMailStanding(38, ['rookie', 'first_steps', 'retro_player']);
  assert.equal(standing.badge?.name, 'Retro Player');
  assert.equal(standing.badge?.icon, '/achievements/retro_player_walkman.png');
  assert.equal(standing.nextLine, '12 more lessons to Arcade Starter');
  assert.equal(legendMailStanding(0, []).badge, null);
  assert.equal(legendMailStanding(0, []).nextLine, '5 more lessons to Rookie');
  assert.equal(legendMailStanding(5000, []).nextLine, 'Every Retro Legend is earned.');
  assert.equal(nextGoal(5000, [5000]), null);
  const first = await lessonDedupeKey('reading', ['b\na', 'a\nb']);
  const second = await lessonDedupeKey('reading', ['a\nb', 'b\na']);
  const other = await lessonDedupeKey('listening', ['a\nb', 'b\na']);
  assert.equal(first, second);
  assert.notEqual(first, other);
  const sql = readFileSync(new URL('../supabase/migrations/20261129_retro_legends.sql', import.meta.url), 'utf8');
  assert.match(sql, /legacy:/);
  assert.match(sql, /record_lesson_completion/);
  assert.match(sql, /vocabulary/);
  assert.equal(/update\s+public\.test_results/i.test(sql), false);
  const app = readFileSync(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
  assert.match(app, /scoreboard: 'scoreboard'/);
  assert.equal(app.includes('menuPixelIcon'), false);
});
