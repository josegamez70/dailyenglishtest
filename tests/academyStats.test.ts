import test from 'node:test';
import assert from 'node:assert/strict';
import { countPhrase, countTestsThisWeek, inviteBannerText, joinResultMessage, normalizeInviteCode, startOfLocalWeek } from '../academyStats.ts';

test('invite codes keep 6 to 8 letters and digits', () => {
  assert.equal(normalizeInviteCode(' ab-cd12 '), 'ABCD12');
  assert.equal(normalizeInviteCode('abc'), '');
  assert.equal(normalizeInviteCode('ABCDEFGHI'), '');
});

test('counts use the singular word for one', () => {
  assert.equal(countPhrase(1, 'test'), '1 test');
  assert.equal(countPhrase(0, 'test'), '0 tests');
  assert.equal(countPhrase(2, 'test'), '2 tests');
  assert.equal(countPhrase(1, 'student'), '1 student');
  assert.equal(countPhrase(4, 'lesson'), '4 lessons');
});

test('an invite banner names the academy when it is known', () => {
  assert.equal(
    inviteBannerText('Bright Academy'),
    'You have been invited to join Bright Academy. Sign in or create an account to join.',
  );
  assert.equal(
    inviteBannerText(null),
    'You have been invited to join an academy. Sign in or create an account to join.',
  );
  assert.equal(
    inviteBannerText('  '),
    'You have been invited to join an academy. Sign in or create an account to join.',
  );
});

test('join errors use simple English', () => {
  assert.equal(joinResultMessage('ok'), null);
  assert.equal(joinResultMessage('invalid_code'), 'That code does not match an academy.');
  assert.equal(joinResultMessage('academy_full'), 'This academy is full.');
  assert.equal(joinResultMessage('already_member'), 'You already belong to an academy.');
});

test('this week starts on Monday and ignores older tests', () => {
  const wednesday = new Date(2026, 9, 28, 15, 0, 0);
  assert.equal(startOfLocalWeek(wednesday).getDate(), 26);
  const count = countTestsThisWeek([
    new Date(2026, 9, 26, 9),
    new Date(2026, 9, 28, 10),
    new Date(2026, 9, 25, 23),
  ], wednesday);
  assert.equal(count, 2);
});
