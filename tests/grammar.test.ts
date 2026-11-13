import test from 'node:test';
import assert from 'node:assert/strict';
import {
  B1_BLANK_TARGETS,
  B2_BLANK_TARGETS,
  B2_PHRASALS,
  BASIC_PHRASALS,
  buildGrammarPrompt,
  buildGrammarTopUpPrompt,
  C1_BLANK_TARGETS,
  C1_PHRASALS,
  freshOrder,
  GRAMMAR_GENERATION_COUNT,
  GRAMMAR_ITEM_COUNT,
  GRAMMAR_MIN_ITEMS,
  gradeChoice,
  gradeOrder,
  grammarChoiceGapProblem,
  grammarTitle,
  normalizeGrammarSet,
  repairGrammarChoice,
  placeChunk,
  REAL_PHRASAL_COUNT,
  resetOrder,
  sameOrder,
  shuffleChoiceOptions,
  shuffleChunks,
  undoChunk,
  type GrammarChoice,
  type GrammarLevel,
  type GrammarOrder,
  type GrammarRequest,
} from '../grammarSet.ts';
import { REAL_PHRASAL_VERBS } from '../phrasalVerbs.ts';

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
  assert.match(phrasal, /advanced but standard phrasal verbs/);
  assert.match(phrasal, /Do not use basic B1/);
  assert.match(phrasal, /Put off a meeting/);
  assert.match(phrasal, /Variation seed/);
  assert.match(phrasal, /Include several of these in this set/);
  assert.match(phrasal, /two other real phrasal verbs/);
  assert.match(phrasal, /Do not leave it first every time/);
  const b2Phrasal = buildGrammarPrompt({ level: 'B2', exercise: 'phrasal', topic: '' }, undefined, { seed: 4 });
  assert.match(b2Phrasal, /upper-intermediate phrasal verbs/);
  assert.match(b2Phrasal, /Do not fill the set with basic B1/);
  assert.match(b2Phrasal, /get up, look for, and turn off/);
  assert.match(b2Phrasal, /Include several of these in this set/);
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

function featuredInPrompt(level: GrammarLevel, seed: number): string[] {
  const prompt = buildGrammarPrompt({ level, exercise: 'phrasal', topic: '' }, undefined, { seed });
  const match = prompt.match(/Include several of these in this set: ([^.]+)\./);
  assert.ok(match, prompt);
  return match[1].split(', ').map((item) => item.trim()).filter(Boolean);
}

function particlesByVerb(phrases: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const phrase of phrases) {
    const verb = phrase.split(' ')[0] ?? '';
    counts.set(verb, (counts.get(verb) ?? 0) + 1);
  }
  return counts;
}

function featuredC1Groups(seed: number): string[][] {
  const prompt = buildGrammarPrompt({ level: 'C1', exercise: 'phrasal', topic: '' }, undefined, { seed });
  const match = prompt.match(/Include several of these in this set: ([^.]+)\./);
  assert.ok(match, prompt);
  return match[1].split('; ').map((group) => group.split(', ').map((item) => item.trim()).filter(Boolean));
}

function assertC1Group(group: string[]): void {
  assert.ok(group.length >= 3 && group.length <= 4, group.join(', '));
  const verbs = new Set(group.map((phrase) => phrase.split(' ')[0]));
  assert.equal(verbs.size, 1, group.join(', '));
  for (const phrase of group) {
    assert.equal(C1_PHRASALS.has(phrase), true, phrase);
    assert.equal(BASIC_PHRASALS.has(phrase), false, phrase);
    assert.equal(B2_PHRASALS.has(phrase), false, phrase);
  }
}

test('B2 phrasal pool is a large real upper-intermediate set', () => {
  const real = new Set(REAL_PHRASAL_VERBS);
  assert.ok(B2_PHRASALS.size >= 80, `B2 pool is ${B2_PHRASALS.size}`);
  assert.ok(B2_PHRASALS.size <= 150, `B2 pool is ${B2_PHRASALS.size}`);
  assert.ok(B2_PHRASALS.size >= 60);
  for (const phrase of B2_PHRASALS) {
    assert.equal(real.has(phrase), true, `${phrase} is not a listed real phrasal verb`);
    assert.equal(BASIC_PHRASALS.has(phrase), false, `${phrase} is a basic B1 phrasal`);
    assert.equal(C1_PHRASALS.has(phrase), false, `${phrase} belongs on the C1 list`);
  }
  for (const phrase of BASIC_PHRASALS) {
    assert.equal(real.has(phrase), true, `${phrase} is not a listed real phrasal verb`);
    assert.equal(C1_PHRASALS.has(phrase), false, phrase);
  }
});

test('featured phrasal prompts differ across seeds', () => {
  const first = featuredInPrompt('B2', 1);
  const sameCount = featuredInPrompt('B2', 6);
  assert.equal(first.length, sameCount.length);
  assert.ok(first.length >= 8 && first.length <= 12);
  assert.deepEqual(first, featuredInPrompt('B2', 1));
  assert.notDeepEqual([...first].sort(), [...sameCount].sort());

  const seen = new Set<string>();
  for (let seed = 0; seed < 80; seed += 1) {
    const sample = featuredInPrompt('B2', seed);
    assert.ok(sample.length >= 8 && sample.length <= 12, `seed ${seed} sampled ${sample.length}`);
    assert.equal(new Set(sample).size, sample.length);
    for (const phrase of sample) {
      seen.add(phrase);
      assert.equal(B2_PHRASALS.has(phrase), true, phrase);
      assert.equal(BASIC_PHRASALS.has(phrase), false, phrase);
      assert.equal(C1_PHRASALS.has(phrase), false, phrase);
    }
  }
  assert.ok(seen.size >= 60, `featured samples only reached ${seen.size} verbs`);

  const b1a = featuredInPrompt('B1', 3);
  const b1b = featuredInPrompt('B1', 8);
  assert.notDeepEqual([...b1a].sort(), [...b1b].sort());
  for (const phrase of [...b1a, ...b1b]) {
    assert.equal(BASIC_PHRASALS.has(phrase), true, phrase);
    assert.equal(B2_PHRASALS.has(phrase), false, phrase);
  }

  const c1a = featuredC1Groups(2);
  const c1b = featuredC1Groups(7);
  assert.notDeepEqual(c1a.map((group) => group.join('|')).sort(), c1b.map((group) => group.join('|')).sort());
  assert.deepEqual(c1a, featuredC1Groups(2));
  for (const group of [...c1a, ...c1b]) assertC1Group(group);
});

test('C1 phrasal pool is a large real advanced set that can form option groups', () => {
  const real = new Set(REAL_PHRASAL_VERBS);
  const whitelist = particlesByVerb(real);
  assert.ok(C1_PHRASALS.size >= 80, `C1 pool is ${C1_PHRASALS.size}`);
  assert.ok(C1_PHRASALS.size <= 150, `C1 pool is ${C1_PHRASALS.size}`);
  const inPool = particlesByVerb(C1_PHRASALS);
  for (const phrase of C1_PHRASALS) {
    assert.equal(real.has(phrase), true, `${phrase} is not a listed real phrasal verb`);
    assert.equal(BASIC_PHRASALS.has(phrase), false, `${phrase} is a basic B1 phrasal`);
    assert.equal(B2_PHRASALS.has(phrase), false, `${phrase} belongs on the B2 list`);
    const verb = phrase.split(' ')[0];
    assert.ok((inPool.get(verb) ?? 0) >= 3, `${verb} has fewer than 3 C1 phrases`);
    assert.ok((whitelist.get(verb) ?? 0) >= 3, `${verb} has fewer than 3 real particles`);
  }
});

test('C1 featured groups stay groupable and fill a six-item set', () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 80; seed += 1) {
    const groups = featuredC1Groups(seed);
    assert.ok(groups.length >= 5 && groups.length <= 7, `seed ${seed} featured ${groups.length} groups`);
    assert.deepEqual(groups, featuredC1Groups(seed));
    const verbs = groups.map((group) => group[0].split(' ')[0]);
    assert.equal(new Set(verbs).size, verbs.length, `seed ${seed} repeats a verb`);
    for (const group of groups) {
      assertC1Group(group);
      for (const phrase of group) seen.add(phrase);
    }
  }
  assert.ok(seen.size >= 60, `featured C1 samples only reached ${seen.size} phrases`);

  const c1 = buildGrammarPrompt({ level: 'C1', exercise: 'phrasal', topic: '' }, undefined, { seed: 3 });
  const b2 = buildGrammarPrompt({ level: 'B2', exercise: 'phrasal', topic: '' }, undefined, { seed: 3 });
  assert.match(c1, /Do not invent a particle/);
  assert.match(c1, /one group below/);
  assert.ok(c1.length < b2.length + 800, `C1 prompt is ${c1.length}, B2 is ${b2.length}`);

  const groups = featuredC1Groups(4);
  const items = groups.flatMap((group, groupIndex) => {
    const other = groups[(groupIndex + 1) % groups.length];
    const options = group.length >= 4 ? group.slice(0, 4) : [...group, other[0]];
    return [0, 1].map((slot) => choice(groupIndex * 2 + slot + 1, {
      prompt: `The committee will _____ proposal ${groupIndex}-${slot}.`,
      options,
      correctAnswer: group[slot],
    }));
  });
  const result = normalizeGrammarSet(
    { items },
    { level: 'C1', exercise: 'phrasal', topic: '' },
    { random: mulberry32(4) },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.set.items.length, GRAMMAR_ITEM_COUNT);
  const letters: string[] = [];
  for (const item of result.set.items) {
    assert.equal(item.kind, 'choice');
    if (item.kind !== 'choice') continue;
    assert.equal(C1_PHRASALS.has(item.correctAnswer), true, item.correctAnswer);
    const index = item.options.indexOf(item.correctAnswer);
    assert.ok(index >= 0);
    letters.push('ABCD'[index]);
  }
  assert.equal(letters.every((letter) => letter === 'A'), false, letters.join(' '));
});

test('one-particle verbs cannot fill a C1 phrasal set', () => {
  const rows = [
    ['gloss over', 'iron out', 'stave off', 'dwell on'],
    ['shrug off', 'spell out', 'tone down', 'hinge on'],
    ['paper over', 'fend off', 'weed out', 'pore over'],
    ['water down', 'single out', 'thrash out', 'factor in'],
    ['home in on', 'tide over', 'sound out', 'phase out'],
    ['win over', 'smooth over', 'zero in on', 'dispense with'],
  ];
  const result = normalizeGrammarSet({
    items: rows.map((options, index) => choice(index + 1, {
      prompt: `They tried to _____ the issue ${index}.`,
      options,
      correctAnswer: options[0],
    })),
  }, { level: 'C1', exercise: 'phrasal', topic: '' });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.problems.join(' '), /real phrasal verb|same verb|usable/);
});

test('B2 scoring prefers B2 phrasals over basic ones', () => {
  const phrasal = { level: 'B2' as const, exercise: 'phrasal' as const, topic: '' };
  const result = normalizeGrammarSet({
    items: [
      choice(1, {
        prompt: 'She could not _____ her parents expectations.',
        options: ['live up to', 'live on', 'live through', 'live with'],
        correctAnswer: 'live up to',
      }),
      choice(2, {
        prompt: 'The team _____ a new plan.',
        options: ['come up with', 'come across', 'come about', 'come out with'],
        correctAnswer: 'come up with',
      }),
      choice(3, {
        prompt: 'I cannot _____ the noise.',
        options: ['put up with', 'put aside', 'put forward', 'put together'],
        correctAnswer: 'put up with',
      }),
      choice(4, {
        prompt: 'We _____ milk this morning.',
        options: ['run out of', 'run into', 'run over', 'run down'],
        correctAnswer: 'run out of',
      }),
      choice(5, {
        prompt: 'A larger firm will _____ the shop.',
        options: ['take over', 'take after', 'take on', 'take up'],
        correctAnswer: 'take over',
      }),
      choice(6, {
        prompt: 'The police will _____ the complaint.',
        options: ['look into', 'look forward to', 'look down on', 'look up to'],
        correctAnswer: 'look into',
      }),
      choice(7, {
        prompt: 'The car may _____ on the hill.',
        options: ['break down', 'break up', 'break off', 'break out'],
        correctAnswer: 'break down',
      }),
      choice(8, {
        prompt: 'The vote will _____ a new rule.',
        options: ['bring about', 'bring off', 'bring in', 'bring out'],
        correctAnswer: 'bring about',
      }),
      choice(9, {
        prompt: 'I _____ at six.',
        options: ['get up', 'get on', 'get off', 'get in'],
        correctAnswer: 'get up',
      }),
      choice(10, {
        prompt: 'Please _____ the radio.',
        options: ['turn off', 'turn on', 'turn up', 'turn out'],
        correctAnswer: 'turn off',
      }),
    ],
  }, phrasal);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.set.items.length, GRAMMAR_ITEM_COUNT);
  const answers = result.set.items.map((item) => item.kind === 'choice' ? item.correctAnswer : '');
  assert.equal(answers.includes('live up to'), true);
  assert.equal(answers.includes('come up with'), true);
  assert.equal(answers.includes('bring about'), false);
  assert.equal(answers.includes('get up'), false);
  assert.equal(answers.includes('turn off'), false);
  for (const answer of answers) assert.equal(B2_PHRASALS.has(answer), true, answer);
});

function featuredBlankStructures(level: GrammarLevel, seed: number): string[] {
  const prompt = buildGrammarPrompt({ level, exercise: 'blanks', topic: '' }, undefined, { seed });
  const match = prompt.match(/Include several of these structures or contrasts in this set: ([^.]+)\./);
  assert.ok(match, prompt);
  return match[1].split(', ').map((item) => item.trim()).filter(Boolean);
}

test('blank grammar pools are large and stay inside one level', () => {
  const pools = [
    ['B1', B1_BLANK_TARGETS],
    ['B2', B2_BLANK_TARGETS],
    ['C1', C1_BLANK_TARGETS],
  ] as const;
  const seen = new Set<string>();
  for (const [level, pool] of pools) {
    assert.ok(pool.length >= 40, `${level} pool is ${pool.length}`);
    assert.equal(new Set(pool).size, pool.length, `${level} has a repeated target`);
    for (const target of pool) {
      assert.equal(target, target.trim(), target);
      assert.equal(target.includes(','), false, target);
      assert.equal(target.includes('.'), false, target);
      assert.equal(seen.has(target), false, `${target} is listed for more than one level`);
      seen.add(target);
    }
  }
  const overused = ['not only', 'little did', 'never before', 'had i known', 'hardly had', 'should you require'];
  for (const target of C1_BLANK_TARGETS) {
    const text = target.toLowerCase();
    for (const phrase of overused) assert.equal(text.includes(phrase), false, target);
  }
});

test('featured blank structures follow the variation seed', () => {
  for (const level of ['B1', 'B2', 'C1'] as const) {
    const pool = level === 'C1' ? C1_BLANK_TARGETS : level === 'B2' ? B2_BLANK_TARGETS : B1_BLANK_TARGETS;
    const first = featuredBlankStructures(level, 1);
    const sameCount = featuredBlankStructures(level, 6);
    assert.equal(first.length, sameCount.length);
    assert.ok(first.length >= 6 && first.length <= 10, `${level} sampled ${first.length}`);
    assert.deepEqual(first, featuredBlankStructures(level, 1));
    assert.notDeepEqual([...first].sort(), [...sameCount].sort());
    assert.equal(featuredBlankStructures(level, 0).length, 6);
    assert.equal(featuredBlankStructures(level, 4).length, 10);

    const covered = new Set<string>();
    for (let seed = 0; seed < 40; seed += 1) {
      const sample = featuredBlankStructures(level, seed);
      assert.ok(sample.length >= 6 && sample.length <= 10, `${level} seed ${seed} sampled ${sample.length}`);
      assert.equal(new Set(sample).size, sample.length);
      for (const target of sample) {
        covered.add(target);
        assert.equal(pool.includes(target), true, `${level} sample left the pool: ${target}`);
      }
    }
    assert.ok(covered.size >= 30, `${level} samples only reached ${covered.size} targets`);
  }

  const b1 = buildGrammarPrompt({ level: 'B1', exercise: 'blanks', topic: 'present perfect' }, undefined, { seed: 42 });
  assert.match(b1, /Variation seed 42\./);
  assert.match(b1, /Topic: "present perfect"/);
  assert.match(b1, /for\/since/);
  assert.match(b1, /structures or contrasts/);

  const c1 = buildGrammarPrompt({ level: 'C1', exercise: 'blanks', topic: '' }, undefined, { seed: 42 });
  assert.match(c1, /Variation seed 42\./);
  assert.match(c1, /Hardly had I entered/);
  assert.match(c1, /Do not keep using Not only/);
  assert.match(c1, /cleft sentences/);
  assert.match(c1, /mixed conditionals/);
  assert.match(c1, /structures or contrasts/);
  const scene = c1.match(/Write new sentences about this situation: ([^.]+)\./);
  assert.ok(scene, c1);

  const order = buildGrammarPrompt({ level: 'B2', exercise: 'order', topic: '' }, undefined, { seed: 42 });
  assert.match(order, /Variation seed 42\. Vary the sentences so this set does not repeat an earlier one/);
  assert.equal(order.includes('structures or contrasts'), false);
  assert.match(order, /reported speech/);

  const phrasal = buildGrammarPrompt({ level: 'B2', exercise: 'phrasal', topic: '' }, undefined, { seed: 42 });
  assert.match(phrasal, /Include several of these in this set/);
  assert.match(phrasal, /fell out/);
  assert.equal(phrasal.includes('structures or contrasts'), false);
});

test('a phrasal gap rejects a base-form answer that does not fit the words around it', () => {
  const item: GrammarChoice = {
    kind: 'choice',
    prompt: 'They eventually _____ over a trivial disagreement regarding the office seating arrangement.',
    options: ['fall in', 'fall back', 'fall over', 'fall out with'],
    correctAnswer: 'fall out with',
    explanation: 'Fall out means to quarrel.',
  };
  assert.match(grammarChoiceGapProblem(item, 'phrasal') ?? '', /does not fit|wrong tense/);
  const repaired = repairGrammarChoice(item, 'phrasal');
  assert.ok(repaired);
  assert.equal(repaired?.correctAnswer, 'fell out');
  assert.deepEqual(repaired?.options, ['fell in', 'fell back', 'fell over', 'fell out']);
  assert.equal(grammarChoiceGapProblem(repaired as GrammarChoice, 'phrasal'), null);
  const normalized = normalizeGrammarSet({
    items: [item, {
      kind: 'choice',
      prompt: 'She looks after her brother every morning.',
      options: ['looks after', 'looks for', 'looks up', 'looks into'],
      correctAnswer: 'looks after',
      explanation: 'Look after means to take care of someone.',
    }],
  }, { level: 'B2', exercise: 'phrasal', topic: '' }, { random: () => 0 });
  const kept = normalized.items.filter((row) => row.kind === 'choice' && row.prompt.includes('eventually'));
  assert.equal(kept.length, 1);
  assert.equal(kept[0] && kept[0].kind === 'choice' ? kept[0].correctAnswer : '', 'fell out');
});

test('a gap after had uses the participle, and a fitting sentence is kept', () => {
  const broken: GrammarChoice = {
    kind: 'choice',
    prompt: 'I was surprised to see that the two brothers had _____ over a trivial disagreement.',
    options: ['fall back', 'fall out with', 'fall over', 'bear with'],
    correctAnswer: 'fall out with',
    explanation: 'Fall out means to quarrel.',
  };
  const repaired = repairGrammarChoice(broken, 'phrasal');
  assert.equal(repaired?.correctAnswer, 'fallen out');
  assert.equal(grammarChoiceGapProblem(repaired as GrammarChoice, 'phrasal'), null);
  const sound: GrammarChoice = {
    kind: 'choice',
    prompt: 'They fell _____ over the seating plan.',
    options: ['out', 'in', 'back', 'over'],
    correctAnswer: 'out',
    explanation: 'Fall out over something means to quarrel about it.',
  };
  assert.equal(grammarChoiceGapProblem(sound, 'phrasal'), null);
  const polite: GrammarChoice = {
    kind: 'choice',
    prompt: 'Can you please _____ the money you borrowed last week?',
    options: ['give back', 'give up', 'give in', 'give away'],
    correctAnswer: 'give back',
    explanation: 'Give back means to return something.',
  };
  assert.equal(grammarChoiceGapProblem(polite, 'phrasal'), null);
  const did: GrammarChoice = {
    kind: 'choice',
    prompt: 'What time did you _____ to the hotel last night?',
    options: ['get in', 'get on', 'get by', 'get over'],
    correctAnswer: 'get in',
    explanation: 'Get in means to arrive.',
  };
  assert.equal(grammarChoiceGapProblem(did, 'phrasal'), null);
  const about: GrammarChoice = {
    kind: 'choice',
    prompt: 'Nobody knows exactly how the misunderstanding _____ in the first place.',
    options: ['come about', 'come across', 'come off', 'come out'],
    correctAnswer: 'come about',
    explanation: 'Come about means to happen.',
  };
  assert.equal(grammarChoiceGapProblem(about, 'phrasal'), null);
});
