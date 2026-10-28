import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contentWordCount,
  dialogueSpeakers,
  parseDialogue,
  renderDialogue,
  resumeTurnIndex,
  speakerVoices,
  speechLines,
  spokenWordCount,
} from '../dialogue.ts';
import { clampedFontStep } from '../fontStep.ts';

test('dialogue keeps two speakers and ignores names in the word count', () => {
  const turns = parseDialogue([
    { speaker: 'Ana', line: 'Ana: I missed the train today.' },
    { speaker: 'Leo', line: 'The river flooded the road.' },
    { speaker: 'Ana', line: 'We should stay uphill.' },
    { speaker: 'Leo', line: 'I will carry the water.' },
  ]);
  assert.deepEqual(dialogueSpeakers(turns), ['Ana', 'Leo']);
  assert.equal(turns[0].line, 'I missed the train today.');
  assert.equal(spokenWordCount(turns), 19);
  assert.equal(renderDialogue(turns).split('\n')[1], 'Leo: The river flooded the road.');
  const asText = renderDialogue(turns);
  assert.equal(contentWordCount(asText, 'dialogue'), 19);
  assert.equal(contentWordCount('One short narrative here.', 'text'), 4);
});

test('dialogue lines become spoken lines with a speaker index', () => {
  const lines = speechLines(parseDialogue('Ana: Hello there.\nLeo: Good morning.'));
  assert.equal(lines[0].text, 'Ana. Hello there.');
  assert.equal(lines[1].speakerIndex, 1);
  assert.equal(resumeTurnIndex([1000, 1000, 1000], 1500), 1);
  assert.equal(resumeTurnIndex([1000, 1000], 0), 0);
  assert.equal(resumeTurnIndex([1000], 5000), 0);
});

test('two English voices stay distinct and one voice changes pitch', () => {
  const pair = speakerVoices([
    { name: 'UK Female', lang: 'en-GB' },
    { name: 'US Male', lang: 'en-US' },
    { name: 'French', lang: 'fr-FR' },
  ]);
  assert.equal(pair[0].name, 'UK Female');
  assert.equal(pair[1].name, 'US Male');
  assert.equal(pair[0].pitch, 1);
  assert.equal(pair[1].pitch, 1);
  const single = speakerVoices([{ name: 'Only', lang: 'en-US' }]);
  assert.equal(single[0].name, 'Only');
  assert.equal(single[1].name, 'Only');
  assert.equal(single[1].pitch, 0.75);
  assert.ok(single[1].rateScale < 1);
});

test('extra large text size becomes the largest remaining size', () => {
  assert.equal(clampedFontStep(null, 3), 1);
  assert.equal(clampedFontStep(0, 3), 0);
  assert.equal(clampedFontStep(2, 3), 2);
  assert.equal(clampedFontStep(3, 3), 2);
  assert.equal(clampedFontStep(9, 3), 2);
});
