import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readingBankLengthFits, readingBankLevel, readingBankQuery, readingChallengeIndex, readingLessonFromBankPayload } from '../exerciseBank.ts';

test('reading practice uses the bank for a list topic and leaves dialogue and custom topics live', () => {
  assert.equal(readingBankLevel('Beginner'), 'B1');
  assert.equal(readingBankLevel('Intermediate'), 'B2');
  assert.equal(readingBankLevel('Advanced'), 'C1');
  assert.deepEqual(readingBankQuery({ customTopic: '', topic: 'Daily Life', format: 'text' }), { bank: true, topic: 'daily life' });
  assert.deepEqual(readingBankQuery({ customTopic: '', topic: 'Any topic', format: 'text' }), { bank: true, topic: null });
  assert.equal(readingBankQuery({ customTopic: 'glasshouses', topic: 'Daily Life', format: 'text' }).bank, false);
  assert.equal(readingBankQuery({ customTopic: '', topic: 'Daily Life', format: 'dialogue' }).bank, false);
  const lesson = readingLessonFromBankPayload({
    mode: 'reading',
    format: 'text',
    topic: 'Daily Life',
    title: 'The Lost House Key',
    story: 'Marta locked the door.',
    vocabulary: Array.from({ length: 6 }, (_, index) => ({ word: `word${index}`, definition: 'a meaning' })),
    quiz: Array.from({ length: 5 }, () => ({
      question: 'Where was the key?',
      options: ['pocket', 'bag', 'floor', 'shop'],
      correctAnswer: 'pocket',
      explanation: 'It was in the pocket.',
      supportingSentence: 'Marta locked the door.',
    })),
  }, 'daily life');
  assert.equal(lesson?.quiz.length, 5);
  assert.equal(lesson?.quiz[0].correctAnswer, 'pocket');
  assert.equal(lesson?.wordCount, 4);
  const stored = readingLessonFromBankPayload({
    mode: 'reading',
    format: 'text',
    topic: 'Daily Life',
    title: 'The Lost House Key',
    wordCount: 220,
    story: 'Marta locked the door.',
    vocabulary: Array.from({ length: 6 }, (_, index) => ({ word: `word${index}`, definition: 'a meaning' })),
    quiz: Array.from({ length: 5 }, () => ({
      question: 'Where was the key?',
      options: ['pocket', 'bag', 'floor', 'shop'],
      correctAnswer: 'pocket',
      explanation: 'It was in the pocket.',
      supportingSentence: 'Marta locked the door.',
    })),
  }, 'daily life');
  assert.equal(stored?.wordCount, 220);
});

test('reading bank serves only when the stored length is within 20 percent', () => {
  assert.equal(readingBankLengthFits(60, 220), false);
  assert.equal(readingBankLengthFits(140, 230), false);
  assert.equal(readingBankLengthFits(220, 202), true);
  assert.equal(readingBankLengthFits(220, 240), true);
  assert.equal(readingBankLengthFits(220, 176), true);
  assert.equal(readingBankLengthFits(220, 175), false);
  assert.equal(readingBankLengthFits(220, 264), true);
  assert.equal(readingBankLengthFits(220, 265), false);
  assert.equal(readingBankLengthFits(330, 320), true);
  assert.equal(readingBankLengthFits(430, 440), true);
  const generate = readFileSync(new URL('../api/generate.ts', import.meta.url), 'utf8');
  assert.match(generate, /readingBankLengthFits/);
  assert.match(generate, /releaseGrammarBankItem/);
  assert.match(generate, /producePractice/);
  assert.match(generate, /claim_reading_bank_for_length|minWords/);
  const challenge = readFileSync(new URL('../api/daily-challenge.ts', import.meta.url), 'utf8');
  assert.match(challenge, /readingWordCount\(row\) >= 200/);
});

test('the challenge index matches the claim function and skips today and tomorrow', () => {
  assert.equal(readingChallengeIndex('2026-11-18', 'B1', 60), 49);
  assert.ok(readingChallengeIndex('2026-11-18', 'B1', 60) >= 0);
  assert.ok(readingChallengeIndex('2026-11-18', 'B1', 60) < 60);
  assert.notEqual(
    readingChallengeIndex('2026-11-18', 'B1', 60),
    readingChallengeIndex('2026-11-19', 'B1', 60),
  );
  const sql = readFileSync(new URL('../supabase/migrations/20261128_reading_bank_claim.sql', import.meta.url), 'utf8');
  const generate = readFileSync(new URL('../api/generate.ts', import.meta.url), 'utf8');
  assert.match(sql, /claim_reading_bank_item/);
  assert.match(sql, /Europe\/Madrid/);
  assert.match(sql, /md5\(days\.day \|\| '\|' \|\| reading_level \|\| '\|reading'\)/);
  assert.match(sql, /revoke all on function public\.claim_reading_bank_item/);
  assert.match(sql, /grant execute on function public\.claim_reading_bank_item\(uuid, text, text\) to service_role/);
  assert.equal(/update\s+public\.test_results/i.test(sql), false);
  assert.match(generate, /createReadingLesson/);
  assert.match(generate, /reading_bank/);
  const produceAt = generate.indexOf('export async function producePractice');
  const readingAt = generate.indexOf('createReadingLesson');
  assert.ok(produceAt > 0);
  assert.ok(readingAt > produceAt);
});
