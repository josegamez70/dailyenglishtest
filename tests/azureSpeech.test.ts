import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AZURE_TTS_OUTPUT_FORMAT,
  AZURE_VOICE_FIRST,
  AZURE_VOICE_SECOND,
  azureSpeechEndpoint,
  buildListeningSsml,
  spokenCharacterCount,
  synthesizeNeuralMp3,
} from '../azureSpeech.ts';

test('a story uses one American neural voice and escapes SSML', () => {
  const speech = buildListeningSsml({
    format: 'text',
    story: 'Tom & Jerry <meet> at "home".',
    dialogue: [],
  });
  assert.match(speech.ssml, new RegExp(`<voice name="${AZURE_VOICE_FIRST}">`));
  assert.equal(speech.ssml.includes(AZURE_VOICE_SECOND), false);
  assert.match(speech.ssml, /Tom &amp; Jerry &lt;meet&gt; at &quot;home&quot;\./);
  assert.equal(speech.spokenCharacters, 'Tom & Jerry <meet> at "home".'.length);
  assert.equal(spokenCharacterCount(speech.lines), speech.spokenCharacters);
  assert.equal(speech.spokenCharacters < speech.ssml.length, true);
});

test('a conversation gives each speaker a distinct voice', () => {
  const speech = buildListeningSsml({
    format: 'dialogue',
    story: '',
    dialogue: [
      { speaker: 'Anna', line: 'Hello Sophie.', gender: 'female' },
      { speaker: 'Sophie', line: 'Hi Anna.', gender: 'female' },
      { speaker: 'Anna', line: 'How are you?', gender: 'female' },
    ],
  });
  assert.match(speech.ssml, new RegExp(`<voice name="${AZURE_VOICE_FIRST}">Anna\\. Hello Sophie\\.</voice>`));
  assert.match(speech.ssml, new RegExp(`<voice name="${AZURE_VOICE_SECOND}">Sophie\\. Hi Anna\\.</voice>`));
  const ava = speech.ssml.split(AZURE_VOICE_FIRST).length - 1;
  const andrew = speech.ssml.split(AZURE_VOICE_SECOND).length - 1;
  assert.equal(ava, 2);
  assert.equal(andrew, 1);
  assert.equal(speech.spokenCharacters, 'Anna. Hello Sophie.'.length + 'Sophie. Hi Anna.'.length + 'Anna. How are you?'.length);
});

test('the speech endpoint is the regional Azure TTS URL', () => {
  assert.equal(
    azureSpeechEndpoint('swedencentral'),
    'https://swedencentral.tts.speech.microsoft.com/cognitiveservices/v1',
  );
  assert.throws(() => azureSpeechEndpoint('https://evil.example'), /Azure speech failed/);
});

test('a 429 is retried with backoff and then the mp3 is returned', async () => {
  const waits: number[] = [];
  let calls = 0;
  const result = await synthesizeNeuralMp3({
    key: 'secret-key',
    region: 'swedencentral',
    ssml: '<speak>Hello</speak>',
    spokenCharacters: 5,
    sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async (_url, init) => {
      calls += 1;
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('Ocp-Apim-Subscription-Key'), 'secret-key');
      assert.equal(headers.get('X-Microsoft-OutputFormat'), AZURE_TTS_OUTPUT_FORMAT);
      assert.equal(headers.get('Content-Type'), 'application/ssml+xml');
      if (calls < 3) {
        return new Response('busy', { status: 429, headers: calls === 1 ? { 'retry-after': '2' } : {} });
      }
      return new Response(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64]), { status: 200 });
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.attempts, 3);
  assert.equal(result.audio.byteLength, 64);
  assert.equal(result.spokenCharacters, 5);
  assert.deepEqual(waits, [2000, 2000]);
  assert.equal(calls, 3);
});

test('repeated 429s stop instead of calling Azure forever', async () => {
  let calls = 0;
  const result = await synthesizeNeuralMp3({
    key: 'secret-key',
    region: 'swedencentral',
    ssml: '<speak>Hello</speak>',
    maxAttempts: 3,
    sleep: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      return new Response('busy', { status: 429 });
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 429);
  assert.equal(result.retryable, true);
  assert.equal(result.attempts, 3);
  assert.equal(calls, 3);
});
