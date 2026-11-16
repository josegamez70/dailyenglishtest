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
  assert.match(css, /phase2-seg/);
  const dialog = readFileSync(new URL('../components/ExerciseComplete.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /Exercise complete!/);
  assert.match(dialog, /Review answers/);
  assert.match(dialog, /New exercise/);
  assert.match(dialog, /playResultSounds/);
});
