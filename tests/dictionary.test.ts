import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupCandidates, parseDictionary, popupPosition } from '../dictionary.ts';

test('word lookup tries a simple plural or verb ending when needed', () => {
  assert.deepEqual(lookupCandidates('Cats,'), ['cats', 'cat']);
  assert.ok(lookupCandidates('cities').includes('city'));
  assert.ok(lookupCandidates('running').includes('run'));
  assert.ok(lookupCandidates('walked').includes('walk'));
  assert.ok(lookupCandidates('stopped').includes('stop'));
  assert.ok(lookupCandidates('liked').includes('like'));
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
