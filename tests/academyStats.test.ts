import test from 'node:test';
import assert from 'node:assert/strict';
import { countTestsThisWeek, joinResultMessage, normalizeInviteCode, startOfLocalWeek } from '../academyStats.ts';

test('invite codes keep 6 to 8 letters and digits', () => {
  assert.equal(normalizeInviteCode(' ab-cd12 '), 'ABCD12');
  assert.equal(normalizeInviteCode('abc'), '');
  assert.equal(normalizeInviteCode('ABCDEFGHI'), '');
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
