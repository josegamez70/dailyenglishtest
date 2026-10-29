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
    { speaker: 'Person 1', line: 'Person 1: I missed the train today.' },
    { speaker: 'Person 2', line: 'The river flooded the road.' },
    { speaker: 'Person 1', line: 'We should stay uphill.' },
    { speaker: 'Person 2', line: 'I will carry the water.' },
  ]);
  assert.deepEqual(dialogueSpeakers(turns), ['Character 1', 'Character 2']);
  assert.equal(turns[0].line, 'I missed the train today.');
  assert.equal(spokenWordCount(turns), 19);
  assert.equal(renderDialogue(turns).split('\n')[1], 'Character 2: The river flooded the road.');
  const asText = renderDialogue(turns);
  assert.equal(contentWordCount(asText, 'dialogue'), 19);
  assert.equal(contentWordCount('One short narrative here.', 'text'), 4);
});

test('dialogue lines become spoken lines with a speaker index', () => {
  const lines = speechLines(parseDialogue('Person 1: Hello there.\nPerson 2: Good morning.'));
  assert.equal(lines[0].text, 'Character 1. Hello there.');
  assert.equal(lines[0].speaker, 'Character 1');
  assert.equal(lines[1].speakerIndex, 1);
  assert.equal(resumeTurnIndex([1000, 1000, 1000], 1500), 1);
  assert.equal(resumeTurnIndex([1000, 1000], 0), 0);
  assert.equal(resumeTurnIndex([1000], 5000), 0);
});

test('voices follow speaker gender and stay the same for each name', () => {
  const turns = parseDialogue([
    { speaker: 'Person 1', line: 'I missed the train.' },
    { speaker: 'Person 2', line: 'The river flooded the road.' },
    { speaker: '**Person 1:**', line: 'We should stay uphill.' },
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
  assert.equal(voices.ben.pitch, 0.9);
  assert.equal(voices.ben.rateScale, 1);
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
  const notes: string[] = [];
  assert.equal(only.anna.name, 'Samantha');
  assert.equal(only.ben.name, 'Samantha');
  assert.equal(only.anna.pitch, 1.15);
  assert.equal(only.anna.rateScale, 1);
  assert.equal(only.ben.pitch, 0.8);
  assert.equal(only.ben.rateScale, 0.95);
  voicesBySpeaker(
    [
      { name: 'Anna', gender: 'female' },
      { name: 'Ben', gender: 'male' },
    ],
    [{ name: 'Samantha', lang: 'en-US' }],
    (message) => notes.push(message)
  );
  assert.match(notes[0], /No male speech voice/);
  const labelled = parseDialogue('**Person 1:** Hello there.\nPerson 2 : Hi there.');
  assert.equal(labelled[0].speaker, 'Character 1');
  assert.equal(labelled[0].gender, 'female');
  assert.equal(labelled[0].line, 'Hello there.');
  assert.equal(labelled[1].speaker, 'Character 2');
  assert.equal(labelled[1].gender, 'male');
  assert.equal(parseDialogue([{ speaker: 'person 1', gender: 'male', line: 'Hello there.' }])[0].gender, 'female');
  const named = parseDialogue('Character 1: Hello there.\nCharacter 2: Hi there.');
  assert.equal(named[0].speaker, 'Character 1');
  assert.equal(named[0].gender, 'female');
  assert.equal(named[1].speaker, 'Character 2');
  assert.equal(named[1].gender, 'male');

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
  assert.equal(windows.ben.pitch, 0.9);

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
  assert.equal(chrome.sophie.name, 'Google US English');
  assert.equal(chrome.tom.name, 'Google UK English Male');
  assert.equal(chrome.sophie.pitch, 1);
  assert.equal(chrome.tom.pitch, 0.9);

  const androidLocales = voicesBySpeaker(
    [
      { name: 'Emma', gender: 'female' },
      { name: 'Jack', gender: 'male' },
    ],
    [
      { name: 'English United States', lang: 'en-US' },
      { name: 'English United Kingdom', lang: 'en-GB' },
    ]
  );
  assert.equal(androidLocales.emma.pitch, 1.15);
  assert.equal(androidLocales.emma.rateScale, 1);
  assert.equal(androidLocales.jack.pitch, 0.8);
  assert.equal(androidLocales.jack.rateScale, 0.95);
  assert.equal(androidLocales.emma.lang, 'en-GB');
  assert.equal(androidLocales.jack.lang, 'en-US');

  const androidIds = voicesBySpeaker(
    [
      { name: 'Lucy', gender: 'female' },
      { name: 'David', gender: 'male' },
    ],
    [
      { name: 'English United Kingdom', lang: 'en-GB', voiceURI: 'en-gb-x-gba-local' },
      { name: 'English United Kingdom', lang: 'en-GB', voiceURI: 'en-gb-x-rjs-local' },
      { name: 'English United States', lang: 'en-US', voiceURI: 'en-us-x-sfg-local' },
    ]
  );
  assert.equal(androidIds.lucy.voiceURI, 'en-us-x-sfg-local');
  assert.equal(androidIds.david.voiceURI, 'en-gb-x-rjs-local');
  assert.equal(androidIds.lucy.pitch, 1);
  assert.equal(androidIds.david.pitch, 0.9);
  assert.notEqual(androidIds.lucy.name.includes('Male'), true);
});

test('extra large text size becomes the largest remaining size', () => {
  assert.equal(clampedFontStep(null, 3), 1);
  assert.equal(clampedFontStep(0, 3), 0);
  assert.equal(clampedFontStep(2, 3), 2);
  assert.equal(clampedFontStep(3, 3), 2);
  assert.equal(clampedFontStep(9, 3), 2);
});
