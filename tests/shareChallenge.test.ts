import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildShareLink, decodeShare, savedChallengePercent } from '../shareChallenge.ts';

const lesson = {
  mode: 'reading',
  title: 'The corner shop',
  level: 'B1',
  format: 'text',
  story: 'Rosa bought bread.',
  dialogue: [],
  quiz: [{
    question: 'What did Rosa buy?',
    options: ['Bread', 'Milk'],
    correctAnswer: 'Bread',
    explanation: 'The story says bread.',
  }],
  grades: [{ correct: true, userAnswer: 'Bread', correctAnswer: 'Bread', prompt: 'What?', explanation: 'Because.' }],
  email: 'josegamez70+detest@gmail.com',
};

test('a share link carries the exercise, the score, and the @, and nothing private', () => {
  const share = buildShareLink('https://dailyenglishtest.es/', {
    mode: 'reading',
    title: 'The corner shop',
    handle: 'JmgamezBest',
    percent: 80,
    lesson,
  });
  assert.ok(share);
  assert.equal(share.line, 'I scored 80% — can you beat it? — @JmgamezBest');
  assert.match(share.url, /^https:\/\/dailyenglishtest\.es\/share#/);
  assert.equal(share.url.includes('gmail'), false);
  assert.equal(share.url.includes('userAnswer'), false);
  const card = decodeShare(share.url.split('#')[1]);
  assert.equal(card?.handle, '@JmgamezBest');
  assert.equal(card?.percent, 80);
  assert.equal(card?.lesson.story, 'Rosa bought bread.');
  assert.equal(JSON.stringify(card).includes('userAnswer'), false);
  assert.equal(JSON.stringify(card).includes('gmail'), false);
  assert.equal(savedChallengePercent(lesson), 100);
  assert.equal(savedChallengePercent({}), null);
  const quiet = buildShareLink('https://dailyenglishtest.es', {
    mode: 'reading',
    title: 'The corner shop',
    handle: 'student@example.com',
    percent: 80,
    lesson,
  });
  assert.equal(quiet?.line, 'I scored 80% — can you beat it?');
  const page = readFileSync(new URL('../components/SharePage.tsx', import.meta.url), 'utf8');
  assert.match(page, /without an account/);
  assert.match(page, /share-listening-audio/);
  assert.equal(page.includes('stays with the sender'), false);
  const listening = buildShareLink('https://dailyenglishtest.es', {
    mode: 'listening',
    title: 'The corner shop',
    handle: 'JmgamezBest',
    percent: 80,
    lesson: {
      ...lesson,
      savedLessonId: '11111111-1111-4111-8111-111111111111',
      bankId: '22222222-2222-4222-8222-222222222222',
      audioPath: `listening/${'a'.repeat(64)}.mp3`,
    },
  });
  const heard = decodeShare(listening?.url.split('#')[1] ?? '');
  assert.equal(heard?.lesson.savedLessonId, '11111111-1111-4111-8111-111111111111');
  assert.equal(heard?.lesson.bankId, '22222222-2222-4222-8222-222222222222');
  assert.equal(JSON.stringify(heard).includes('audioPath'), false);
  const api = readFileSync(new URL('../api/share-listening-audio.ts', import.meta.url), 'utf8');
  assert.match(api, /listeningAudioPathForRow/);
  assert.equal(api.includes('createSignedUrl'), false);
  assert.match(api, /isListeningAudioPath/);
  const menu = readFileSync(new URL('../components/ShareMenu.tsx', import.meta.url), 'utf8');
  assert.match(menu, /wa\.me/);
  assert.match(menu, /mailto:/);
  assert.match(menu, /navigator\.share/);
  assert.match(menu, /Choose a username/);
  assert.match(menu, /claimUsername/);
  assert.equal(menu.includes('sendSmtpMail'), false);
});
