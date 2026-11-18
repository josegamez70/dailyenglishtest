import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addExercise,
  badgeUnlocked,
  emptyBadgeStats,
  freshBadges,
  madridStreak,
  presentBadges,
  type BadgeStats,
} from '../badges.ts';

const now = new Date('2026-11-18T12:00:00Z');

function stats(partial: Partial<BadgeStats> = {}): BadgeStats {
  return { ...emptyBadgeStats(), ...partial };
}

test('badges use finished exercises and leave video locked', () => {
  const none = stats();
  assert.equal(badgeUnlocked('reading', none, now), false);
  assert.equal(badgeUnlocked('video', stats({ reading: 30, listening: 30, grammar: 30 }), now), false);
  const one = stats({ reading: 1, listening: 4, grammar: 1, vocabAnswers: 3 });
  assert.equal(badgeUnlocked('reading', one, now), true);
  assert.equal(badgeUnlocked('listening', one, now), true);
  assert.equal(badgeUnlocked('grammar', one, now), true);
  assert.equal(badgeUnlocked('vocabulary', one, now), false);
  assert.equal(badgeUnlocked('audio', one, now), false);
  assert.equal(badgeUnlocked('vocabulary', stats({ vocabAnswers: 4 }), now), true);
  assert.equal(badgeUnlocked('audio', stats({ listening: 5 }), now), true);
  assert.equal(badgeUnlocked('bmx', stats({ reading: 15, listening: 6, grammar: 2 }), now), false);
  assert.equal(badgeUnlocked('bmx', stats({ reading: 15, listening: 6, grammar: 4 }), now), true);
  const shown = presentBadges(none, now);
  assert.equal(shown.find((badge) => badge.id === 'video')?.comingSoon, true);
  assert.equal(shown.find((badge) => badge.id === 'video')?.unlocked, false);
});

test('the Walkman needs three Madrid days in a row and handles the clock change', () => {
  assert.equal(madridStreak(['2026-11-16', '2026-11-17'], now), 2);
  assert.equal(madridStreak(['2026-11-16', '2026-11-17', '2026-11-18'], now), 3);
  assert.equal(madridStreak(['2026-03-28'], new Date('2026-03-29T12:00:00Z')), 1);
  assert.equal(madridStreak(['2026-03-27'], new Date('2026-03-29T12:00:00Z')), 0);
  const before = stats({
    reading: 15,
    listening: 6,
    grammar: 2,
    vocabAnswers: 4,
    days: ['2026-11-16', '2026-11-17'],
  });
  const after = addExercise(before, 'reading', now);
  assert.deepEqual(freshBadges(before, after, now), ['walkman']);
  assert.equal(badgeUnlocked('bmx', after, now), false);
});

test('the badge popup uses the shared sound helper and the panel greys out locked icons', () => {
  const panel = readFileSync(new URL('../components/Achievements.tsx', import.meta.url), 'utf8');
  const effects = readFileSync(new URL('../effects.ts', import.meta.url), 'utf8');
  assert.match(panel, /Coming soon/);
  assert.match(panel, /badge-locked/);
  assert.match(panel, /playEffect\('complete', true\)/);
  assert.match(effects, /if \(!soundEffectsEnabled\(\)\) return;/);
  assert.equal(panel.includes('gemini'), false);
  assert.match(panel, /\/badges\/\$\{id\}\.png/);
  assert.match(panel, /\/badges\/check\.svg/);
  assert.equal(panel.includes('/badges/reading.svg'), false);
  const icons = ['reading', 'listening', 'grammar', 'vocabulary', 'audio', 'video', 'walkman', 'bmx'];
  for (const name of icons) {
    const png = readFileSync(new URL(`../public/badges/${name}.png`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.toString('latin1').toLowerCase().includes('sony'), false);
  }
  const check = readFileSync(new URL('../public/badges/check.svg', import.meta.url), 'utf8');
  assert.match(check, /<svg/);
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const grammar = readFileSync(new URL('../components/GrammarPage.tsx', import.meta.url), 'utf8');
  assert.match(app, /playEffect\(right \? 'correct' : 'wrong', retro\)/);
  assert.match(grammar, /playEffect\(right \? 'correct' : 'wrong', retro\)/);
});
