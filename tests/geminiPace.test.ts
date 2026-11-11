import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GEMINI_GAP_DEFAULT_MS,
  geminiBackoffMs,
  geminiGapWaitMs,
  geminiIsBusy,
  geminiProblemText,
  geminiRetryDelayMs,
  readBankGeminiModel,
  readGeminiGapMs,
  RefillPause,
  retryWhileBusy,
} from '../geminiPace.ts';

test('the bank waits about five seconds between Gemini calls unless configured', () => {
  assert.equal(readGeminiGapMs(undefined), GEMINI_GAP_DEFAULT_MS);
  assert.equal(readGeminiGapMs(''), 5000);
  assert.equal(readGeminiGapMs('4000'), 4000);
  assert.equal(readGeminiGapMs('0'), 0);
  assert.equal(readGeminiGapMs('999999'), 5000);
  assert.equal(geminiGapWaitMs(0, 10_000, 5000), 0);
  assert.equal(geminiGapWaitMs(10_000, 12_000, 5000), 3000);
});

test('the bank model override is optional and rejects junk', () => {
  assert.equal(readBankGeminiModel(undefined), null);
  assert.equal(readBankGeminiModel(''), null);
  assert.equal(readBankGeminiModel('gemini-2.5-flash-lite'), 'gemini-2.5-flash-lite');
  assert.equal(readBankGeminiModel('gemini-3.1-flash-lite'), 'gemini-3.1-flash-lite');
  assert.equal(readBankGeminiModel('Gemini 3'), null);
  assert.equal(readBankGeminiModel('../evil'), null);
});

test('a busy Gemini error is recognized and keeps the status', () => {
  const busy = Object.assign(new Error('The story service is busy. Please try again.'), {
    status: 429,
    upstream: { status: 429, message: 'Resource exhausted. Please retry in 8s. key=AIzaSySECRET' },
  });
  assert.equal(geminiIsBusy(busy), true);
  assert.match(geminiProblemText(busy), /^429 Resource exhausted/);
  assert.equal(geminiProblemText(busy).includes('AIza'), false);
  assert.equal(geminiRetryDelayMs(busy), 8000);
  assert.equal(geminiIsBusy(Object.assign(new Error('per day quota'), { status: 429 })), false);
  assert.equal(geminiIsBusy(new Error('[503 Service Unavailable] RESOURCE_EXHAUSTED')), true);
  const keyed = Object.assign(new Error('busy'), { status: 503, retryDelay: '12s' });
  assert.equal(geminiRetryDelayMs(keyed), 12000);
});

test('backoff grows from 5s to 40s and honors a longer server delay', () => {
  assert.equal(geminiBackoffMs(0, null, () => 0), 5000);
  assert.equal(geminiBackoffMs(1, null, () => 0), 10000);
  assert.equal(geminiBackoffMs(2, null, () => 0), 20000);
  assert.equal(geminiBackoffMs(3, null, () => 0), 40000);
  assert.equal(geminiBackoffMs(0, 12000, () => 0), 12000);
  assert.equal(geminiBackoffMs(0, null, () => 0.5), 5500);
});

test('a rate limit retries the same step and does not treat the wait as a failure', async () => {
  const waits: number[] = [];
  let calls = 0;
  const result = await retryWhileBusy({
    deadline: 1_000_000,
    reserveMs: 1000,
    now: () => 0,
    random: () => 0,
    sleep: async (ms) => { waits.push(ms); },
    onBusy: async () => undefined,
    run: async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('The story service is busy. Please try again.'), { status: 429 });
      return 'lesson';
    },
  });
  assert.equal(result, 'lesson');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [5000, 10000]);
});

test('not enough time left pauses the hop instead of starting a long wait', async () => {
  await assert.rejects(
    () => retryWhileBusy({
      deadline: 10_000,
      reserveMs: 20_000,
      now: () => 0,
      random: () => 0,
      sleep: async () => undefined,
      onBusy: async () => undefined,
      run: async () => {
        throw Object.assign(new Error('busy'), { status: 503 });
      },
    }),
    (error: unknown) => error instanceof RefillPause,
  );
});
