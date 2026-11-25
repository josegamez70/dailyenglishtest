import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addExercise,
  BADGE_ORDER,
  badgeUnlocked,
  emptyBadgeStats,
  freshBadges,
  LEVEL_BADGE_PLAN,
  madridStreak,
  presentBadges,
  presentLevelBadges,
  type BadgeStats,
} from '../badges.ts';

const now = new Date('2026-11-18T12:00:00Z');

function stats(partial: Partial<BadgeStats> = {}): BadgeStats {
  return { ...emptyBadgeStats(), ...partial };
}

test('milestone badges come first and use only finished exercises', () => {
  const none = stats();
  const shown = presentBadges(none, now);
  assert.deepEqual(shown.slice(0, 5).map((badge) => badge.id), [
    'exercises_1',
    'exercises_5',
    'exercises_10',
    'exercises_25',
    'exercises_50',
  ]);
  assert.equal(shown.every((badge) => badge.kind !== 'level'), true);
  assert.equal(presentLevelBadges().length, 0);
  assert.equal(LEVEL_BADGE_PLAN[0].level, 'B2');
  assert.match(LEVEL_BADGE_PLAN[0].rule, /5 exercises/);
  assert.match(LEVEL_BADGE_PLAN[1].rule, /7 exercises/);
  const one = stats({ reading: 1, listening: 4, grammar: 1, vocabAnswers: 3, perfect: 0 });
  assert.equal(badgeUnlocked('exercises_1', one, now), true);
  assert.equal(badgeUnlocked('exercises_5', one, now), true);
  assert.equal(badgeUnlocked('exercises_10', one, now), false);
  assert.equal(badgeUnlocked('reading_1', one, now), true);
  assert.equal(badgeUnlocked('listening_1', one, now), true);
  assert.equal(badgeUnlocked('grammar_1', one, now), true);
  assert.equal(badgeUnlocked('vocab_4', one, now), false);
  assert.equal(badgeUnlocked('listening_5', one, now), false);
  assert.equal(badgeUnlocked('perfect_1', one, now), false);
  assert.equal(badgeUnlocked('vocab_4', stats({ vocabAnswers: 4 }), now), true);
  assert.equal(badgeUnlocked('listening_5', stats({ listening: 5 }), now), true);
  assert.equal(badgeUnlocked('exercises_25', stats({ reading: 15, listening: 6, grammar: 4 }), now), true);
  assert.equal(badgeUnlocked('perfect_1', stats({ perfect: 1 }), now), true);
  assert.equal(BADGE_ORDER[0], 'exercises_1');
});

test('the 3-day streak uses Madrid days and a perfect score is counted once', () => {
  assert.equal(madridStreak(['2026-11-16', '2026-11-17'], now), 2);
  assert.equal(madridStreak(['2026-11-16', '2026-11-17', '2026-11-18'], now), 3);
  assert.equal(madridStreak(['2026-03-28'], new Date('2026-03-29T12:00:00Z')), 1);
  assert.equal(madridStreak(['2026-03-27'], new Date('2026-03-29T12:00:00Z')), 0);
  const before = stats({
    reading: 4,
    listening: 0,
    grammar: 0,
    vocabAnswers: 4,
    perfect: 0,
    days: ['2026-11-16', '2026-11-17'],
  });
  const after = addExercise(before, 'reading', now, { score: 5, total: 5 });
  assert.equal(after.perfect, 1);
  assert.ok(freshBadges(before, after, now).includes('streak_3'));
  assert.ok(freshBadges(before, after, now).includes('perfect_1'));
  assert.equal(badgeUnlocked('exercises_10', after, now), false);
  const missed = addExercise(before, 'grammar', now, { score: 3, total: 5 });
  assert.equal(missed.perfect, 0);
});

test('tapping a badge explains the saved count and locked icons stay grey', () => {
  const panel = readFileSync(new URL('../components/Achievements.tsx', import.meta.url), 'utf8');
  const effects = readFileSync(new URL('../effects.ts', import.meta.url), 'utf8');
  assert.match(panel, /badge-locked/);
  assert.match(panel, /aria-haspopup="dialog"/);
  assert.match(panel, /badge\.detail/);
  assert.match(panel, /playEffect\('complete', true\)/);
  assert.match(effects, /if \(!soundEffectsEnabled\(\)\) return;/);
  assert.equal(panel.includes('gemini'), false);
  assert.equal(panel.includes('Coming soon'), false);
  assert.match(panel, /\/badges\/check\.svg/);
  const icons = [
    'exercises_1',
    'exercises_5',
    'exercises_10',
    'exercises_25',
    'exercises_50',
    'reading_1',
    'listening_1',
    'grammar_1',
    'vocab_4',
    'listening_5',
    'streak_3',
    'perfect_1',
  ];
  for (const name of icons) {
    const svg = readFileSync(new URL(`../public/badges/set/${name}.svg`, import.meta.url), 'utf8');
    assert.match(svg, /<svg/);
    assert.equal(svg.toLowerCase().includes('sony'), false);
    assert.equal(svg.toLowerCase().includes('walkman'), false);
  }
  const check = readFileSync(new URL('../public/badges/check.svg', import.meta.url), 'utf8');
  assert.match(check, /<svg/);
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const grammar = readFileSync(new URL('../components/GrammarPage.tsx', import.meta.url), 'utf8');
  assert.match(app, /playEffect\(right \? 'correct' : 'wrong', retro\)/);
  assert.match(grammar, /playEffect\(right \? 'correct' : 'wrong', retro\)/);
  const detail = presentBadges(stats({ reading: 2 }), now).find((badge) => badge.id === 'exercises_5');
  assert.match(detail?.detail ?? '', /2 of 5 exercises/);
  assert.match(detail?.rule ?? '', /Finish 5/);
});
