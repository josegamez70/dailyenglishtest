import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AZURE_VOICE_FEMALE, AZURE_VOICE_MALE, buildListeningSsml } from '../azureSpeech.ts';
import { savedListeningCachePath, savedListeningSpeech, storedSavedAudioPath } from '../savedListeningAudio.ts';

test('a saved dialogue keeps each speaker on the matching Azure voice', () => {
  const speech = savedListeningSpeech({
    mode: 'listening',
    format: 'dialogue',
    story: 'James: The train is late.\nAnna: We can wait inside.',
    dialogue: [
      { speaker: 'James', line: 'The train is late.', gender: 'female' },
      { speaker: 'Anna', line: 'We can wait inside.', gender: 'male' },
    ],
  });
  assert.ok(speech);
  if (!speech) return;
  assert.equal(speech.dialogue[0].gender, 'male');
  assert.equal(speech.dialogue[1].gender, 'female');
  const built = buildListeningSsml(speech);
  assert.match(built.ssml, new RegExp(`<voice name="${AZURE_VOICE_MALE}">The train is late\\.`));
  assert.match(built.ssml, new RegExp(`<voice name="${AZURE_VOICE_FEMALE}">We can wait inside\\.`));
  assert.equal(built.ssml.includes('>James.'), false);
  assert.equal(built.ssml.includes('>Anna.'), false);
  const path = savedListeningCachePath(speech);
  assert.match(path, /^listening\/[0-9a-f]{64}\.mp3$/);
  assert.equal(savedListeningCachePath(speech), path);
  assert.equal(storedSavedAudioPath({ audioPath: path }, speech), path);
  assert.equal(storedSavedAudioPath({ audioPath: 'listening/' + 'a'.repeat(64) + '.mp3' }, speech), null);
  const slowPath = savedListeningCachePath(speech, { slow: true });
  assert.notEqual(slowPath, path);
  assert.match(slowPath, /^listening\/[0-9a-f]{64}\.mp3$/);
  assert.equal(storedSavedAudioPath({ audioSlowPath: slowPath }, speech, { slow: true }), slowPath);
});

test('a saved text lesson is spoken as one story', () => {
  const speech = savedListeningSpeech({
    mode: 'listening',
    format: 'text',
    story: 'Anna walked to the market.',
    dialogue: [{ speaker: 'James', line: 'Ignored.', gender: 'male' }],
  });
  assert.deepEqual(speech, {
    format: 'text',
    story: 'Anna walked to the market.',
    dialogue: [],
  });
});

test('opening a saved listening lesson asks for Azure audio', () => {
  const api = readFileSync(new URL('../api/listening-saved-audio.ts', import.meta.url), 'utf8');
  assert.match(api, /synthesizeNeuralMp3/);
  assert.match(api, /signListeningAudio/);
  assert.match(api, /userWasServedBankItem/);
  assert.match(api, /fallback: 'browser'/);
  assert.match(api, /audioPath/);
  const slow = readFileSync(new URL('../api/listening-slow-audio.ts', import.meta.url), 'utf8');
  assert.match(slow, /slow: true/);
  assert.match(slow, /audioSlowPath/);
  assert.match(slow, /fallback: 'browser'/);
  const screen = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(screen, /listeningSlowAudio/);
  assert.match(screen, /playbackRate = 1/);
  assert.match(screen, /savedListeningAudio/);
  assert.match(screen, /lessonSavedIdRef/);
});
