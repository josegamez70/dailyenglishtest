import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTopic, selectableTopics, WILDCARD_TOPIC } from '../constants.ts';
import {
  closestStorySentence,
  isWordCountWithinTolerance,
  optionsAreDistinct,
  scoreFeedback,
  sentenceInStory,
  wordCountBounds,
} from '../lessonUtils.ts';

function words(count: number): string {
  return Array.from({ length: count }, () => 'word').join(' ');
}

test('word-count window is about plus or minus 15 percent', () => {
  assert.deepEqual(wordCountBounds(100), { min: 85, max: 115 });
  assert.deepEqual(wordCountBounds(150), { min: 127, max: 173 });
  assert.deepEqual(wordCountBounds(200), { min: 170, max: 230 });
  assert.equal(isWordCountWithinTolerance(words(100), 100), true);
  assert.equal(isWordCountWithinTolerance(words(115), 100), true);
  assert.equal(isWordCountWithinTolerance(words(130), 100), false);
  assert.equal(isWordCountWithinTolerance(words(84), 100), false);
});

test('score feedback changes by tier', () => {
  assert.match(scoreFeedback(0), /Keep practicing/);
  assert.match(scoreFeedback(39), /Keep practicing/);
  assert.match(scoreFeedback(40), /Good effort/);
  assert.match(scoreFeedback(69), /Good effort/);
  assert.match(scoreFeedback(70), /Well done/);
  assert.match(scoreFeedback(89), /Well done/);
  assert.match(scoreFeedback(90), /Excellent/);
  assert.match(scoreFeedback(100), /Excellent/);
});

test('wildcard picks a real topic and never the wildcard itself', () => {
  const labels = new Set(selectableTopics().map((topic) => topic.label));
  assert.equal(labels.has('Health & Sports'), true);
  assert.equal(labels.has('Technology'), true);
  assert.equal(labels.has('Culture & Food'), true);
  assert.equal(resolveTopic(WILDCARD_TOPIC, () => 0).label, 'Daily Life');
  assert.equal(resolveTopic(WILDCARD_TOPIC, () => 0).surprise, true);
  assert.equal(resolveTopic(WILDCARD_TOPIC, () => 0.999).label, 'Culture & Food');
  for (let i = 0; i < 30; i++) {
    const pick = resolveTopic(WILDCARD_TOPIC, () => i / 30);
    assert.notEqual(pick.value, WILDCARD_TOPIC);
    assert.equal(pick.surprise, true);
    assert.equal(labels.has(pick.label), true);
  }
  assert.equal(resolveTopic('technology').label, 'Technology');
  assert.equal(resolveTopic('technology').surprise, false);
});

test('supporting sentences must come from the story', () => {
  const story = 'Mia practiced every morning. The band won after intense auditions. They played downtown.';
  assert.equal(sentenceInStory('The band won after intense auditions.', story), true);
  assert.equal(sentenceInStory('They lost the show.', story), false);
  assert.equal(
    closestStorySentence('The group won because the auditions were intense.', story),
    'The band won after intense auditions.'
  );
});

test('near-identical options are rejected and different ones are kept', () => {
  assert.equal(optionsAreDistinct([
    'The committee approved the plan',
    'The committee approved the plan today',
    'A train was late',
    'The river flooded the road',
  ]), false);
  assert.equal(optionsAreDistinct([
    'She left at dawn',
    'She left at dusk',
    'The shop was closed',
    'A dog found the map',
  ]), true);
});
