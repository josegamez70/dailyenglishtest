import test from 'node:test';
import assert from 'node:assert/strict';
import { AZURE_SLOWER_BOOST, VOICE_LIST_TIMEOUT_MS, azurePlaybackRate, slowerPlaybackRate, whenVoicesReady } from '../speechVoices.ts';

test('slower playback is 55 percent of the profile speed and does not change pitch', () => {
  assert.ok(Math.abs(slowerPlaybackRate(1) - 0.55) < 1e-10);
  assert.ok(Math.abs(slowerPlaybackRate(1.25) - 0.6875) < 1e-10);
  assert.ok(Math.abs(slowerPlaybackRate(0.75) - 0.4125) < 1e-10);
  const pitch = 1.12;
  const slower = { rate: slowerPlaybackRate(1), pitch };
  assert.ok(Math.abs(slower.rate - 0.55) < 1e-10);
  assert.equal(slower.pitch, pitch);
});

test('Azure slower playback is 26.5 percent above the browser slower rate and normal speed stays the same', () => {
  for (const profile of [0.75, 1, 1.25]) {
    const browserSlower = slowerPlaybackRate(profile);
    const after = azurePlaybackRate(browserSlower, profile);
    assert.ok(Math.abs(after - browserSlower * AZURE_SLOWER_BOOST) < 1e-10);
    assert.ok(Math.abs(after / browserSlower - 1.265) < 1e-10);
    assert.equal(azurePlaybackRate(profile, profile), profile);
  }
  assert.ok(Math.abs(azurePlaybackRate(0.55, 1) - 0.69575) < 1e-10);
  assert.equal(AZURE_SLOWER_BOOST, 1.265);
});

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
