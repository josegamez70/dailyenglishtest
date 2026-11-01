import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICE_LIST_TIMEOUT_MS, whenVoicesReady } from '../speechVoices.ts';

test('an empty voice list resolves after the timeout so playback can start', async () => {
  let voices: { name: string }[] = [];
  let onChange: (() => void) | null = null;
  let timeout: (() => void) | null = null;
  let timeoutMs = 0;
  const pending = whenVoicesReady(
    {
      getVoices: () => voices,
      addEventListener: (_type, listener) => { onChange = listener; },
      removeEventListener: () => { onChange = null; },
    },
    (callback, delayMs) => {
      timeout = callback;
      timeoutMs = delayMs;
    },
  );

  let settled = false;
  void pending.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(timeoutMs, VOICE_LIST_TIMEOUT_MS);

  onChange?.();
  await Promise.resolve();
  assert.equal(settled, false);

  timeout?.();
  const list = await pending;
  assert.deepEqual(list, []);
  assert.equal(settled, true);
  assert.equal(onChange, null);
});

test('voices that arrive before the timeout are used', async () => {
  let voices: { name: string }[] = [];
  let onChange: (() => void) | null = null;
  let timeout: (() => void) | null = null;
  const pending = whenVoicesReady(
    {
      getVoices: () => voices,
      addEventListener: (_type, listener) => { onChange = listener; },
      removeEventListener: () => { onChange = null; },
    },
    (callback) => { timeout = callback; },
  );
  voices = [{ name: 'English United States' }];
  onChange?.();
  const list = await pending;
  assert.equal(list[0]?.name, 'English United States');
  assert.equal(onChange, null);
  timeout?.();
  assert.deepEqual(await pending, list);
});
