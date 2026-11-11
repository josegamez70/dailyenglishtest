import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterSavedLessons,
  grammarLessonRecord,
  mergeSavedLessons,
  parseSavedGrammarLesson,
  savedLessonBadges,
  savedLessonLevelLabel,
} from '../savedLessonMeta.ts';

test('saved lesson badges use the reading, audio, text, and dialogue labels', () => {
  assert.deepEqual(savedLessonBadges({
    mode: 'reading',
    format: 'text',
    level: 'beginner',
    levelLabel: 'Beginner',
  }), [
    { kind: 'mode', label: 'Reading' },
    { kind: 'format', label: 'Text' },
    { kind: 'level', label: 'Beginner' },
  ]);
  assert.deepEqual(savedLessonBadges({
    mode: 'listening',
    format: 'text',
    level: 'intermediate',
  }), [
    { kind: 'mode', label: 'Audio' },
    { kind: 'format', label: 'Text' },
    { kind: 'level', label: 'Intermediate' },
  ]);
  assert.deepEqual(savedLessonBadges({
    mode: 'listening',
    format: 'dialogue',
    levelLabel: 'B1',
  }), [
    { kind: 'mode', label: 'Audio' },
    { kind: 'format', label: 'Dialogue' },
    { kind: 'level', label: 'B1' },
  ]);
  assert.deepEqual(savedLessonBadges({
    mode: 'reading',
    format: 'dialogue',
    level: 'C1',
  }), [
    { kind: 'mode', label: 'Reading' },
    { kind: 'format', label: 'Dialogue' },
    { kind: 'level', label: 'C1' },
  ]);
});

test('a saved lesson with no mode, format, or level adds no badges', () => {
  assert.deepEqual(savedLessonBadges({ story: 'Hello' }), []);
  assert.deepEqual(savedLessonBadges({ mode: 'grammar', format: 'other', level: '  ' }), [
    { kind: 'mode', label: 'Grammar' },
  ]);
  assert.equal(savedLessonLevelLabel({ levelLabel: '  ', level: 'advanced' }), 'Advanced');
  assert.equal(savedLessonLevelLabel({ levelLabel: 'Intermediate', level: 'beginner' }), 'Intermediate');
});

test('grammar saves show Grammar, the exercise, and the level', () => {
  assert.deepEqual(savedLessonBadges({
    mode: 'grammar',
    exercise: 'phrasal',
    level: 'B1',
    levelLabel: 'B1',
  }), [
    { kind: 'mode', label: 'Grammar' },
    { kind: 'subtype', label: 'Phrasal' },
    { kind: 'level', label: 'B1' },
  ]);
  assert.deepEqual(savedLessonBadges({
    mode: 'grammar',
    exercise: 'blanks',
    level: 'B2',
  }), [
    { kind: 'mode', label: 'Grammar' },
    { kind: 'subtype', label: 'Blanks' },
    { kind: 'level', label: 'B2' },
  ]);
  assert.deepEqual(savedLessonBadges({
    mode: 'grammar',
    title: 'Grammar: Put in order',
    levelLabel: 'C1',
  }), [
    { kind: 'mode', label: 'Grammar' },
    { kind: 'subtype', label: 'Order' },
    { kind: 'level', label: 'C1' },
  ]);
});

test('reading and listening stay capped at 10 while grammar has its own 10', () => {
  const dated = (prefix: string, month: string, count: number) => Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return { id: `${prefix}${n}`, created_at: `2026-${month}-${String(n).padStart(2, '0')}T00:00:00.000Z` };
  });
  const practice = dated('p', '01', 12);
  const grammar = dated('g', '02', 12);
  const merged = mergeSavedLessons(practice, grammar);
  assert.equal(merged.length, 20);
  assert.deepEqual(
    merged.filter((row) => row.id.startsWith('p')).map((row) => row.id),
    ['p12', 'p11', 'p10', 'p9', 'p8', 'p7', 'p6', 'p5', 'p4', 'p3'],
  );
  assert.deepEqual(
    merged.filter((row) => row.id.startsWith('g')).map((row) => row.id),
    ['g12', 'g11', 'g10', 'g9', 'g8', 'g7', 'g6', 'g5', 'g4', 'g3'],
  );
  assert.equal(merged[0].id, 'g12');
  assert.equal(merged[merged.length - 1].id, 'p3');
});

test('the database migration raises both saved-item caps to 10 and does not delete rows', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261111_saved_limit_10.sql', import.meta.url), 'utf8');
  assert.equal(sql.match(/limit 10/g)?.length, 2);
  assert.equal(sql.includes('limit 5'), false);
  assert.match(sql, /keep_latest_saved_lessons/);
  assert.match(sql, /keep_latest_saved_grammar/);
  assert.match(sql, /does not delete existing rows/i);
});

test('filters separate reading, listening, and grammar and keep rows with no mode in All', () => {
  const rows = [
    { id: 'r', lesson: { mode: 'reading' } },
    { id: 'l', lesson: { mode: 'listening' } },
    { id: 'g', lesson: { mode: 'grammar' } },
    { id: 'old', lesson: { story: 'Hello' } },
  ];
  assert.deepEqual(filterSavedLessons(rows, 'all').map((row) => row.id), ['r', 'l', 'g', 'old']);
  assert.deepEqual(filterSavedLessons(rows, 'reading').map((row) => row.id), ['r']);
  assert.deepEqual(filterSavedLessons(rows, 'listening').map((row) => row.id), ['l']);
  assert.deepEqual(filterSavedLessons(rows, 'grammar').map((row) => row.id), ['g']);
});

test('a saved grammar set round-trips and can be opened with the learner answers', () => {
  const stored = grammarLessonRecord({
    level: 'B1',
    exercise: 'phrasal',
    topic: 'travel',
    title: 'Grammar: Phrasal verbs',
    items: [{
      kind: 'choice',
      prompt: 'She _____ the bus because it was full.',
      options: ['got off', 'got over', 'got by', 'got along'],
      correctAnswer: 'got off',
      explanation: 'Got off means she left the bus.',
    }],
    grades: [{
      prompt: 'She _____ the bus because it was full.',
      correct: false,
      userAnswer: 'got over',
      correctAnswer: 'got off',
      explanation: 'Got off means she left the bus.',
    }],
  });
  const parsed = parseSavedGrammarLesson(stored);
  assert.equal(parsed?.level, 'B1');
  assert.equal(parsed?.exercise, 'phrasal');
  assert.equal(parsed?.topic, 'travel');
  assert.equal(parsed?.grades?.[0].userAnswer, 'got over');
  assert.equal(parsed?.grades?.[0].correctAnswer, 'got off');
  assert.equal(parseSavedGrammarLesson({ mode: 'reading', story: 'Hello' }), null);
  assert.equal(parseSavedGrammarLesson({
    mode: 'grammar',
    level: 'B2',
    exercise: 'order',
    items: [{ kind: 'choice', prompt: 'x', options: ['a', 'b', 'c', 'd'], correctAnswer: 'a', explanation: 'n' }],
  }), null);
});
