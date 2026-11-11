import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignDialogueToCast,
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
  narrationVoice,
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

test('a dialogue with other names is renamed onto the requested pair', () => {
  const turns = [
    { speaker: 'Emma', line: 'I missed the morning train.', gender: 'female' as const },
    { speaker: 'Lucy', line: 'We can take the next one.', gender: 'female' as const },
    { speaker: 'Emma', line: 'It leaves in ten minutes.', gender: 'female' as const },
    { speaker: 'Lucy', line: 'I will buy the tickets.', gender: 'female' as const },
  ];
  const aligned = alignDialogueToCast(turns, [
    { name: 'Anna', gender: 'female' },
    { name: 'Sophie', gender: 'female' },
  ]);
  assert.ok(aligned);
  assert.equal(aligned?.[0].speaker, 'Anna');
  assert.equal(aligned?.[1].speaker, 'Sophie');
  assert.equal(aligned?.[0].line, 'I missed the morning train.');
  assert.equal(alignDialogueToCast(turns.slice(0, 2), [{ name: 'Anna', gender: 'female' }, { name: 'Sophie', gender: 'female' }]), null);
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

test('dialogue voices are one American woman at two pitches', () => {
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
  const only = voicesBySpeaker(women, [
    { name: 'Daniel', lang: 'en-GB' },
    { name: 'Samantha', lang: 'en-US' },
    { name: 'Karen', lang: 'en-AU' },
    { name: 'Amelie', lang: 'fr-FR' },
  ]);
  assert.equal(only.anna.name, 'Samantha');
  assert.equal(only.sophie.name, 'Samantha');
  assert.equal(only.anna.lang, 'en-US');
  assert.equal(only.sophie.lang, 'en-US');
  assert.equal(only.anna.pitch, 1);
  assert.equal(only.sophie.pitch, 1.12);
  assert.equal(only.anna.rateScale, 1);
  assert.equal(only.sophie.rateScale, 1);
  assert.notEqual(only.anna.name, 'Daniel');
  assert.notEqual(only.sophie.name, 'Karen');
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
  assert.equal(mapped[0].gender, 'female');
  assert.equal(mapped[1].speaker, 'Sophie');
  assert.equal(mapped[1].gender, 'female');
  assert.equal(parseDialogue([{ speaker: 'person 1', gender: 'male', line: 'Hello there.' }])[0].gender, 'female');
  const named = parseDialogue('Anna: Hello there.\nSophie: Hi there.');
  assert.equal(named[0].speaker, 'Anna');
  assert.equal(named[0].gender, 'female');
  assert.equal(named[1].speaker, 'Sophie');
  assert.equal(named[1].gender, 'female');

  const windows = voicesBySpeaker(women, [
    { name: 'Microsoft David Desktop', lang: 'en-US' },
    { name: 'Microsoft Zira Desktop', lang: 'en-US' },
    { name: 'Microsoft Hazel', lang: 'en-GB' },
    { name: 'Google UK English Male', lang: 'en-GB' },
  ]);
  assert.equal(windows.anna.name, 'Microsoft Zira Desktop');
  assert.equal(windows.sophie.name, 'Microsoft Zira Desktop');
  assert.equal(windows.anna.pitch, 1);
  assert.equal(windows.sophie.pitch, 1.12);
  assert.notEqual(windows.sophie.name, 'Microsoft David Desktop');
  assert.notEqual(windows.sophie.name, 'Microsoft Hazel');

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
  assert.equal(chrome.lucy.name, 'Google US English');
  assert.equal(chrome.emma.pitch, 1);
  assert.equal(chrome.lucy.pitch, 1.12);
  assert.equal(chrome.emma.lang, 'en-US');
  assert.equal(chrome.lucy.lang, 'en-US');

  const androidLocales = voicesBySpeaker(women, [
    { name: 'English United States', lang: 'en_US' },
    { name: 'English United Kingdom', lang: 'en-GB' },
  ]);
  assert.equal(androidLocales.anna.name, 'English United States');
  assert.equal(androidLocales.sophie.name, 'English United States');
  assert.equal(androidLocales.anna.pitch, 1);
  assert.equal(androidLocales.sophie.pitch, 1.12);
  assert.equal(androidLocales.anna.lang, 'en-US');
  assert.equal(androidLocales.sophie.lang, 'en-US');

  const androidIds = voicesBySpeaker(
    [
      { name: 'Lucy', gender: 'female' },
      { name: 'Mia', gender: 'female' },
    ],
    [
      { name: 'English United Kingdom', lang: 'en-GB', voiceURI: 'en-gb-x-gba-local' },
      { name: 'English United Kingdom', lang: 'en-GB', voiceURI: 'en-gb-x-rjs-local' },
      { name: 'English United States', lang: 'en-US', voiceURI: 'en-us-x-tpc-local' },
      { name: 'English United States', lang: 'en-US', voiceURI: 'en-us-x-sfg-local' },
      { name: 'English United States', lang: 'en-US', voiceURI: 'en-us-x-iom-local' },
    ]
  );
  assert.equal(androidIds.lucy.voiceURI, 'en-us-x-sfg-local');
  assert.equal(androidIds.mia.voiceURI, 'en-us-x-sfg-local');
  assert.equal(androidIds.lucy.pitch, 1);
  assert.equal(androidIds.mia.pitch, 1.12);
  assert.equal(androidIds.lucy.lang, 'en-US');
  assert.equal(androidIds.mia.lang, 'en-US');
  assert.equal(String(androidIds.mia.voiceURI).includes('iom'), false);
  assert.equal(String(androidIds.mia.voiceURI).includes('rjs'), false);
  assert.equal(String(androidIds.mia.voiceURI).includes('gba'), false);

  const maleOnly = voicesBySpeaker(women, [
    { name: 'Microsoft David Desktop', lang: 'en-US' },
  ]);
  assert.equal(maleOnly.anna.name, '');
  assert.equal(maleOnly.sophie.name, '');
  assert.equal(maleOnly.anna.lang, 'en-US');
  assert.equal(maleOnly.sophie.lang, 'en-US');
  assert.equal(maleOnly.anna.pitch, 1);
  assert.equal(maleOnly.sophie.pitch, 1.12);

  const britishOnly = voicesBySpeaker(women, [
    { name: 'Google UK English Female', lang: 'en-GB' },
    { name: 'Google UK English Male', lang: 'en-GB' },
  ]);
  assert.equal(britishOnly.anna.name, '');
  assert.equal(britishOnly.anna.lang, 'en-US');
  assert.equal(britishOnly.sophie.lang, 'en-US');
  assert.equal(britishOnly.anna.pitch, 1);
  assert.equal(britishOnly.sophie.pitch, 1.12);

  const narration = narrationVoice([
    { name: 'Google UK English Female', lang: 'en-GB', default: true },
    { name: 'Microsoft David Desktop', lang: 'en-US' },
    { name: 'Microsoft Zira Desktop', lang: 'en-US' },
  ]);
  assert.equal(narration.name, 'Microsoft Zira Desktop');
  assert.equal(narration.lang, 'en-US');
  assert.equal(narration.pitch, 1);

  const narrationDefault = narrationVoice([
    { name: 'Microsoft Zira Desktop', lang: 'en-US' },
    { name: 'English United States', lang: 'en-US', voiceURI: 'en-us-x-iom-local', default: true },
  ]);
  assert.equal(narrationDefault.voiceURI, 'en-us-x-iom-local');
  assert.equal(narrationDefault.lang, 'en-US');

  const mixed = voicesBySpeaker(
    [
      { name: 'James', gender: 'male' },
      { name: 'Anna', gender: 'female' },
    ],
    [
      { name: 'Microsoft David Desktop', lang: 'en-US' },
      { name: 'Microsoft Zira Desktop', lang: 'en-US' },
    ],
  );
  assert.equal(mixed.james.name, 'Microsoft David Desktop');
  assert.equal(mixed.anna.name, 'Microsoft Zira Desktop');
  assert.equal(mixed.james.pitch, 1);
  assert.equal(mixed.anna.pitch, 1);
});

test('dialogue names rotate and long dialogues lose extra turns', () => {
  assert.deepEqual(dialogueTurnPlan(60), { turns: 6, wordsPerTurn: 10 });
  assert.deepEqual(dialogueTurnPlan(100), { turns: 10, wordsPerTurn: 10 });
  assert.deepEqual(dialogueTurnPlan(140), { turns: 14, wordsPerTurn: 10 });
  const first = pickDialogueSpeakers([], () => 0);
  assert.equal(first[0].name, 'Anna');
  assert.equal(first[0].gender, 'female');
  assert.equal(first[1].name, 'James');
  assert.equal(first[1].gender, 'male');
  assert.notEqual(first[0].name, first[1].name);
  const again = pickDialogueSpeakers([first[0].name, first[1].name], () => 0);
  const againGenders = again.map((speaker) => speaker.gender).sort().join();
  assert.equal(againGenders, 'female,male');
  assert.notEqual(again[0].name, again[1].name);
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
