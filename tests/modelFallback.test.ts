import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OVERLOAD_FALLBACK_MODEL,
  fallbackAttemptTimeout,
  isOverloadStatus,
  overloadFallbackModel,
  primaryAttemptTimeout,
  readHttpStatus,
  runModelLoop,
} from '../modelFallback.ts';

test('overload statuses are 429, 503, and 504', () => {
  assert.equal(isOverloadStatus(429), true);
  assert.equal(isOverloadStatus(503), true);
  assert.equal(isOverloadStatus(504), true);
  assert.equal(isOverloadStatus(500), false);
  assert.equal(isOverloadStatus(404), false);
});

test('the free fallback is tried once and is not the primary model', () => {
  assert.equal(OVERLOAD_FALLBACK_MODEL, 'gemini-2.5-flash-lite');
  assert.equal(overloadFallbackModel(['gemini-3-flash-preview']), 'gemini-2.5-flash-lite');
  assert.equal(overloadFallbackModel(['gemini-3-flash-preview', 'gemini-2.5-flash-lite']), null);
});

test('status is read from the error or from a 503 message', () => {
  assert.equal(readHttpStatus(Object.assign(new Error('busy'), { status: 503 })), 503);
  assert.equal(readHttpStatus(Object.assign(new Error('busy'), { status: '503' })), 503);
  assert.equal(readHttpStatus(new Error('Error fetching: [503 Service Unavailable] overloaded')), 503);
  assert.equal(readHttpStatus(new Error('daily quota')), 0);
});

test('a fast 503 on each primary still calls the fallback', async () => {
  let now = 0;
  const calls: string[] = [];
  const text = await runModelLoop({
    deadline: 23000,
    now: () => now,
    models: ['gemini-3-flash-preview', 'gemini-3.1-flash-lite'],
    call: async (model) => {
      calls.push(model);
      now += 2000;
      if (model === OVERLOAD_FALLBACK_MODEL) return 'ok';
      throw Object.assign(new Error('overloaded'), { status: 503 });
    },
  });
  assert.equal(text, 'ok');
  assert.deepEqual(calls, ['gemini-3-flash-preview', 'gemini-3.1-flash-lite', OVERLOAD_FALLBACK_MODEL]);
});

test('a 503 that is only in the message still reaches the fallback', async () => {
  const calls: string[] = [];
  const text = await runModelLoop({
    deadline: 23000,
    now: () => 0,
    models: ['gemini-3-flash-preview'],
    call: async (model) => {
      calls.push(model);
      if (model === OVERLOAD_FALLBACK_MODEL) return 'ok';
      throw new Error('Error fetching from model: [503 Service Unavailable] overloaded');
    },
  });
  assert.equal(text, 'ok');
  assert.deepEqual(calls, ['gemini-3-flash-preview', OVERLOAD_FALLBACK_MODEL]);
});

test('an overload that uses up the primary window leaves a fallback turn', async () => {
  let now = 0;
  const calls: string[] = [];
  const text = await runModelLoop({
    deadline: 23000,
    now: () => now,
    models: ['gemini-3-flash-preview', 'gemini-3.1-flash-lite'],
    call: async (model, timeoutMs) => {
      calls.push(model);
      if (model === 'gemini-3-flash-preview') {
        now += timeoutMs;
        throw Object.assign(new Error('CLIENT_TIMEOUT'), { status: 504 });
      }
      if (model === OVERLOAD_FALLBACK_MODEL) return 'ok';
      throw new Error(`unexpected ${model}`);
    },
  });
  assert.equal(text, 'ok');
  assert.deepEqual(calls, ['gemini-3-flash-preview', OVERLOAD_FALLBACK_MODEL]);
  assert.equal(primaryAttemptTimeout(7000, 0, true) < 4000, true);
  assert.equal(fallbackAttemptTimeout(7000) >= 4000, true);
});

test('a 500 does not switch to the free fallback', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => runModelLoop({
      deadline: 23000,
      now: () => 0,
      models: ['gemini-3-flash-preview'],
      call: async (model) => {
        calls.push(model);
        throw Object.assign(new Error('broken'), { status: 500 });
      },
    }),
    (error: unknown) => {
      assert.equal((error as { status?: number }).status, 502);
      return true;
    },
  );
  assert.deepEqual(calls, ['gemini-3-flash-preview']);
});

test('an invalid thinking setting is retried once without it', async () => {
  const thinking: boolean[] = [];
  const text = await runModelLoop({
    deadline: 23000,
    now: () => 0,
    models: ['gemini-3-flash-preview'],
    call: async (_model, _timeout, useThinking) => {
      thinking.push(useThinking);
      if (useThinking) throw Object.assign(new Error('invalid argument: thinking level'), { status: 400 });
      return 'ok';
    },
  });
  assert.equal(text, 'ok');
  assert.deepEqual(thinking, [true, false]);
});
