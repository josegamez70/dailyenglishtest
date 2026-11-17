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
