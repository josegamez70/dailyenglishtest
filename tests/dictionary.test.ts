import test from 'node:test';
import assert from 'node:assert/strict';
import { lemmaCandidates, lookupCandidates, normalizeLookupWord, parseDictionary, popupPosition } from '../dictionary.ts';

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
  assert.equal(entry?.senses.length, 2);
  assert.equal(entry?.senses[0].partOfSpeech, 'verb');
  assert.equal(entry?.example, 'They walk to school.');
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
