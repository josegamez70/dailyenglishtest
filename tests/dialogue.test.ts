import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contentWordCount,
  dialogueSpeakers,
  parseDialogue,
  renderDialogue,
  resumeTurnIndex,
  speechLines,
  spokenWordCount,
  voicesBySpeaker,
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

test('voices follow speaker gender and stay the same for each name', () => {
  const turns = parseDialogue([
    { speaker: 'Anna', gender: 'female', line: 'I missed the train.' },
    { speaker: 'Ben', gender: 'male', line: 'The river flooded the road.' },
    { speaker: 'Anna', gender: 'female', line: 'We should stay uphill.' },
  ]);
  assert.equal(turns[0].gender, 'female');
  assert.equal(turns[1].gender, 'male');
  assert.equal(turns[2].gender, 'female');
  const voices = voicesBySpeaker(
    [
      { name: 'Anna', gender: 'female' },
      { name: 'Ben', gender: 'male' },
    ],
    [
      { name: 'Daniel', lang: 'en-GB' },
      { name: 'Samantha', lang: 'en-US' },
      { name: 'Amelie', lang: 'fr-FR' },
    ]
  );
  assert.equal(voices.anna.name, 'Samantha');
  assert.equal(voices.ben.name, 'Daniel');
  assert.equal(voices.anna.pitch, 1);
  assert.equal(voices.ben.pitch, 1);
  const google = voicesBySpeaker(
    [
      { name: 'Anna', gender: 'female' },
      { name: 'Ben', gender: 'male' },
    ],
    [
      { name: 'Google UK English Male', lang: 'en-GB' },
      { name: 'Google UK English Female', lang: 'en-GB' },
    ]
  );
  assert.equal(google.anna.name, 'Google UK English Female');
  assert.equal(google.ben.name, 'Google UK English Male');
  const only = voicesBySpeaker(
    [
      { name: 'Anna', gender: 'female' },
      { name: 'Ben', gender: 'male' },
    ],
    [{ name: 'Samantha', lang: 'en-US' }]
  );
  assert.equal(only.anna.name, 'Samantha');
  assert.equal(only.ben.name, 'Samantha');
  assert.ok(only.anna.pitch > 1);
  assert.ok(only.ben.pitch < 1);
  assert.ok(only.ben.rateScale < 1);
  assert.equal(parseDialogue('Anna: Hello.\nBen: Hi.')[0].gender, 'female');
  assert.equal(parseDialogue('Anna: Hello.\nBen: Hi.')[1].gender, 'male');
  assert.equal(parseDialogue([{ speaker: 'Anna', gender: 'male', line: 'Hello.' }])[0].gender, 'female');

  const windows = voicesBySpeaker(
    [
      { name: 'Anna', gender: 'female' },
      { name: 'Ben', gender: 'male' },
    ],
    [
      { name: 'Microsoft David Desktop', lang: 'en-US' },
      { name: 'Microsoft Zira Desktop', lang: 'en-US' },
      { name: 'Microsoft Mark', lang: 'en-US' },
    ]
  );
  assert.equal(windows.anna.name, 'Microsoft Zira Desktop');
  assert.equal(windows.ben.name, 'Microsoft David Desktop');
  assert.equal(windows.anna.pitch, 1);
  assert.equal(windows.ben.pitch, 1);

  const chrome = voicesBySpeaker(
    [
      { name: 'Sophie', gender: 'female' },
      { name: 'Tom', gender: 'male' },
    ],
    [
      { name: 'Google US English', lang: 'en-US' },
      { name: 'Google UK English Male', lang: 'en-GB' },
      { name: 'Google UK English Female', lang: 'en-GB' },
    ]
  );
  assert.equal(chrome.sophie.name, 'Google UK English Female');
  assert.equal(chrome.tom.name, 'Google UK English Male');
  assert.equal(chrome.sophie.pitch, 1);
  assert.equal(chrome.tom.pitch, 1);

  const android = voicesBySpeaker(
    [
      { name: 'Anna', gender: 'female' },
      { name: 'Ben', gender: 'male' },
    ],
    [
      { name: 'English United States', lang: 'en-US' },
      { name: 'English United Kingdom', lang: 'en-GB' },
    ]
  );
  assert.equal(android.anna.name, 'English United States');
  assert.equal(android.ben.name, 'English United Kingdom');
  assert.ok(android.anna.pitch > 1);
  assert.ok(android.ben.pitch < 1);
  assert.ok(android.ben.rateScale < 1);
});

test('extra large text size becomes the largest remaining size', () => {
  assert.equal(clampedFontStep(null, 3), 1);
  assert.equal(clampedFontStep(0, 3), 0);
  assert.equal(clampedFontStep(2, 3), 2);
  assert.equal(clampedFontStep(3, 3), 2);
  assert.equal(clampedFontStep(9, 3), 2);
});
