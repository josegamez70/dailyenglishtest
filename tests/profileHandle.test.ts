import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { profileHandle, usernameFormatError } from '../profileHandle.ts';

test('a username is a chosen @, not an email or a display name with spaces', () => {
  assert.equal(profileHandle('JmgamezBest'), '@JmgamezBest');
  assert.equal(profileHandle('@JmgamezBest'), '@JmgamezBest');
  assert.equal(profileHandle('Jose Maria'), '');
  assert.equal(profileHandle('josegamez70+detest@gmail.com'), '');
  assert.equal(profileHandle('ab'), '');
  assert.equal(usernameFormatError('ab'), 'Use 3 to 24 letters, numbers, or underscores.');
  assert.equal(usernameFormatError(''), 'Choose a username.');
  assert.equal(usernameFormatError('JmgamezBest'), null);
  const page = readFileSync(new URL('../components/ProfilePage.tsx', import.meta.url), 'utf8');
  assert.match(page, /\{username\}/);
  assert.equal(page.includes('profileHandle(name)'), false);
  const sql = readFileSync(new URL('../supabase/migrations/20261208_profile_username.sql', import.meta.url), 'utf8');
  assert.match(sql, /add column if not exists handle text/);
  assert.match(sql, /profiles_handle_lower_uidx/);
  assert.match(sql, /claim_username/);
  assert.equal(sql.toLowerCase().includes('update public.profiles set handle'), false);
  assert.equal(sql.toLowerCase().includes('display_name'), false);
});
