import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { madridDayKey } from '../tasks.ts';
import {
  demoRows,
  formatPercent,
  presentBoard,
  publicAlias,
  rankLabel,
  rowFromAttempts,
  SCOREBOARD_MIN,
  storedBoardLevel,
  weightedPercent,
  withRemoteAlias,
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
  const board = presentBoard([row], 1);
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
  const yesterday = rowFromAttempts('Ada', [
    attempt('reading', 4, 5, '2026-03-28T22:30:00Z'),
    attempt('reading', 1, 5, '2026-03-28T23:30:00Z'),
  ], 'yesterday', now);
  assert.equal(yesterday.reading.done, 1);
  assert.equal(yesterday.reading.correct, 4);
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
  const board = presentBoard(rows, SCOREBOARD_MIN);
  assert.equal(board.top.length, 10);
  assert.equal(board.top[0].rank, 1);
  assert.equal(board.top[2].rank, 3);
  assert.equal(board.top.some((row) => row.isSelf), false);
  assert.equal(board.self?.alias, 'You');
  assert.equal(board.self?.rank, 13);
  assert.equal(board.unqualified.map((row) => row.alias).includes('Demo New'), true);
  assert.equal(board.unqualified.every((row) => row.rank == null), true);
  const tied = presentBoard([
    { alias: 'Fewer', isSelf: false, demo: false, reading: { done: 4, correct: 8, answered: 10 }, listening: emptyMode(), grammar: emptyMode() },
    { alias: 'More', isSelf: false, demo: false, reading: { done: 8, correct: 16, answered: 20 }, listening: emptyMode(), grammar: emptyMode() },
  ], 1);
  assert.equal(tied.top[0].alias, 'More');
  const percentOnly = presentBoard([
    { alias: 'Short', isSelf: false, demo: false, reading: { done: 1, correct: 5, answered: 5 }, listening: emptyMode(), grammar: emptyMode() },
    { alias: 'Ready', isSelf: false, demo: false, reading: { done: 4, correct: 2, answered: 10 }, listening: emptyMode(), grammar: emptyMode() },
  ], 3);
  assert.equal(percentOnly.top.map((item) => item.alias).includes('Short'), false);
  assert.equal(percentOnly.top[0].alias, 'Ready');
  const byVolume = presentBoard([
    { alias: 'Short', isSelf: false, demo: false, reading: { done: 1, correct: 5, answered: 5 }, listening: emptyMode(), grammar: emptyMode() },
    { alias: 'Ready', isSelf: false, demo: false, reading: { done: 4, correct: 2, answered: 10 }, listening: emptyMode(), grammar: emptyMode() },
  ], 3, 'volume');
  assert.equal(byVolume.top[0].alias, 'Ready');
  assert.equal(byVolume.top[1].alias, 'Short');
  assert.equal(byVolume.unqualified.length, 0);
  assert.equal(rankLabel(1), '1ST');
  assert.equal(rankLabel(2), '2ND');
  assert.equal(rankLabel(3), '3RD');
  assert.equal(rankLabel(4), '4');
});

test('a level filter uses the saved lesson level and leaves a blank level out', () => {
  assert.equal(storedBoardLevel('Beginner'), 'B1');
  assert.equal(storedBoardLevel('intermediate'), 'B2');
  assert.equal(storedBoardLevel('Advanced'), 'C1');
  assert.equal(storedBoardLevel(''), null);
  assert.equal(storedBoardLevel('mystery'), null);
  const attempts = [
    attempt('reading', 4, 5, '2026-06-01T10:00:00Z'),
    { ...attempt('listening', 5, 5, '2026-06-01T11:00:00Z'), level: 'Advanced' },
    { ...attempt('grammar', 1, 5, '2026-06-01T12:00:00Z'), level: '' },
  ];
  attempts[0].level = 'Beginner';
  const b1 = rowFromAttempts('Ada', attempts, 'all', new Date('2026-06-02T12:00:00Z'), false, 'B1');
  const c1 = rowFromAttempts('Ada', attempts, 'all', new Date('2026-06-02T12:00:00Z'), false, 'C1');
  assert.equal(b1.reading.done, 1);
  assert.equal(b1.listening.done, 0);
  assert.equal(b1.grammar.done, 0);
  assert.equal(c1.listening.done, 1);
  assert.equal(c1.reading.done, 0);
});

function emptyMode() {
  return { done: 0, correct: 0, answered: 0 };
}

test('a pending yesterday row keeps the public alias', () => {
  const local = rowFromAttempts('You', [], 'yesterday', new Date(), true);
  assert.equal(withRemoteAlias(local, 'Learner A3BF').alias, 'Learner A3BF');
  assert.equal(withRemoteAlias(local, 'person@example.com').alias, 'You');
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
  assert.match(page, /Daily challenge/);
  assert.match(page, /scoreboard-tab-challenge/);
  assert.match(page, /scoreboard-tab-row/);
  assert.match(page, /\['daily', 'Today'\],\s*\['yesterday', 'Yesterday'\],\s*\['all', 'All time'\]/);
  assert.match(page, /scoreboard-tabs/);
  assert.match(page, /arcade-board/);
  assert.match(page, /rankLabel/);
  assert.match(page, /Most exercises/);
  assert.match(page, /Highest %/);
  assert.match(page, /aria-label="Challenge level"/);
  assert.equal(page.includes('aria-label="Level"'), false);
  assert.match(page, /Not yet qualified/);
  assert.match(page, /SCOREBOARD_MIN/);
  assert.match(page, /Today in Spain/);
  assert.match(page, /Yesterday/);
  assert.equal(page.includes('account.email'), false);
  assert.match(page, /Your display name from Profile is shown/);
  assert.equal(page.includes('Only a chosen alias is shown'), false);
  assert.equal(page.includes('scoreboard_board_level'), false);
  const names = readFileSync(new URL('../supabase/migrations/20261203_public_display_name.sql', import.meta.url), 'utf8');
  assert.match(names, /scoreboard_board\(p_period text/);
  assert.match(names, /daily_challenge_board\(p_level text\)/);
  assert.match(names, /position\('@' in pr\.display_name\) = 0/);
  assert.equal(names.includes('when not individual'), false);
  assert.match(names, /grant execute on function public\.scoreboard_board\(text\)/);
  assert.match(names, /grant execute on function public\.daily_challenge_board\(text\)/);
  const mail = readFileSync(new URL('../scoreboardEmailJob.ts', import.meta.url), 'utf8');
  assert.match(mail, /if \(name && !name\.includes\('@'\)\) return name\.slice\(0, 40\)/);
  const challenge = readFileSync(new URL('../components/DailyChallengePage.tsx', import.meta.url), 'utf8');
  assert.match(challenge, /challengeRank\(board\.rows\)/);
  assert.match(challenge, /result\.missing \|\| rankingMissing/);
  assert.match(challenge, /result\.missing \?/);
  const shell = readFileSync(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /individual onPress=\{\(\) => onNavigate\('\/profile'\)\}/);
  const nextSql = readFileSync(new URL('../supabase/migrations/20261125_scoreboard_periods.sql', import.meta.url), 'utf8');
  assert.match(nextSql, /yesterday/);
  assert.match(nextSql, /security definer/);
  assert.match(nextSql, /individual/);
  assert.equal(/update\s+public\.test_results/i.test(nextSql), false);
  const levelSql = readFileSync(new URL('../supabase/migrations/20261204_scoreboard_level.sql', import.meta.url), 'utf8');
  assert.match(levelSql, /scoreboard_board_level\(p_period text, p_level text\)/);
  assert.match(levelSql, /p_level not in \('B1', 'B2', 'C1'\)/);
  assert.match(levelSql, /when 'BEGINNER' then 'B1'/);
  assert.match(levelSql, /when 'ADVANCED' then 'C1'/);
  assert.match(levelSql, /individual/);
  assert.match(levelSql, /scoreboard_alias/);
  assert.match(levelSql, /grant execute on function public\.scoreboard_board_level\(text, text\)/);
  assert.equal(levelSql.includes('email'), false);
  assert.equal(/update\s+public\.test_results/i.test(levelSql), false);
  assert.match(levelSql, /Europe\/Madrid/);
  const loader = readFileSync(new URL('../scoreboardLoad.ts', import.meta.url), 'utf8');
  assert.equal(loader.includes('scoreboard_board_level'), false);
  assert.match(loader, /scoreboard_board/);
  assert.match(sql, /Europe\/Madrid/);
  assert.match(sql, /security definer/);
  assert.match(sql, /scoreboard_alias/);
  assert.equal(sql.includes('test_results'), true);
  assert.equal(/update\s+public\.test_results/i.test(sql), false);
  assert.equal(sql.includes('email'), false);
  assert.match(app, /displayName=\{account\.displayName\}/);
  assert.equal(app.includes('ScoreboardPage displayName={account.email}'), false);
});
