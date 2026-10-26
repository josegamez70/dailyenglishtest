import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanOptions, normalizeQuiz, resolveCorrectAnswer } from '../quizNormalize.ts';

const labeled = [
  'A. A Melody Makers',
  'B. B Talent Showcase',
  'C. C Via intense auditions',
  'D. D Final Night',
];

test('strips punctuated labels and a second capital letter prefix', () => {
  assert.deepEqual(cleanOptions(labeled), [
    'Melody Makers',
    'Talent Showcase',
    'Via intense auditions',
    'Final Night',
  ]);
});

test('strips letter-space labels that match the option position', () => {
  assert.deepEqual(cleanOptions([
    'A Melody Makers',
    'B Talent Showcase',
    'C Via intense auditions',
    'D Final Night',
  ]), [
    'Melody Makers',
    'Talent Showcase',
    'Via intense auditions',
    'Final Night',
  ]);
});

test('strips parenthesis and A) labels', () => {
  assert.deepEqual(cleanOptions([
    '(A) Melody Makers',
    'B) Talent Showcase',
    '(C) Via intense auditions',
    'D: Final Night',
  ]), [
    'Melody Makers',
    'Talent Showcase',
    'Via intense auditions',
    'Final Night',
  ]);
});

test('keeps a real English article when it is not a label pattern', () => {
  assert.deepEqual(cleanOptions([
    'A red bicycle',
    'The blue train',
    'The green boat',
    'The yellow car',
  ]), [
    'A red bicycle',
    'The blue train',
    'The green boat',
    'The yellow car',
  ]);
});

test('strips lowercase letter labels when most options are labeled', () => {
  assert.deepEqual(cleanOptions([
    'a melody makers',
    'b talent showcase',
    'c via intense auditions',
    'd final night',
  ]), [
    'melody makers',
    'talent showcase',
    'via intense auditions',
    'final night',
  ]);
});

test('maps a letter, a prefixed answer, and full text onto the cleaned option', () => {
  const options = cleanOptions(labeled);
  assert.equal(resolveCorrectAnswer('C', options), 'Via intense auditions');
  assert.equal(resolveCorrectAnswer('C. C Via intense auditions', options), 'Via intense auditions');
  assert.equal(resolveCorrectAnswer('Via intense auditions', options), 'Via intense auditions');
  assert.equal(resolveCorrectAnswer('(B)', options), 'Talent Showcase');
});

test('does not treat a normal answer that starts with a letter as option A', () => {
  const options = ['Morning practice', 'A short break', 'The evening show', 'A long trip'];
  const cleaned = cleanOptions(options);
  assert.equal(resolveCorrectAnswer('Auditions were intense', cleaned), 'Auditions were intense');
  assert.notEqual(resolveCorrectAnswer('Auditions were intense', cleaned), cleaned[0]);
});

test('normalizeQuiz keeps explanations and matches the cleaned correct answer', () => {
  const [question] = normalizeQuiz([{
    question: 'How did the band get in?',
    options: labeled,
    correctAnswer: 'C. C Via intense auditions',
    explanation: 'The story says they passed intense auditions.',
    supportingSentence: 'They got in via intense auditions.',
  }]);
  assert.equal(question.options[2], 'Via intense auditions');
  assert.equal(question.correctAnswer, 'Via intense auditions');
  assert.equal(question.explanation, 'The story says they passed intense auditions.');
  assert.equal(question.supportingSentence, 'They got in via intense auditions.');
  assert.equal(question.correctAnswer, question.options[2]);
});

test('cleaning twice does not change the options again', () => {
  const once = cleanOptions(labeled);
  assert.deepEqual(cleanOptions(once), once);
});
