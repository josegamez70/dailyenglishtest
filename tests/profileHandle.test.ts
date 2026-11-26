import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { profileHandle } from '../profileHandle.ts';

test('the profile @ comes from the display name and never from an email', () => {
  assert.equal(profileHandle('JmgamezBest'), '@JmgamezBest');
  assert.equal(profileHandle('  Jose Maria  '), '@JoseMaria');
  assert.equal(profileHandle('josegamez70+detest@gmail.com'), '');
  assert.equal(profileHandle(''), '');
  assert.equal(profileHandle('---'), '');
  const page = readFileSync(new URL('../components/ProfilePage.tsx', import.meta.url), 'utf8');
  assert.match(page, /profileHandle\(name\)/);
  assert.equal(page.includes('alter table'), false);
});
