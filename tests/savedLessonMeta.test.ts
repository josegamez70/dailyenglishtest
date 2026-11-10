import test from 'node:test';
import assert from 'node:assert/strict';
import {
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

test('reading and listening stay capped at 5 while grammar has its own 5', () => {
  const practice = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `p${n}`, created_at: `2026-01-0${n}T00:00:00.000Z` }));
  const grammar = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `g${n}`, created_at: `2026-02-0${n}T00:00:00.000Z` }));
  const merged = mergeSavedLessons(practice, grammar);
  assert.equal(merged.length, 10);
  assert.deepEqual(merged.filter((row) => row.id.startsWith('p')).map((row) => row.id), ['p6', 'p5', 'p4', 'p3', 'p2']);
  assert.deepEqual(merged.filter((row) => row.id.startsWith('g')).map((row) => row.id), ['g6', 'g5', 'g4', 'g3', 'g2']);
  assert.equal(merged[0].id, 'g6');
  assert.equal(merged[merged.length - 1].id, 'p2');
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
