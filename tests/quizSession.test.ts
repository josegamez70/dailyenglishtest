import test from 'node:test';
import assert from 'node:assert/strict';
import { withStoryReview } from '../quizSession.ts';

test('opening and closing story review keeps the question and the answers', () => {
  const session = { questionIndex: 2, answers: ['left at dawn', 'the map', ''], reviewOpen: false };
  const opened = withStoryReview(session, true);
  assert.equal(opened.questionIndex, 2);
  assert.deepEqual(opened.answers, ['left at dawn', 'the map', '']);
  assert.equal(opened.reviewOpen, true);
  assert.notEqual(opened.answers, session.answers);

  opened.answers[0] = 'changed';
  assert.equal(session.answers[0], 'left at dawn');

  const closed = withStoryReview(opened, false);
  assert.equal(closed.questionIndex, 2);
  assert.deepEqual(closed.answers, ['changed', 'the map', '']);
  assert.equal(closed.reviewOpen, false);
  assert.notEqual(closed.answers, opened.answers);
});
