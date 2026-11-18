import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bankRow, loadPieces, TOPICS, validatePiece } from '../scripts/reading-bank-lib.mjs';

test('the frozen reading bank has sixty original pieces at each level', async () => {
  const pieces = await loadPieces(new URL('../data/reading-bank/', import.meta.url).pathname);
  const counts = { B1: 0, B2: 0, C1: 0 };
  const titles = new Set();
  const hashes = new Set();
  for (const piece of pieces) {
    const problems = validatePiece(piece, piece.file);
    assert.deepEqual(problems, [], problems.join('\n'));
    counts[piece.level] += 1;
    const titleKey = `${piece.level}:${piece.title.trim().toLowerCase()}`;
    assert.equal(titles.has(titleKey), false, titleKey);
    titles.add(titleKey);
    const row = bankRow(piece);
    assert.equal(hashes.has(row.hash), false);
    hashes.add(row.hash);
    assert.equal(row.payload.quiz.length, 5);
    assert.equal(TOPICS.includes(piece.topic), true);
  }
  assert.deepEqual(counts, { B1: 60, B2: 60, C1: 60 });
  const sql = readFileSync(new URL('../supabase/migrations/20261127_reading_bank.sql', import.meta.url), 'utf8');
  assert.match(sql, /kind <> 'reading'/);
  assert.equal(sql.includes('gemini'), false);
  assert.equal(/update\s+public\.test_results/i.test(sql), false);
});
