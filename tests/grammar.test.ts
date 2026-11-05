import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGrammarPrompt,
  buildGrammarTopUpPrompt,
  freshOrder,
  GRAMMAR_GENERATION_COUNT,
  GRAMMAR_ITEM_COUNT,
  GRAMMAR_MIN_ITEMS,
  gradeChoice,
  gradeOrder,
  grammarTitle,
  normalizeGrammarSet,
  placeChunk,
  REAL_PHRASAL_COUNT,
  resetOrder,
  sameOrder,
  shuffleChoiceOptions,
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

test('a grammar choice payload keeps 6 items and a one-line explanation', () => {
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
  assert.equal(GRAMMAR_ITEM_COUNT, 6);
  assert.equal(GRAMMAR_MIN_ITEMS, 4);
  assert.equal(result.set.items.length, GRAMMAR_ITEM_COUNT);
  assert.equal(result.set.title, 'Grammar: Fill in the blanks');
  assert.equal(result.set.topic, 'present perfect');
  const first = result.set.items[0];
  assert.equal(first.kind, 'choice');
  if (first.kind !== 'choice') return;
  assert.equal(first.prompt, 'She _____ there.');
  assert.deepEqual([...first.options].sort(), ['goes', 'going', 'has gone', 'went']);
  assert.equal(first.options.includes(first.correctAnswer), true);
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
  ['look after', 'look for', 'look up', 'look into'],
  ['give up', 'give back', 'give in', 'give away'],
  ['put off', 'put on', 'put away', 'put out'],
  ['take off', 'take up', 'take on', 'take over'],
  ['turn off', 'turn on', 'turn up', 'turn down'],
  ['break down', 'break up', 'break in', 'break out'],
  ['come back', 'come in', 'come across', 'come on'],
  ['get up', 'get on', 'get off', 'get over'],
  ['go out', 'go back', 'go on', 'go over'],
  ['run out', 'run into', 'run off', 'run out of'],
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
  const malformed = normalizeGrammarSet({
    items: [
      choice(99, {
        prompt: 'I _____ my homework an hour ago.',
        options: ['finish', 'finished', 'have finished', 'finishing'],
        correctAnswer: 'finished',
      }),
      ...tenPhrasals().items.slice(1),
    ],
  }, { level: 'C1', exercise: 'phrasal', topic: '' });
  assert.equal(malformed.ok, true);
  if (!malformed.ok) return;
  assert.equal(malformed.set.items.some((item) => item.kind === 'choice' && item.correctAnswer === 'finished'), false);
  assert.equal(malformed.set.items.length, GRAMMAR_ITEM_COUNT);
});

test('extra valid items are cut to 6 and order parts must be 4 to 6 different chunks', () => {
  const extra = { items: Array.from({ length: 12 }, (_, index) => choice(index + 1)) };
  const trimmed = normalizeGrammarSet(extra, blanksRequest);
  assert.equal(trimmed.ok, true);
  if (!trimmed.ok) return;
  assert.equal(trimmed.set.items.length, GRAMMAR_ITEM_COUNT);

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
  assert.equal(GRAMMAR_GENERATION_COUNT, 9);
  assert.ok(REAL_PHRASAL_COUNT >= 300);
  assert.match(blanks, /Make exactly 9 items/);
  assert.match(blanks, /across the 9 items/);
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
  assert.match(paragraph, /morning routine/);
  assert.match(paragraph, /Do not always use First/);
  const upper = buildGrammarPrompt({ level: 'B2', exercise: 'order', topic: '' });
  assert.match(upper, /reported speech/);
  assert.match(upper, /relative clauses/);
  const advanced = buildGrammarPrompt({ level: 'C1', exercise: 'order', topic: '' });
  assert.match(advanced, /pronoun/);
  assert.match(blanks, /going to/);
  assert.match(blanks, /that" and "who"/);
  assert.match(blanks, /could" and "might"/);
  const c1Blanks = buildGrammarPrompt({ level: 'C1', exercise: 'blanks', topic: '' });
  assert.match(c1Blanks, /cleft sentences/);
  assert.match(c1Blanks, /mixed conditionals/);
  assert.match(c1Blanks, /Not only/);
  assert.match(blanks, /any common variety of English/);
  assert.match(blanks, /She suggested/);
  assert.match(blanks, /might have/);
  assert.match(blanks, /already, just, or yet/);
  assert.match(blanks, /somewhat, slightly/);
  assert.match(blanks, /Do not leave it first every time/);
  assert.equal(order.includes('Do not leave it first every time'), false);
  const phrasal = buildGrammarPrompt({ level: 'C1', exercise: 'phrasal', topic: '' });
  assert.match(phrasal, /same verb/);
  assert.match(phrasal, /gloss up/);
  assert.match(phrasal, /at most two/);
  assert.match(phrasal, /call in/);
  assert.match(phrasal, /gloss over/);
  assert.match(phrasal, /stave off/);
  assert.match(phrasal, /Do not use basic B1/);
  assert.match(phrasal, /Put off a meeting/);
  assert.match(phrasal, /Variation seed/);
  assert.match(phrasal, /two other real phrasal verbs/);
  assert.match(phrasal, /Do not leave it first every time/);
  const b2Phrasal = buildGrammarPrompt({ level: 'B2', exercise: 'phrasal', topic: '' });
  assert.match(b2Phrasal, /come up with/);
  assert.match(b2Phrasal, /put up with/);
  assert.match(b2Phrasal, /run out of/);
  assert.match(b2Phrasal, /turn down \(an offer\)/);
  assert.match(c1Blanks, /Hardly had I entered/);
  assert.match(c1Blanks, /Variation seed/);
  assert.match(paragraph, /until the crust was golden brown/);
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

  const tense = normalizeGrammarSet({
    items: [
      choice(20, {
        prompt: 'I _____ my homework an hour ago.',
        options: ['finish', 'finished', 'have finished', 'finishing'],
        correctAnswer: 'finished',
      }),
      ...tenChoices().items.slice(1, 6),
    ],
  }, blanksRequest);
  assert.equal(tense.ok, true);
  if (!tense.ok) return;
  assert.equal(tense.set.items.some((item) => item.kind === 'choice' && item.correctAnswer === 'finished'), true);
  assert.equal(normalizeGrammarSet({ items: tenChoices().items.slice(0, GRAMMAR_MIN_ITEMS) }, blanksRequest).ok, true);
  const belowMinimum = normalizeGrammarSet({ items: tenChoices().items.slice(0, GRAMMAR_MIN_ITEMS - 1) }, blanksRequest);
  assert.equal(belowMinimum.ok, false);
  if (!belowMinimum.ok) assert.match(belowMinimum.problems[0], /Need at least 4/);

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

  const ambiguous = (item: ReturnType<typeof choice>) => normalizeGrammarSet({
    items: [item, ...tenChoices().items.slice(1)],
  }, blanksRequest);
  const suggested = ambiguous(choice(30, {
    prompt: 'She suggested _____ to the restaurant.',
    options: ['going', 'we go', 'to go', 'gone'],
    correctAnswer: 'going',
  }));
  assert.equal(suggested.ok, true);
  if (!suggested.ok) return;
  assert.equal(suggested.set.items.some((item) => item.kind === 'choice' && item.prompt.includes('suggested')), false);

  const modals = ambiguous(choice(31, {
    prompt: 'You _____ told me you were struggling.',
    options: ['might have', 'could have', 'told', 'telling'],
    correctAnswer: 'might have',
  }));
  assert.equal(modals.ok, true);
  if (!modals.ok) return;
  assert.equal(modals.set.items.some((item) => item.kind === 'choice' && item.correctAnswer === 'might have'), false);

  const forced = ambiguous(choice(32, {
    prompt: 'You were supposed to _____ told me earlier.',
    options: ['should have', 'could have', 'must', 'can'],
    correctAnswer: 'should have',
  }));
  assert.equal(forced.ok, true);
  if (!forced.ok) return;
  assert.equal(forced.set.items.some((item) => item.kind === 'choice' && item.correctAnswer === 'should have'), true);

  const cleft = ambiguous(choice(33, {
    prompt: 'It was the manager _____ hired me.',
    options: ['that', 'who', 'when', 'where'],
    correctAnswer: 'who',
  }));
  assert.equal(cleft.ok, true);
  if (!cleft.ok) return;
  assert.equal(cleft.set.items.some((item) => item.kind === 'choice' && item.prompt.startsWith('It was')), false);

  const degrees = ambiguous(choice(34, {
    prompt: 'The soup was _____ hot.',
    options: ['somewhat', 'slightly', 'rather', 'boiling'],
    correctAnswer: 'somewhat',
  }));
  assert.equal(degrees.ok, true);
  if (!degrees.ok) return;
  assert.equal(degrees.set.items.some((item) => item.kind === 'choice' && item.correctAnswer === 'somewhat'), false);

  const plans = ambiguous(choice(35, {
    prompt: 'She _____ visit her aunt tomorrow.',
    options: ['will', 'is going to', 'must', 'can'],
    correctAnswer: 'will',
  }));
  assert.equal(plans.ok, true);
  if (!plans.ok) return;
  assert.equal(plans.set.items.some((item) => item.kind === 'choice' && item.correctAnswer === 'will'), false);

  const near = normalizeGrammarSet({
    items: [
      choice(40, {
        prompt: 'Please _____ the meeting.',
        options: ['put off', 'make out', 'catch on to', 'iron out'],
        correctAnswer: 'put off',
      }),
      ...tenPhrasals().items.slice(0, 6),
    ],
  }, { level: 'C1', exercise: 'phrasal', topic: '' });
  assert.equal(near.ok, true);
  if (!near.ok) return;
  assert.equal(near.set.items.some((item) => item.kind === 'choice' && item.options.includes('make out')), false);

  const invented = normalizeGrammarSet({
    items: [
      choice(41, {
        prompt: 'She tried to _____ a reason.',
        options: ['gloss up', 'gloss off', 'gloss out', 'dream off'],
        correctAnswer: 'gloss up',
      }),
      ...tenPhrasals().items.slice(0, 6),
    ],
  }, { level: 'C1', exercise: 'phrasal', topic: '' });
  assert.equal(invented.ok, true);
  if (!invented.ok) return;
  assert.equal(invented.set.items.some((item) => item.kind === 'choice' && item.options.includes('gloss up')), false);

  const threePlusOne = normalizeGrammarSet({
    items: [
      choice(42, {
        prompt: 'Please _____ the visit.',
        options: ['put off', 'put on', 'put out', 'look after'],
        correctAnswer: 'put off',
      }),
      ...tenPhrasals().items.slice(0, 6),
    ],
  }, { level: 'B1', exercise: 'phrasal', topic: '' });
  assert.equal(threePlusOne.ok, true);
  if (!threePlusOne.ok) return;
  assert.equal(threePlusOne.set.items.some((item) => item.kind === 'choice' && item.correctAnswer === 'put off'), true);

  const repeatedVerb = ['put off', 'put on', 'put out'].map((answer, index) => choice(60 + index, {
    prompt: `Please _____ plan ${index}.`,
    options: ['put off', 'put on', 'put out', 'put away'],
    correctAnswer: answer,
  }));
  const capped = normalizeGrammarSet({
    items: [...repeatedVerb, ...tenPhrasals().items.filter((item) => item.correctAnswer !== 'put off').slice(0, 6)],
  }, { level: 'B2', exercise: 'phrasal', topic: '' });
  assert.equal(capped.ok, true);
  if (!capped.ok) return;
  const putItems = capped.set.items.filter((item) => item.kind === 'choice' && item.options.includes('put away'));
  assert.equal(putItems.length, 2);
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

  const fragment = normalizeGrammarSet({
    items: Array.from({ length: 10 }, (_, index) => ({
      chunks: [
        `First she mixed the filling ${index}.`,
        `Then she rolled the pastry ${index}.`,
        'Until the crust was golden brown.',
        `Finally she served the pie ${index}.`,
      ],
      explanation: `The pie steps stay in this order for ${index}.`,
    })),
  }, { level: 'B1', exercise: 'order', topic: '' });
  assert.equal(fragment.ok, false);
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

test('five passing items are kept and a top-up merges without repeating them', () => {
  const five = normalizeGrammarSet({ items: tenChoices().items.slice(0, 5) }, blanksRequest);
  assert.equal(five.ok, true);
  if (!five.ok) return;
  assert.equal(five.set.items.length, 5);

  const first = normalizeGrammarSet({ items: tenChoices().items.slice(0, 4) }, blanksRequest);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const merged = normalizeGrammarSet({
    items: [choice(1), choice(5), choice(6), choice(7)],
  }, blanksRequest, { kept: first.set.items });
  assert.equal(merged.ok, true);
  if (!merged.ok) return;
  assert.equal(merged.set.items.length, GRAMMAR_ITEM_COUNT);
  const answers = merged.set.items.map((item) => item.kind === 'choice' ? item.correctAnswer : '');
  assert.equal(new Set(answers).size, GRAMMAR_ITEM_COUNT);
  assert.equal(answers.includes('right1'), true);

  const keptOnly = normalizeGrammarSet(null, blanksRequest, { kept: first.set.items });
  assert.equal(keptOnly.ok, true);
  if (!keptOnly.ok) return;
  assert.equal(keptOnly.set.items.length, 4);

  const topUp = buildGrammarTopUpPrompt(
    { level: 'B2', exercise: 'phrasal', topic: '' },
    2,
    [{
      kind: 'choice',
      prompt: 'Please _____ the meeting.',
      options: ['put off', 'put on', 'put out', 'put away'],
      correctAnswer: 'put off',
      explanation: 'Delay it.',
    }],
  );
  assert.match(topUp, /Make exactly 2 items/);
  assert.match(topUp, /Please _____ the meeting/);
  assert.match(topUp, /Do not use these base verbs again: put/);
});

test('B2 and C1 phrasals stay when the option group is valid', () => {
  const phrasal = { level: 'C1' as const, exercise: 'phrasal' as const, topic: '' };
  const accepted = normalizeGrammarSet({
    items: [
      choice(1, {
        prompt: 'They could only _____ as the parade passed.',
        options: ['look on', 'look up', 'come over', 'get through'],
        correctAnswer: 'look on',
      }),
      choice(2, {
        prompt: 'The team _____ a serious obstacle.',
        options: ['run up against', 'run out of', 'run into', 'come up with'],
        correctAnswer: 'run up against',
      }),
      choice(3, {
        prompt: 'She _____ the deal at the last minute.',
        options: ['brought off', 'brought about', 'brought up', 'brought in'],
        correctAnswer: 'brought off',
      }),
      choice(4, {
        prompt: 'We need to _____ a compromise.',
        options: ['hammer out', 'hammer away', 'iron out', 'gloss over'],
        correctAnswer: 'hammer out',
      }),
      choice(5, {
        prompt: 'Please _____ the report tonight.',
        options: ['turn in', 'turn down', 'come over', 'get through'],
        correctAnswer: 'turn in',
      }),
      choice(6, {
        prompt: 'They tried to _____ a reason.',
        options: ['snarfle up', 'snarfle off', 'snarfle out', 'look after'],
        correctAnswer: 'snarfle up',
      }),
    ],
  }, phrasal);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  const answers = accepted.set.items.map((item) => item.kind === 'choice' ? item.correctAnswer : '');
  assert.equal(answers.includes('look on'), true);
  assert.equal(answers.includes('run up against'), true);
  assert.equal(answers.includes('brought off'), true);
  assert.equal(answers.includes('hammer out'), true);
  assert.equal(answers.includes('turn in'), true);
  assert.equal(answers.includes('snarfle up'), true);

  const unrelated = normalizeGrammarSet({
    items: [
      choice(7, {
        prompt: 'We tried to _____ the issue.',
        options: ['come over', 'get through', 'turn in', 'bring off'],
        correctAnswer: 'come over',
      }),
      ...tenPhrasals().items.slice(0, 6),
    ],
  }, phrasal);
  assert.equal(unrelated.ok, true);
  if (!unrelated.ok) return;
  assert.equal(unrelated.set.items.some((item) => item.kind === 'choice' && item.correctAnswer === 'come over'), false);
});

test('C1 keeps advanced phrasals ahead of basic ones when the pool is longer than 6', () => {
  const phrasal = { level: 'C1' as const, exercise: 'phrasal' as const, topic: '' };
  const result = normalizeGrammarSet({
    items: [
      choice(1, {
        prompt: 'The change will _____ a new policy.',
        options: ['bring about', 'bring off', 'bring up', 'bring in'],
        correctAnswer: 'bring about',
      }),
      choice(2, {
        prompt: 'They had to _____ a deal.',
        options: ['hammer out', 'hammer away', 'iron out', 'gloss over'],
        correctAnswer: 'hammer out',
      }),
      choice(3, {
        prompt: 'The plan _____ a legal limit.',
        options: ['run up against', 'run out of', 'run into', 'come up with'],
        correctAnswer: 'run up against',
      }),
      choice(4, {
        prompt: 'The firm will _____ the debt.',
        options: ['write off', 'write down', 'write up', 'write out'],
        correctAnswer: 'write off',
      }),
      choice(5, {
        prompt: 'She _____ a difficult rescue.',
        options: ['brought off', 'brought about', 'brought up', 'brought in'],
        correctAnswer: 'brought off',
      }),
      choice(6, {
        prompt: 'He tried to _____ her views.',
        options: ['sound out', 'stave off', 'bring about', 'bring off'],
        correctAnswer: 'sound out',
      }),
      choice(7, {
        prompt: 'Let us _____ the meeting.',
        options: ['put off', 'put on', 'put out', 'put away'],
        correctAnswer: 'put off',
      }),
      choice(8, {
        prompt: 'I _____ at six.',
        options: ['get up', 'get on', 'get off', 'get over'],
        correctAnswer: 'get up',
      }),
    ],
  }, phrasal);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.set.items.length, GRAMMAR_ITEM_COUNT);
  const answers = result.set.items.map((item) => item.kind === 'choice' ? item.correctAnswer : '');
  assert.equal(answers.includes('bring about'), true);
  assert.equal(answers.includes('sound out'), true);
  assert.equal(answers.includes('put off'), false);
  assert.equal(answers.includes('get up'), false);
});

test('shuffling a choice keeps the correct text on the new letter', () => {
  const item: GrammarChoice = {
    kind: 'choice',
    prompt: 'She _____ yesterday.',
    options: ['went', 'goes', 'go', 'going'],
    correctAnswer: 'went',
    explanation: 'Yesterday needs the past simple.',
  };
  const stayed = shuffleChoiceOptions(item, () => 0.999);
  assert.deepEqual(stayed.options, ['went', 'goes', 'go', 'going']);
  assert.equal(stayed.options.indexOf(stayed.correctAnswer), 0);

  const moved = shuffleChoiceOptions(item, () => 0);
  assert.deepEqual(moved.options, ['goes', 'go', 'going', 'went']);
  assert.equal(moved.correctAnswer, 'went');
  assert.equal(moved.options.indexOf(moved.correctAnswer), 3);
  assert.equal(String.fromCharCode(65 + moved.options.indexOf(moved.correctAnswer)), 'D');
  assert.equal(gradeChoice(moved, moved.options[3]).correct, true);
  assert.equal(gradeChoice(moved, moved.options[0]).correct, false);
});

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

test('blanks and phrasals spread the correct option across A B C and D', () => {
  const requests: { request: GrammarRequest; raw: () => { items: ReturnType<typeof choice>[] } }[] = [
    { request: blanksRequest, raw: () => tenChoices() },
    { request: { level: 'B2', exercise: 'phrasal', topic: '' }, raw: () => tenPhrasals() },
  ];
  for (const { request, raw } of requests) {
    const stuck = normalizeGrammarSet(raw(), request, { random: () => 0 });
    assert.equal(stuck.ok, true);
    if (!stuck.ok) return;
    assert.equal(stuck.set.items.every((item) => (
      item.kind === 'choice' && item.options.indexOf(item.correctAnswer) === item.options.length - 1
    )), true);

    const random = mulberry32(20261105);
    const counts = [0, 0, 0, 0];
    let allA = 0;
    const samples: string[] = [];
    for (let setIndex = 0; setIndex < 80; setIndex += 1) {
      const result = normalizeGrammarSet(raw(), request, { random });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const letters: string[] = [];
      for (const item of result.set.items) {
        assert.equal(item.kind, 'choice');
        if (item.kind !== 'choice') continue;
        const index = item.options.indexOf(item.correctAnswer);
        assert.equal(item.options[index], item.correctAnswer);
        assert.equal(String.fromCharCode(65 + index), 'ABCD'[index]);
        assert.equal(gradeChoice(item, item.options[index]).correct, true);
        const wrong = item.options.find((option) => option !== item.correctAnswer) ?? '';
        assert.equal(gradeChoice(item, wrong).correct, false);
        counts[index] += 1;
        letters.push('ABCD'[index]);
      }
      if (letters.every((letter) => letter === 'A')) allA += 1;
      if (samples.length < 3) samples.push(letters.join(' '));
    }
    assert.equal(allA, 0, `${request.exercise} had a set that was all A. samples=${samples.join(' | ')} counts=${counts.join(',')}`);
    counts.forEach((count, index) => {
      assert.ok(count >= 70, `${request.exercise} letter ${'ABCD'[index]} was ${count} (counts=${counts.join(',')})`);
    });
    const again = normalizeGrammarSet(stuck.set, request, { random: mulberry32(7) });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    const before = stuck.set.items.map((item) => item.kind === 'choice' ? item.correctAnswer : '');
    const after = again.set.items.map((item) => item.kind === 'choice' ? item.correctAnswer : '');
    assert.deepEqual(after, before);
  }

  const order = normalizeGrammarSet({
    items: Array.from({ length: 6 }, (_, index) => ({
      chunks: [`Alpha ${index}`, `Beta ${index}`, `Gamma ${index}`, `Delta ${index}.`],
      explanation: `Keep this order for ${index}.`,
    })),
  }, { level: 'C1', exercise: 'order', topic: '' }, { random: () => 0 });
  assert.equal(order.ok, true);
  if (!order.ok) return;
  assert.equal(order.set.items.every((item) => item.kind === 'order' && item.chunks[0].startsWith('Alpha')), true);
});
