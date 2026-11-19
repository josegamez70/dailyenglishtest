import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bankChallengeIndex, readingChallengeIndex } from '../exerciseBank.ts';
import { firstChallengeItems, listeningLevelForChallenge, presentChallenge, readingChallengeSlice } from '../dailyChallenge.ts';
import { presentBoard } from '../scoreboard.ts';

test('the daily challenge uses the same unsigned index as the reading bank', () => {
  assert.equal(readingChallengeIndex('2026-11-18', 'B1', 60), bankChallengeIndex('2026-11-18', 'B1', 'reading', 60));
  assert.equal(readingChallengeIndex('2026-11-18', 'B1', 60), 49);
  assert.notEqual(
    bankChallengeIndex('2026-11-19', 'B1', 'listening', 60),
    bankChallengeIndex('2026-11-19', 'B1', 'reading', 60),
  );
  assert.equal(listeningLevelForChallenge('B1'), 'Beginner');
  assert.equal(listeningLevelForChallenge('B2'), 'Intermediate');
  assert.equal(listeningLevelForChallenge('C1'), 'Advanced');
  const board = presentChallenge([
    { alias: 'Slow', isSelf: false, demo: false, correct: 8, total: 10, seconds: 400 },
    { alias: 'Fast', isSelf: false, demo: false, correct: 8, total: 10, seconds: 250 },
    { alias: 'Lower', isSelf: true, demo: false, correct: 6, total: 10, seconds: 100 },
  ]);
  assert.equal(board.top[0].alias, 'Fast');
  assert.equal(board.top[1].alias, 'Slow');
  assert.equal(board.top[2].alias, 'Lower');
  const tied = presentBoard([
    { alias: 'Fewer', isSelf: false, demo: false, reading: { done: 3, correct: 6, answered: 10 }, listening: { done: 0, correct: 0, answered: 0 }, grammar: { done: 0, correct: 0, answered: 0 } },
    { alias: 'More', isSelf: false, demo: false, reading: { done: 6, correct: 12, answered: 20 }, listening: { done: 0, correct: 0, answered: 0 }, grammar: { done: 0, correct: 0, answered: 0 } },
  ], 3);
  assert.equal(tied.top[0].alias, 'More');
  const sql = readFileSync(new URL('../supabase/migrations/20261130_daily_challenge.sql', import.meta.url), 'utf8');
  assert.match(sql, /daily_challenge_attempts/);
  assert.match(sql, /primary key \(user_id, madrid_day\)/);
  assert.match(sql, /daily_challenge_board/);
  assert.match(sql, /auth\.uid\(\) = user_id/);
  assert.equal(/update\s+public\.test_results/i.test(sql), false);
  const shell = readFileSync(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
  const vocab = shell.indexOf("label: 'Vocabulary builder'");
  const challenge = shell.indexOf("label: 'Daily challenge'");
  const scoreboard = shell.indexOf("label: 'Scoreboard'");
  const tasks = shell.indexOf("label: 'Tasks'");
  assert.ok(vocab > -1 && vocab < challenge && challenge < scoreboard && scoreboard < tasks);
  assert.match(shell, /challenge: 'daily_challenge'/);
  const job = readFileSync(new URL('../scoreboardEmailJob.ts', import.meta.url), 'utf8');
  assert.match(job, /SCOREBOARD_EMAILS_ENABLED/);
  const story = ['Alpha fact lives here.', 'Beta fact lives here.', 'Gamma fact lives here.', 'Delta fact lives here.'].join('\n\n');
  const quiz = ['Alpha fact lives here.', 'Beta fact lives here.', 'Gamma fact lives here.', 'Alpha fact lives here.', 'Gamma fact lives here.', 'Delta fact lives here.']
    .map((sentence, index) => ({ question: `Q${index}`, supportingSentence: sentence }));
  const slice = readingChallengeSlice(story, quiz);
  assert.ok(slice);
  assert.equal(slice.quiz.length, 5);
  assert.equal(slice.story.includes('Delta'), false);
  assert.equal(slice.quiz.every((item) => slice.story.includes(item.supportingSentence)), true);
  assert.equal(readingChallengeSlice(story, quiz.slice(0, 4).map((item, index) => ({ ...item, supportingSentence: ['Alpha', 'Beta', 'Gamma', 'Delta'][index] + ' fact lives here.' }))), null);
  assert.equal(firstChallengeItems([1, 2, 3, 4])?.length ?? 0, 0);
  assert.deepEqual(firstChallengeItems([1, 2, 3, 4, 5, 6]), [1, 2, 3, 4, 5]);
  const answersSql = readFileSync(new URL('../supabase/migrations/20261201_daily_challenge_answers.sql', import.meta.url), 'utf8');
  assert.match(answersSql, /answers jsonb/);
  assert.equal(/update\s+public\.test_results/i.test(answersSql), false);
});
