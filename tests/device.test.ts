import test from 'node:test';
import assert from 'node:assert/strict';
import { isAndroidUserAgent } from '../device.ts';

test('Android user agents are detected and desktop agents are not', () => {
  assert.equal(
    isAndroidUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'),
    true
  );
  assert.equal(
    isAndroidUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'),
    false
  );
  assert.equal(isAndroidUserAgent(''), false);
});
