import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { displayNameError } from '../displayName.ts';

test('a display name allows letters, accents, and simple punctuation', () => {
  assert.equal(displayNameError(''), null);
  assert.equal(displayNameError('  María José  '), null);
  assert.equal(displayNameError("Ana_2-B. O'Neil"), null);
  assert.equal(displayNameError('ñandú'), null);
  assert.match(displayNameError('<b>x') ?? '', /letters, numbers/);
  assert.match(displayNameError('a`b') ?? '', /letters, numbers/);
  assert.match(displayNameError('a{b}') ?? '', /letters, numbers/);
  assert.match(displayNameError('say "hi"') ?? '', /letters, numbers/);
  assert.match(displayNameError('line\nbreak') ?? '', /letters, numbers/);
  assert.match(displayNameError('x'.repeat(41)) ?? '', /40 characters/);
  const sql = readFileSync(new URL('../supabase/migrations/20261211_display_name_chars.sql', import.meta.url), 'utf8');
  const updateAt = sql.toLowerCase().indexOf('update public.profiles');
  const checkAt = sql.toLowerCase().indexOf('add constraint profiles_display_name_chars');
  assert.ok(updateAt > 0 && checkAt > updateAt);
  assert.match(sql, /sanitized_display_name/);
  assert.match(sql, /'Learner'/);
  assert.match(sql, /name_invalid/);
  assert.equal(sql.toLowerCase().includes('delete from'), false);
  const profile = readFileSync(new URL('../components/ProfilePage.tsx', import.meta.url), 'utf8');
  assert.match(profile, /displayNameError/);
  assert.ok(profile.indexOf('if (!result.ok)') < profile.indexOf('setSaved({ name: nextName'));
});
