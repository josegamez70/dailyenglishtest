import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Spanish explanations show a loading state and can be tried again', () => {
  const source = readFileSync(new URL('../components/SpanishWhy.tsx', import.meta.url), 'utf8');
  const generate = readFileSync(new URL('../api/generate.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /No translation yet/);
  assert.match(source, /Translating\.\.\./);
  assert.match(source, /Could not translate this\. Try again\./);
  assert.match(source, /Try again/);
  assert.match(generate, /SHORT_CALL_DEADLINE_MS/);
  assert.doesNotMatch(generate, /Date\.now\(\) \+ 8000/);
});
