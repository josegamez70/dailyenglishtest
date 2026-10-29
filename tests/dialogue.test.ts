import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contentWordCount,
  dialogueSpeakers,
  dialogueTurnPlan,
  parseDialogue,
  pickDialogueSpeakers,
  renderDialogue,
  resumeTurnIndex,
  speechLines,
  spokenWordCount,
  trimDialogueToLength,
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
  assert.equal(turns[1].gender, 'female');
  assert.equal(turns[2].gender, 'female');
  const women = [
    { name: 'Anna', gender: 'female' as const },
    { name: 'Sophie', gender: 'female' as const },
  ];
  const voices = voicesBySpeaker(women, [
    { name: 'Daniel', lang: 'en-GB' },
    { name: 'Samantha', lang: 'en-US' },
    { name: 'Karen', lang: 'en-AU' },
    { name: 'Amelie', lang: 'fr-FR' },
  ]);
  assert.equal(voices.anna.name, 'Samantha');
  assert.equal(voices.sophie.name, 'Karen');
  assert.equal(voices.anna.pitch, 1);
  assert.equal(voices.sophie.pitch, 1);
  assert.notEqual(voices.anna.name, 'Daniel');
  assert.notEqual(voices.sophie.name, 'Daniel');
  const only = voicesBySpeaker(women, [
    { name: 'Daniel', lang: 'en-GB' },
    { name: 'Samantha', lang: 'en-US' },
  ]);
  const notes: string[] = [];
  assert.equal(only.anna.name, 'Samantha');
  assert.equal(only.sophie.name, 'Samantha');
  assert.equal(only.anna.pitch, 1.15);
  assert.equal(only.sophie.pitch, 0.9);
  assert.equal(only.sophie.rateScale, 1);
  voicesBySpeaker(women, [{ name: 'Samantha', lang: 'en-US' }], (message) => notes.push(message));
  assert.match(notes[0], /No second female speech voice/);
  const labelled = parseDialogue('**Person 1:** Hello there.\nPerson 2 : Hi there.');
  assert.equal(labelled[0].speaker, 'Character 1');
  assert.equal(labelled[0].gender, 'female');
  assert.equal(labelled[0].line, 'Hello there.');
  assert.equal(labelled[1].speaker, 'Character 2');
  assert.equal(labelled[1].gender, 'female');
  const cast = [
    { name: 'Anna', gender: 'female' as const },
    { name: 'Sophie', gender: 'female' as const },
  ];
  const mapped = parseDialogue('Person 1: Hello there.\nCharacter 2: Hi there.', cast);
  assert.equal(mapped[0].speaker, 'Anna');
  assert.equal(mapped[1].speaker, 'Sophie');
  assert.equal(mapped[1].gender, 'female');
  assert.equal(parseDialogue([{ speaker: 'person 1', gender: 'male', line: 'Hello there.' }])[0].gender, 'female');
  const named = parseDialogue('Anna: Hello there.\nSophie: Hi there.');
  assert.equal(named[0].speaker, 'Anna');
  assert.equal(named[0].gender, 'female');
  assert.equal(named[1].speaker, 'Sophie');

  const windows = voicesBySpeaker(women, [
    { name: 'Microsoft David Desktop', lang: 'en-US' },
    { name: 'Microsoft Zira Desktop', lang: 'en-US' },
    { name: 'Microsoft Hazel', lang: 'en-GB' },
  ]);
  assert.equal(windows.anna.name, 'Microsoft Zira Desktop');
  assert.equal(windows.sophie.name, 'Microsoft Hazel');
  assert.equal(windows.anna.pitch, 1);
  assert.equal(windows.sophie.pitch, 1);

  const chrome = voicesBySpeaker(
    [
      { name: 'Emma', gender: 'female' },
      { name: 'Lucy', gender: 'female' },
    ],
    [
      { name: 'Google US English', lang: 'en-US' },
      { name: 'Google UK English Male', lang: 'en-GB' },
      { name: 'Google UK English Female', lang: 'en-GB' },
    ]
  );
  assert.equal(chrome.emma.name, 'Google US English');
  assert.equal(chrome.lucy.name, 'Google UK English Female');
  assert.equal(chrome.emma.pitch, 1);
  assert.equal(chrome.lucy.pitch, 1);

  const androidLocales = voicesBySpeaker(women, [
    { name: 'English United States', lang: 'en-US' },
    { name: 'English United Kingdom', lang: 'en-GB' },
  ]);
  assert.equal(androidLocales.anna.pitch, 1.15);
  assert.equal(androidLocales.sophie.pitch, 0.9);
  assert.equal(androidLocales.anna.rateScale, 1);
  assert.equal(androidLocales.sophie.rateScale, 1);
  assert.equal(androidLocales.anna.lang, 'en-GB');
  assert.equal(androidLocales.sophie.lang, 'en-US');

  const androidIds = voicesBySpeaker(
    [
      { name: 'Lucy', gender: 'female' },
      { name: 'Mia', gender: 'female' },
    ],
    [
      { name: 'English United Kingdom', lang: 'en-GB', voiceURI: 'en-gb-x-gba-local' },
      { name: 'English United Kingdom', lang: 'en-GB', voiceURI: 'en-gb-x-rjs-local' },
      { name: 'English United States', lang: 'en-US', voiceURI: 'en-us-x-sfg-local' },
    ]
  );
  assert.equal(androidIds.lucy.voiceURI, 'en-us-x-sfg-local');
  assert.equal(androidIds.mia.voiceURI, 'en-gb-x-gba-local');
  assert.equal(androidIds.lucy.pitch, 1);
  assert.equal(androidIds.mia.pitch, 1);
  assert.equal(androidIds.mia.voiceURI?.includes('rjs'), false);
});

test('dialogue names rotate and long dialogues lose extra turns', () => {
  assert.deepEqual(dialogueTurnPlan(60), { turns: 6, wordsPerTurn: 10 });
  assert.deepEqual(dialogueTurnPlan(100), { turns: 10, wordsPerTurn: 10 });
  assert.deepEqual(dialogueTurnPlan(140), { turns: 14, wordsPerTurn: 10 });
  const first = pickDialogueSpeakers([], () => 0);
  assert.equal(first[0].gender, 'female');
  assert.equal(first[1].gender, 'female');
  assert.notEqual(first[0].name, first[1].name);
  const again = pickDialogueSpeakers([first[0].name, first[1].name], () => 0);
  const samePair = [again[0].name, again[1].name].sort().join() === [first[0].name, first[1].name].sort().join();
  assert.equal(samePair, false);
  const line = 'one two three four five six seven eight nine ten';
  const turns = Array.from({ length: 20 }, (_, index) => ({
    speaker: index % 2 === 0 ? 'Anna' : 'Sophie',
    line,
    gender: 'female' as const,
  }));
  const trimmed = trimDialogueToLength(turns, 60);
  assert.equal(spokenWordCount(trimmed), 60);
  assert.equal(trimmed.length, 6);
});

test('extra large text size becomes the largest remaining size', () => {
  assert.equal(clampedFontStep(null, 3), 1);
  assert.equal(clampedFontStep(0, 3), 0);
  assert.equal(clampedFontStep(2, 3), 2);
  assert.equal(clampedFontStep(3, 3), 2);
  assert.equal(clampedFontStep(9, 3), 2);
});
