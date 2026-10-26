import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTopic, selectableTopics, WILDCARD_TOPIC } from '../constants.ts';
import {
  advancedSkillsAreChallenging,
  closestStorySentence,
  elapsedWholeSeconds,
  hasNearSynonymDistractor,
  isWordCountWithinTolerance,
  optionsAreDistinct,
  questionGivesAwayAnswer,
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

test('elapsed seconds follow the wall clock from the request start', () => {
  const start = 1_000_000;
  assert.equal(elapsedWholeSeconds(start, start + 0), 0);
  assert.equal(elapsedWholeSeconds(start, start + 999), 0);
  assert.equal(elapsedWholeSeconds(start, start + 1000), 1);
  assert.equal(elapsedWholeSeconds(start, start + 1999), 1);
  assert.equal(elapsedWholeSeconds(start, start + 3000), 3);
  assert.equal(elapsedWholeSeconds(start, start + 6000), 6);
  assert.equal(elapsedWholeSeconds(Number.NaN, start), 0);
  assert.equal(elapsedWholeSeconds(start, Number.POSITIVE_INFINITY), 0);
});

test('a question must not repeat the correct answer', () => {
  assert.equal(
    questionGivesAwayAnswer(
      'What specific field is mentioned as revolutionizing data analysis through artificial intelligence?',
      'Artificial intelligence'
    ),
    true
  );
  assert.equal(
    questionGivesAwayAnswer(
      'Why does the writer mention the late train?',
      'To show the town was unprepared'
    ),
    false
  );
});

test('advanced quizzes need a majority of inference, vocabulary, or intent', () => {
  assert.equal(advancedSkillsAreChallenging([
    'inference', 'inference', 'vocabulary', 'detail', 'detail',
  ]), true);
  assert.equal(advancedSkillsAreChallenging([
    'inference', 'vocabulary', 'detail', 'detail', 'detail',
  ]), false);
  assert.equal(advancedSkillsAreChallenging([]), false);
  assert.equal(advancedSkillsAreChallenging([null, 'detail', 'inference']), false);
});

test('near-synonym distractors are rejected and different ideas are kept', () => {
  assert.equal(hasNearSynonymDistractor([
    'The food was shared equitably',
    'The food was shared fairly',
    'The shop closed early',
    'A storm cancelled the trip',
  ]), true);
  assert.equal(hasNearSynonymDistractor([
    'She left at dawn',
    'She left at dusk',
    'The shop was closed',
    'A dog found the map',
  ]), false);
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
