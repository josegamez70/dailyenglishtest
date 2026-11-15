import test from 'node:test';
import assert from 'node:assert/strict';
import { baseFormCandidates, collectSenses, inflectionPointer, lemmaCandidates, lookupCandidates, meaningToSave, mergeBaseEntry, normalizeLookupWord, parseDictionary, popupPosition, searchLookupTerm, type DictEntry } from '../dictionary.ts';

test('word lookup tries a simple plural or verb ending when needed', () => {
  assert.equal(normalizeLookupWord("Sophie's"), 'sophie');
  assert.equal(normalizeLookupWord('Sophie\u2019s'), 'sophie');
  assert.equal(normalizeLookupWord('mystery,'), 'mystery');
  assert.deepEqual(lookupCandidates('Cats,'), ['cats', 'cat']);
  assert.equal(lemmaCandidates('cities')[0], 'city');
  assert.equal(lemmaCandidates('studies')[0], 'study');
  assert.ok(lemmaCandidates('running').includes('run'));
  assert.ok(lemmaCandidates('walked').includes('walk'));
  assert.ok(lemmaCandidates('stopped').includes('stop'));
  assert.ok(lemmaCandidates('liked').includes('like'));
  assert.ok(lemmaCandidates('happiest').includes('happy'));
  assert.deepEqual(lookupCandidates('...'), []);
  assert.equal(searchLookupTerm('  strife '), 'strife');
  assert.equal(searchLookupTerm('ice cream'), 'ice cream');
  assert.equal(searchLookupTerm('a'), null);
  assert.equal(searchLookupTerm('one two three four five'), null);
  assert.equal(searchLookupTerm('hello!'), null);
});

test('dictionary payload keeps a short meaning and one example', () => {
  const entry = parseDictionary([
    {
      word: 'walk',
      phonetic: '/wɔːk/',
      meanings: [
        {
          partOfSpeech: 'verb',
          definitions: [
            { definition: 'To move on foot.', example: 'They walk to school.' },
            { definition: 'To go with someone.' },
          ],
        },
        {
          partOfSpeech: 'noun',
          definitions: [{ definition: 'A short journey on foot.', example: 'A morning walk.' }],
        },
      ],
    },
  ], 'walk');
  assert.equal(entry?.word, 'walk');
  assert.equal(entry?.phonetic, '/wɔːk/');
  assert.equal(entry?.senses.length, 3);
  assert.equal(entry?.senses[0].partOfSpeech, 'verb');
  assert.equal(entry?.senses[0].definition, 'To move on foot.');
  assert.equal(entry?.senses[1].partOfSpeech, 'noun');
  assert.equal(entry?.senses[2].definition, 'To go with someone.');
  assert.equal(entry?.example, 'They walk to school.');
});

test('an inflected word keeps the base form’s common sense first', () => {
  assert.equal(baseFormCandidates('teasing')[0], 'tease');
  assert.equal(baseFormCandidates('running')[0], 'run');
  assert.equal(baseFormCandidates('studies')[0], 'study');
  assert.deepEqual(baseFormCandidates('strife'), []);
  const surface: DictEntry = {
    word: 'teasing',
    phonetic: null,
    senses: [{ partOfSpeech: 'verb', definition: 'To separate the fibres of a fibrous material.' }],
    example: null,
  };
  const base: DictEntry = {
    word: 'tease',
    phonetic: '/tiːz/',
    senses: [
      { partOfSpeech: 'verb', definition: 'To make fun of someone playfully.' },
      { partOfSpeech: 'noun', definition: 'A person who teases.' },
    ],
    example: 'They tease their friend.',
  };
  const merged = mergeBaseEntry(surface, base);
  assert.equal(merged.word, 'teasing');
  assert.equal(merged.note, 'from: tease');
  assert.equal(merged.senses[0].definition, 'To make fun of someone playfully.');
  assert.equal(meaningToSave(merged.senses).startsWith('To make fun of someone playfully. · '), true);
  assert.equal(merged.senses.length <= 3, true);
  const ranked = collectSenses([{
    partOfSpeech: 'verb',
    definitions: [
      { definition: 'To separate the fibres of a fibrous material.' },
      { definition: 'To poke fun at someone playfully.' },
    ],
  }]);
  assert.equal(ranked.senses[0].definition, 'To poke fun at someone playfully.');
  const fruit = collectSenses([{
    partOfSpeech: 'noun',
    definitions: [
      { definition: 'A round fruit that grows on a tree.' },
      { definition: 'The round part of a cheek when a person is smiling.' },
    ],
  }]);
  assert.equal(fruit.senses[0].definition, 'A round fruit that grows on a tree.');
});

test('an inflection pointer names the base word', () => {
  const pointer = inflectionPointer({
    word: 'cities',
    phonetic: null,
    senses: [{ partOfSpeech: 'noun', definition: 'plural of city' }],
    example: null,
  });
  assert.deepEqual(pointer, { base: 'city', label: 'plural' });
  const real = inflectionPointer({
    word: 'mystery',
    phonetic: null,
    senses: [{ partOfSpeech: 'noun', definition: 'Something secret or unexplainable.' }],
    example: null,
  });
  assert.equal(real, null);
});

test('the definition popup stays inside the screen', () => {
  const flipped = popupPosition(
    { top: 500, bottom: 520, left: 300 },
    { width: 200, height: 180 },
    { width: 360, height: 640 }
  );
  assert.ok(flipped.left >= 8);
  assert.ok(flipped.left + 200 <= 352);
  assert.ok(flipped.top + 180 <= 632);
  const below = popupPosition(
    { top: 40, bottom: 60, left: 16 },
    { width: 200, height: 80 },
    { width: 800, height: 600 }
  );
  assert.equal(below.top, 66);
  assert.equal(below.left, 16);
});
