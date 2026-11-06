import test from 'node:test';
import assert from 'node:assert/strict';
import { savedLessonBadges, savedLessonLevelLabel } from '../savedLessonMeta.ts';

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
  assert.deepEqual(savedLessonBadges({ mode: 'grammar', format: 'other', level: '  ' }), []);
  assert.equal(savedLessonLevelLabel({ levelLabel: '  ', level: 'advanced' }), 'Advanced');
  assert.equal(savedLessonLevelLabel({ levelLabel: 'Intermediate', level: 'beginner' }), 'Intermediate');
});
