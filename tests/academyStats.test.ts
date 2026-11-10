import test from 'node:test';
import assert from 'node:assert/strict';
import { academyPillName, copyInviteText, copyWithHiddenTextarea, countPhrase, countTestsThisWeek, inviteBannerText, inviteLink, joinResultMessage, normalizeInviteCode, startOfLocalWeek, studentPillName, studentRosterLabel } from '../academyStats.ts';

test('the copied invite is the full join link for this site', () => {
  assert.equal(
    inviteLink('https://dailyenglishtest.es', '4WFXV3ZL'),
    'https://dailyenglishtest.es/join?code=4WFXV3ZL',
  );
  assert.equal(
    inviteLink('https://preview.example.com/', '4WFXV3ZL'),
    'https://preview.example.com/join?code=4WFXV3ZL',
  );
});

test('copy uses the clipboard and a hidden field when that fails', async () => {
  let written = '';
  const copied = await copyInviteText('https://dailyenglishtest.es/join?code=4WFXV3ZL', {
    writeText: async (value) => { written = value; },
  });
  assert.equal(copied, true);
  assert.equal(written, 'https://dailyenglishtest.es/join?code=4WFXV3ZL');

  let fallbackText = '';
  const recovered = await copyInviteText('https://preview.example.com/join?code=4WFXV3ZL', {
    writeText: async () => { throw new Error('denied'); },
    fallback: (value) => {
      fallbackText = value;
      return true;
    },
  });
  assert.equal(recovered, true);
  assert.equal(fallbackText, 'https://preview.example.com/join?code=4WFXV3ZL');

  const area = {
    value: '',
    style: { position: '', left: '', top: '', opacity: '' },
    setAttribute() {},
    focus() {},
    select() {},
  };
  let command = '';
  let attached = false;
  const hidden = copyWithHiddenTextarea('https://dailyenglishtest.es/join?code=4WFXV3ZL', {
    createElement: () => area,
    body: {
      appendChild() { attached = true; },
      removeChild() { attached = false; },
    },
    execCommand: (name) => {
      command = name;
      return true;
    },
  });
  assert.equal(hidden, true);
  assert.equal(command, 'copy');
  assert.equal(area.value, 'https://dailyenglishtest.es/join?code=4WFXV3ZL');
  assert.equal(attached, false);
});

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

test('an owner identifies a student by display name and email', () => {
  assert.equal(studentRosterLabel('Mighty J', 'student@example.com'), 'Mighty J – student@example.com');
  assert.equal(studentRosterLabel('  Mighty   J  ', ' student@example.com '), 'Mighty J – student@example.com');
  assert.equal(studentRosterLabel('', 'student@example.com'), 'student@example.com');
  assert.equal(studentRosterLabel('   ', 'student@example.com'), 'student@example.com');
  assert.equal(studentRosterLabel('Mighty J', ' '), 'Mighty J');
  assert.equal(studentRosterLabel(null, null), 'Student');
});

test('a student pill uses their display name, not the academy name', () => {
  assert.equal(studentPillName('Mighty J', 'student@example.com'), 'Mighty J');
  assert.equal(studentPillName('  Mighty J  ', 'student@example.com'), 'Mighty J');
  assert.equal(studentPillName('', 'josegamez70@hotmail.com'), 'josegamez70');
  assert.equal(studentPillName(null, '  '), 'Student');
});

test('the public academy name is the owner display name, then the record name', () => {
  assert.equal(academyPillName('SUPER ACADEMIIA', 'Gamez'), 'SUPER ACADEMIIA');
  assert.equal(academyPillName('  SUPER ACADEMIIA  ', 'Gamez'), 'SUPER ACADEMIIA');
  assert.equal(academyPillName('', 'Gamez'), 'Gamez');
  assert.equal(academyPillName(null, 'Gamez'), 'Gamez');
  assert.equal(academyPillName('   ', null), 'Academy');
});

test('join errors use simple English', () => {
  assert.equal(joinResultMessage('ok'), null);
  assert.equal(joinResultMessage('invalid_code'), 'That code does not match an academy.');
  assert.equal(joinResultMessage('academy_full'), 'This academy is full.');
  assert.equal(joinResultMessage('academy_inactive'), 'This academy is not accepting students right now.');
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
