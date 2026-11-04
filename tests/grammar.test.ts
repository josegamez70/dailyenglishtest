import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGrammarPrompt,
  freshOrder,
  gradeChoice,
  gradeOrder,
  grammarTitle,
  normalizeGrammarSet,
  placeChunk,
  resetOrder,
  sameOrder,
  shuffleChunks,
  undoChunk,
  type GrammarChoice,
  type GrammarOrder,
  type GrammarRequest,
} from '../grammarSet.ts';

const blanksRequest: GrammarRequest = { level: 'B1', exercise: 'blanks', topic: 'present perfect' };
const orderRequest: GrammarRequest = { level: 'C1', exercise: 'order', topic: '' };

function choice(index: number, overrides: Partial<GrammarChoice> = {}) {
  return {
    prompt: `Sentence ${index} _____ here.`,
    options: [`right${index}`, `wrongA${index}`, `wrongB${index}`, `wrongC${index}`],
    correctAnswer: `right${index}`,
    explanation: `Reason ${index}.`,
    ...overrides,
  };
}

function tenChoices() {
  return { items: Array.from({ length: 10 }, (_, index) => choice(index + 1)) };
}

test('a grammar choice payload keeps 10 items and a one-line explanation', () => {
  const raw = tenChoices();
  raw.items[0] = choice(1, {
    prompt: '  She _____ there.\n',
    options: ['A. has gone', 'B) went', '(C) goes', 'D. going'],
    correctAnswer: 'has gone',
    explanation: '  Present perfect\nfor life experience.  ',
  });
  const result = normalizeGrammarSet(raw, blanksRequest);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.set.items.length, 10);
  assert.equal(result.set.title, 'Grammar: Fill in the blanks');
  assert.equal(result.set.topic, 'present perfect');
  const first = result.set.items[0];
  assert.equal(first.kind, 'choice');
  if (first.kind !== 'choice') return;
  assert.equal(first.prompt, 'She _____ there.');
  assert.deepEqual(first.options, ['has gone', 'went', 'goes', 'going']);
  assert.equal(first.correctAnswer, 'has gone');
  assert.equal(first.explanation, 'Present perfect for life experience.');
  assert.equal(first.explanation.includes('\n'), false);
});

test('choice items need a gap, four different options, and a matching answer', () => {
  const missingGap = normalizeGrammarSet({ items: Array.from({ length: 10 }, () => choice(1, { prompt: 'No gap here.' })) }, blanksRequest);
  assert.equal(missingGap.ok, false);
  const short = normalizeGrammarSet({ items: [choice(1)] }, blanksRequest);
  assert.equal(short.ok, false);
  if (short.ok) return;
  assert.match(short.problems[0], /Only 1/);
  const duplicates = normalizeGrammarSet({
    items: Array.from({ length: 10 }, () => choice(1, { options: ['same', 'same', 'other', 'third'], correctAnswer: 'same' })),
  }, blanksRequest);
  assert.equal(duplicates.ok, false);
  const mismatch = normalizeGrammarSet({
    items: Array.from({ length: 10 }, () => choice(1, { correctAnswer: 'not listed' })),
  }, blanksRequest);
  assert.equal(mismatch.ok, false);
});

const phrasalSets = [
  ['look after', 'look for', 'look up', 'get up'],
  ['give up', 'give back', 'turn off', 'turn on'],
  ['find out', 'point out', 'work out', 'sort out'],
  ['put off', 'put on', 'put away', 'put out'],
  ['come across', 'come back', 'go back', 'get back'],
  ['take off', 'take up', 'take on', 'take over'],
  ['break down', 'break up', 'calm down', 'slow down'],
  ['carry out', 'carry on', 'set up', 'set off'],
  ['run out of', 'get rid of', 'put up with', 'look forward to'],
  ['figure out', 'end up', 'show up', 'grow up'],
];

function tenPhrasals() {
  return {
    items: phrasalSets.map((options, index) => choice(index + 1, {
      prompt: `Please _____ the task ${index}.`,
      options,
      correctAnswer: options[0],
    })),
  };
}

test('phrasal verbs use the phrasal title and only real phrasal verbs', () => {
  const result = normalizeGrammarSet(tenPhrasals(), { level: 'C1', exercise: 'phrasal', topic: '  ' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.set.title, 'Grammar: Phrasal verbs');
  assert.equal(result.set.topic, '');
  assert.equal(grammarTitle('phrasal'), 'Grammar: Phrasal verbs');
  const invented = normalizeGrammarSet({
    items: Array.from({ length: 10 }, () => choice(1, {
      prompt: 'Do not _____ your judgment.',
      options: ['cloud over', 'look after', 'put off', 'give up'],
      correctAnswer: 'cloud over',
    })),
  }, { level: 'C1', exercise: 'phrasal', topic: '' });
  assert.equal(invented.ok, false);
});

test('extra valid items are cut to 10 and order parts must be 4 to 6 different chunks', () => {
  const extra = { items: Array.from({ length: 12 }, (_, index) => choice(index + 1)) };
  const trimmed = normalizeGrammarSet(extra, blanksRequest);
  assert.equal(trimmed.ok, true);
  if (!trimmed.ok) return;
  assert.equal(trimmed.set.items.length, 10);

  const good = normalizeGrammarSet({
    items: Array.from({ length: 10 }, (_, index) => ({
      prompt: '',
      chunks: [`One ${index}.`, `Two ${index}.`, `Three ${index}.`, `Four ${index}.`, `Five ${index}.`],
      explanation: `This is the order for item ${index}.`,
    })),
  }, orderRequest);
  assert.equal(good.ok, true);
  if (!good.ok) return;
  const first = good.set.items[0];
  assert.equal(first.kind, 'order');
  if (first.kind !== 'order') return;
  assert.equal(first.prompt, 'Put these parts in order.');
  assert.equal(first.chunks.length, 5);
  assert.equal(good.set.title, 'Grammar: Put in order');

  const tooFew = normalizeGrammarSet({
    items: Array.from({ length: 10 }, () => ({ chunks: ['A', 'B', 'C'], explanation: 'Too short.' })),
  }, orderRequest);
  assert.equal(tooFew.ok, false);
  const copies = normalizeGrammarSet({
    items: Array.from({ length: 10 }, () => ({ chunks: ['Same', 'same', 'Next', 'Last'], explanation: 'Copies.' })),
  }, orderRequest);
  assert.equal(copies.ok, false);
});

test('the prompt names the level, the exercise, and an optional topic', () => {
  const blanks = buildGrammarPrompt(blanksRequest);
  assert.match(blanks, /Level: B1/);
  assert.match(blanks, /present perfect/);
  assert.match(blanks, /for\/since/);
  assert.match(blanks, /_____/);
  assert.match(blanks, /that that/);
  const order = buildGrammarPrompt({ level: 'C1', exercise: 'order', topic: '' });
  assert.match(order, /Level: C1/);
  assert.match(order, /word/);
  assert.match(order, /Vary the items/);
  const paragraph = buildGrammarPrompt({ level: 'B1', exercise: 'order', topic: '' });
  assert.match(paragraph, /first, then, after that/);
});

test('gaps, doubled words, tense clashes, and repeated answers are rejected', () => {
  const wideGap = normalizeGrammarSet({
    items: [choice(1, { prompt: 'She _______ home yesterday.' }), ...tenChoices().items.slice(1)],
  }, blanksRequest);
  assert.equal(wideGap.ok, true);
  if (!wideGap.ok) return;
  const first = wideGap.set.items[0];
  assert.equal(first.kind, 'choice');
  if (first.kind !== 'choice') return;
  assert.equal(first.prompt, 'She _____ home yesterday.');

  const doubled = normalizeGrammarSet({
    items: Array.from({ length: 10 }, () => choice(1, {
      prompt: 'Only after the meeting _____ that I realized.',
      options: ['that', 'then', 'when', 'so'],
      correctAnswer: 'that',
    })),
  }, blanksRequest);
  assert.equal(doubled.ok, false);

  const mixed = normalizeGrammarSet({
    items: Array.from({ length: 10 }, () => choice(1, {
      prompt: 'What _____ was a better sense of time.',
      options: ['is needed', 'needed', 'needing', 'needs'],
      correctAnswer: 'is needed',
    })),
  }, { level: 'C1', exercise: 'blanks', topic: '' });
  assert.equal(mixed.ok, false);

  const twins = normalizeGrammarSet({
    items: Array.from({ length: 10 }, () => choice(1, {
      prompt: 'She said the meeting _____ .',
      options: ['has been postponed', 'had been postponed', 'postpones', 'postponing'],
      correctAnswer: 'had been postponed',
    })),
  }, { level: 'B2', exercise: 'blanks', topic: 'reported speech' });
  assert.equal(twins.ok, false);

  const repeated = normalizeGrammarSet({
    items: [
      choice(1),
      choice(1),
      ...Array.from({ length: 8 }, (_, index) => choice(index + 2)),
    ],
  }, blanksRequest);
  assert.equal(repeated.ok, true);
  if (!repeated.ok) return;
  const answers = repeated.set.items.map((item) => item.kind === 'choice' ? item.correctAnswer : '');
  assert.equal(new Set(answers).size, answers.length);
});

test('B1 order items are paragraphs with one logical order', () => {
  const paragraph = (index: number) => ({
    chunks: [
      `First she packed bag ${index}.`,
      `Then she locked the door ${index}.`,
      `After that she caught the bus ${index}.`,
      `Finally she arrived at work ${index}.`,
    ],
    explanation: `The morning happens in this order for ${index}.`,
  });
  const good = normalizeGrammarSet({
    items: Array.from({ length: 10 }, (_, index) => paragraph(index + 1)),
  }, { level: 'B1', exercise: 'order', topic: '' });
  assert.equal(good.ok, true);

  const movable = normalizeGrammarSet({
    items: Array.from({ length: 10 }, () => ({
      chunks: ['Yesterday', 'she', 'left', 'early.'],
      explanation: 'These words can move.',
    })),
  }, { level: 'B1', exercise: 'order', topic: '' });
  assert.equal(movable.ok, false);
});

test('shuffling hides the correct order and tapping supports undo and reset', () => {
  const chunks = ['First.', 'Second.', 'Third.', 'Fourth.'];
  const same = shuffleChunks(chunks, () => 0.999);
  assert.deepEqual(same.map((chunk) => chunk.text), ['Second.', 'First.', 'Third.', 'Fourth.']);
  const forced = shuffleChunks(chunks, () => 0);
  assert.deepEqual(forced.map((chunk) => chunk.id), ['c1', 'c2', 'c3', 'c0']);

  let state = freshOrder(forced);
  assert.equal(state.placed.length, 0);
  assert.equal(state.pool.length, 4);
  state = placeChunk(state, 'c0');
  state = placeChunk(state, 'missing');
  assert.deepEqual(state.placed, ['c0']);
  assert.equal(state.pool.some((chunk) => chunk.id === 'c0'), false);
  state = placeChunk(state, 'c1');
  state = undoChunk(state, forced);
  assert.deepEqual(state.placed, ['c0']);
  assert.deepEqual(state.pool.map((chunk) => chunk.id), ['c1', 'c2', 'c3']);
  state = undoChunk(state, forced);
  assert.deepEqual(resetOrder(forced), freshOrder(forced));
  assert.equal(sameOrder(['First.', 'Second.'], ['First.', 'Second.']), true);
  assert.equal(sameOrder(['Second.', 'First.'], ['First.', 'Second.']), false);
});

test('grading marks the chosen option and the tapped order', () => {
  const item: GrammarChoice = {
    kind: 'choice',
    prompt: 'She _____ yesterday.',
    options: ['went', 'goes', 'go', 'going'],
    correctAnswer: 'went',
    explanation: 'Yesterday needs the past simple.',
  };
  assert.equal(gradeChoice(item, 'went').correct, true);
  const wrong = gradeChoice(item, '');
  assert.equal(wrong.correct, false);
  assert.equal(wrong.userAnswer, '—');
  assert.equal(wrong.correctAnswer, 'went');

  const order: GrammarOrder = {
    kind: 'order',
    prompt: 'Put these parts in order.',
    chunks: ['I got up.', 'I had breakfast.', 'I left home.', 'I caught the bus.'],
    explanation: 'The morning happens in this order.',
  };
  assert.equal(gradeOrder(order, order.chunks).correct, true);
  const missed = gradeOrder(order, ['I left home.', 'I got up.']);
  assert.equal(missed.correct, false);
  assert.equal(missed.userAnswer, 'I left home. I got up.');
  assert.equal(missed.correctAnswer, order.chunks.join(' '));
});
