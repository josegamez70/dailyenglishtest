import test from 'node:test';
import assert from 'node:assert/strict';
import { OVERLOAD_FALLBACK_MODEL, isOverloadStatus, overloadFallbackModel } from '../modelFallback.ts';

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
