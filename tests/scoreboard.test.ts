import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { madridDayKey } from '../tasks.ts';
import {
  demoRows,
  formatPercent,
  presentBoard,
  publicAlias,
  rowFromAttempts,
  SCOREBOARD_MIN,
  weightedPercent,
  type ScoreAttempt,
  type ScoreRow,
} from '../scoreboard.ts';

const attempt = (mode: ScoreAttempt['mode'], score: number, total: number, createdAt: string): ScoreAttempt => ({
  mode, score, total, createdAt,
});

test('the global percent is weighted by questions, not by exercise', () => {
  const row = rowFromAttempts('Ada', [
    attempt('reading', 1, 2, '2026-06-01T10:00:00Z'),
    attempt('listening', 9, 10, '2026-06-01T11:00:00Z'),
  ], 'all', new Date('2026-06-02T12:00:00Z'));
  const board = presentBoard([row], 'total-percent', 1);
  assert.equal(board.top[0].totalCorrect, 10);
  assert.equal(board.top[0].totalAnswered, 12);
  assert.equal(weightedPercent(10, 12), 83);
  assert.equal(Math.round(((50 + 90) / 2)), 70);
  assert.notEqual(weightedPercent(10, 12), 70);
  assert.equal(formatPercent(10, 12, true), '83%');
  assert.equal(formatPercent(10, 12, false), '—');
});

test('a row without a mode, or with no questions, is left out', () => {
  const row = rowFromAttempts('Ada', [
    attempt(null, 5, 5, '2026-06-01T10:00:00Z'),
    attempt('grammar', 1, 0, '2026-06-01T10:00:00Z'),
    attempt('grammar', 2, 6, '2026-06-01T10:00:00Z'),
  ], 'all');
  assert.equal(row.grammar.done, 1);
  assert.equal(row.grammar.correct, 2);
  assert.equal(row.reading.done, 0);
});

test('daily uses the Madrid date across the spring and autumn clock changes', () => {
  assert.equal(madridDayKey(new Date('2026-03-28T22:30:00Z')), '2026-03-28');
  assert.equal(madridDayKey(new Date('2026-03-28T23:30:00Z')), '2026-03-29');
  assert.equal(madridDayKey(new Date('2026-10-25T00:30:00Z')), '2026-10-25');
  assert.equal(madridDayKey(new Date('2026-10-25T23:30:00Z')), '2026-10-26');
  const now = new Date('2026-03-29T12:00:00Z');
  const row = rowFromAttempts('Ada', [
    attempt('reading', 4, 5, '2026-03-28T23:30:00Z'),
    attempt('reading', 1, 5, '2026-03-28T22:30:00Z'),
    attempt('listening', 1, 5, '2026-10-25T23:30:00Z'),
  ], 'daily', now);
  assert.equal(row.reading.done, 1);
  assert.equal(row.reading.correct, 4);
  assert.equal(row.listening.done, 0);
});

test('percent ranking needs the minimum, then keeps the top 10 and a later own row', () => {
  const rows: ScoreRow[] = Array.from({ length: 12 }, (_, index) => ({
    alias: `Demo ${String(index + 1).padStart(2, '0')}`,
    isSelf: false,
    demo: true,
    reading: { done: 4, correct: 40 - index, answered: 40 },
    listening: { done: 0, correct: 0, answered: 0 },
    grammar: { done: 0, correct: 0, answered: 0 },
  }));
  rows.push({
    alias: 'You',
    isSelf: true,
    demo: false,
    reading: { done: 4, correct: 10, answered: 40 },
    listening: { done: 0, correct: 0, answered: 0 },
    grammar: { done: 0, correct: 0, answered: 0 },
  });
  rows.push({
    alias: 'Demo New',
    isSelf: false,
    demo: true,
    reading: { done: 1, correct: 5, answered: 5 },
    listening: { done: 0, correct: 0, answered: 0 },
    grammar: { done: 0, correct: 0, answered: 0 },
  });
  const board = presentBoard(rows, 'total-percent', SCOREBOARD_MIN);
  assert.equal(board.top.length, 10);
  assert.equal(board.top[0].rank, 1);
  assert.equal(board.top[2].rank, 3);
  assert.equal(board.top.some((row) => row.isSelf), false);
  assert.equal(board.self?.alias, 'You');
  assert.equal(board.self?.rank, 13);
  assert.equal(board.unqualified.map((row) => row.alias).includes('Demo New'), true);
  assert.equal(board.unqualified.every((row) => row.rank == null), true);
  const byCount = presentBoard(rows, 'reading-count', SCOREBOARD_MIN);
  assert.equal(byCount.unqualified.length, 0);
  assert.equal(byCount.top[0].reading.done >= byCount.top[9].reading.done, true);
});

test('a public name is never an email address', () => {
  assert.equal(publicAlias('  Ana  '), 'Ana');
  assert.equal(publicAlias('ana@example.com', true), 'You');
  assert.equal(publicAlias('', false), 'Learner');
  for (const row of [...demoRows('all'), ...demoRows('daily')]) {
    assert.equal(row.demo, true);
    assert.equal(row.alias.startsWith('Demo '), true);
    assert.equal(row.alias.includes('@'), false);
  }
});

test('the scoreboard page and the unapplied migration stay read-only', () => {
  const page = readFileSync(new URL('../components/ScoreboardPage.tsx', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../supabase/migrations/20261124_scoreboard.sql', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(page, /Fictitious demo/);
  assert.match(page, /All time/);
  assert.match(page, /Daily/);
  assert.match(page, /Minimum exercises to rank by percent/);
  assert.equal(page.includes('email'), false);
  assert.match(sql, /Europe\/Madrid/);
  assert.match(sql, /security definer/);
  assert.match(sql, /scoreboard_alias/);
  assert.equal(sql.includes('test_results'), true);
  assert.equal(/update\s+public\.test_results/i.test(sql), false);
  assert.equal(sql.includes('email'), false);
  assert.match(app, /displayName=\{account\.displayName\}/);
  assert.equal(app.includes('ScoreboardPage displayName={account.email}'), false);
});
