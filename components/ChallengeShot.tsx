import { useEffect } from 'react';
import { AppShell } from './AppShell';
import { DailyChallengePage } from './DailyChallengePage';
import { ScoreboardPage } from './ScoreboardPage';
import { demoRows } from '../scoreboard';
import type { ChallengeEntry } from '../dailyChallenge';
import { setRetroActive } from '../retroTheme';

const CHALLENGE_ROWS: ChallengeEntry[] = [
  { alias: 'Demo Alba', isSelf: false, demo: true, correct: 18, total: 20, seconds: 754 },
  { alias: 'Demo Bruno', isSelf: false, demo: true, correct: 16, total: 20, seconds: 690 },
  { alias: 'You', isSelf: true, demo: false, correct: 15, total: 20, seconds: 812 },
  { alias: 'Demo Celia', isSelf: false, demo: true, correct: 15, total: 20, seconds: 901 },
  { alias: 'Demo Diego', isSelf: false, demo: true, correct: 12, total: 20, seconds: 640 },
];

const PREVIEW = {
  day: '2026-11-19',
  level: 'B1' as const,
  startedAt: '2026-11-19T08:00:00Z',
  reading: {
    title: 'The Saturday Market',
    topic: 'Daily life',
    story: 'Marta arrived before the bread stall opened. She counted the coins in her pocket and chose a small loaf.\n\nThe stall holder wrapped the loaf in paper and said the next batch would be later.\n\nShe walked home along the canal, where the Saturday market was already loud.',
    quiz: [{ question: 'When did Marta arrive?', options: ['After lunch', 'Before the bread stall opened', 'At night', 'On Monday'], correctAnswer: 'Before the bread stall opened', explanation: 'The first sentence says she arrived before it opened.' }],
  },
  listening: {
    title: 'A Late Train',
    topic: 'Travel',
    audioUrl: null,
    quiz: [{ question: 'What is late?', options: ['The bus', 'The train', 'The flight', 'The taxi'], correctAnswer: 'The train', explanation: 'The title names the train.' }],
  },
  grammar: {
    title: 'Grammar: Fill in the blanks',
    exercise: 'blanks',
    items: [{ kind: 'choice' as const, prompt: 'She ___ to the market every Saturday.', options: ['go', 'goes', 'going', 'gone'], correctAnswer: 'goes', explanation: 'She takes -s.' }],
  },
  result: {
    correct: 12,
    total: 15,
    seconds: 812,
    position: 3,
    missing: false,
    report: [
      { part: 'reading' as const, question: 'When did Marta arrive?', userAnswer: 'After lunch', correctAnswer: 'Before the bread stall opened', correct: false, why: 'The first sentence says she arrived before it opened.' },
      { part: 'listening' as const, question: 'What is late?', userAnswer: 'The train', correctAnswer: 'The train', correct: true, why: 'The recording says the train is late.' },
      { part: 'grammar' as const, question: 'She ___ to the market every Saturday.', userAnswer: 'go', correctAnswer: 'goes', correct: false, why: 'She takes -s.' },
    ],
  },
};

/** Local screenshot page. Vite drops this route from the production build. */
export function ChallengeShot() {
  const params = new URLSearchParams(window.location.search);
  const theme = params.get('theme') || 'light';
  const view = params.get('view') || 'play';
  const menu = params.get('menu') === '1';
  const role = params.get('role') || 'individual';
  useEffect(() => {
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    if (theme === 'retro') document.documentElement.setAttribute('data-theme', 'retro95');
    else document.documentElement.removeAttribute('data-theme');
    setRetroActive(theme === 'retro');
  }, [theme]);
  const active = view === 'ranking' || view === 'challenge' ? 'scoreboard' : 'challenge';
  return (
    <AppShell
      active={active}
      onNavigate={() => undefined}
      onSignOut={() => undefined}
      email={params.get('email') || 'demo.learner@example.com'}
      status="Free lessons left: 7 of 12"
      showAcademy={role !== 'individual'}
      academyName={role === 'individual' ? null : (params.get('academy') || 'Demo Academy')}
      academyRole={role === 'student' ? 'student' : role === 'owner' ? 'owner' : null}
      displayName={params.has('name') ? params.get('name') : 'Demo Alba'}
      menuOpen={menu}
      onHome={params.get('home') === '0' ? undefined : () => undefined}
    >
      {view === 'ranking' || view === 'challenge' ? (
        <div id="shot-scoreboard">
          <ScoreboardPage
            displayName=""
            profileLevel="B1"
            fixture={{
              rows: demoRows('all'),
              source: 'demo',
              challengeRows: CHALLENGE_ROWS,
              initialView: view === 'challenge' ? 'challenge' : 'all',
            }}
          />
        </div>
      ) : (
        <div id="shot-challenge">
          <DailyChallengePage
            preview={{
              ...PREVIEW,
              result: view === 'result' || view === 'report' ? PREVIEW.result : undefined,
              ranking: CHALLENGE_ROWS,
            }}
            startPart={view === 'reading' || view === 'question' ? 'reading' : null}
          />
        </div>
      )}
    </AppShell>
  );
}
