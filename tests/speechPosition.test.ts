import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeWordIndex, textFromWordIndex } from '../speechPosition.ts';

const words = ['Mia', 'left.', 'She', 'walked', 'to', 'school.', 'The', 'bell', 'rang.'];

test('resume uses the sentence that contains the paused word', () => {
  assert.equal(resumeWordIndex(words, 0, 9000), 0);
  assert.equal(resumeWordIndex(words, 1000, 9000), 0);
  assert.equal(resumeWordIndex(words, 4000, 9000), 2);
  assert.equal(resumeWordIndex([], 4000, 9000), 0);
  assert.equal(resumeWordIndex(words, 4000, 0), 0);
});

test('remaining speech starts at the chosen word', () => {
  assert.equal(textFromWordIndex(words, 2), 'She walked to school. The bell rang.');
  assert.equal(textFromWordIndex(words, 0), words.join(' '));
  assert.equal(textFromWordIndex(words, 99), '');
});
