import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Start Quiz has finishing state and a quiz error boundary', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const boundary = readFileSync(new URL('../components/QuizErrorBoundary.tsx', import.meta.url), 'utf8');
  assert.match(app, /const \[finishing, setFinishing\] = useState\(false\)/);
  assert.match(app, /<QuizErrorBoundary/);
  assert.match(app, /<QuizScreen render=\{renderQuizScreen\}/);
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /This quiz could not be shown/);
  assert.match(boundary, /Back to the lesson/);
  assert.match(boundary, /The rest of the app is still available/);
});

test('Listen again uses the lesson card, not the navy header bar', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const start = app.indexOf("storyReviewOpen && view === 'quiz'");
  const sheet = app.slice(start, start + 1600);
  assert.equal(sheet.includes('sticky'), false);
  assert.match(sheet, /Back to quiz/);
  assert.match(sheet, /Your answers are saved/);
  assert.match(sheet, /phase2-lift rounded-xl bg-white/);
});
