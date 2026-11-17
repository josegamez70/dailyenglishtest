import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playEffect, soundEffectsEnabled, writeSoundEffects } from '../effects.ts';

test('sound effects stay off until the learner turns them on', () => {
  const saved = new Map<string, string>();
  const store = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { saved.set(key, value); },
  };
  assert.equal(soundEffectsEnabled(store), false);
  writeSoundEffects(true, store);
  assert.equal(soundEffectsEnabled(store), true);
  writeSoundEffects(false, store);
  assert.equal(soundEffectsEnabled(store), false);
  playEffect('complete', true);
});

test('motion and the completion window respect reduced motion', () => {
  const css = readFileSync(new URL('../phase2.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /Exercise complete!|phase2-heading/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /data-open="true"/);
  assert.equal(/\.phase2-enter\s*\{[^}]*opacity/.test(css), false);
  const dialog = readFileSync(new URL('../components/ExerciseComplete.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /Exercise complete!/);
  assert.match(dialog, /Review answers/);
  assert.match(dialog, /New exercise/);
  assert.match(dialog, /playResultSounds\(marks, true\)/);
  assert.match(css, /align-items: center/);
  assert.match(css, /rgb\(0 0 128 \/ 0\.35\)/);
  assert.match(css, /animation: phase2-win 140ms steps\(3, end\)/);
});
