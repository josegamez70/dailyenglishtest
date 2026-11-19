import { useEffect, useMemo, useState } from 'react';
import { AppShell } from './AppShell';
import { GrammarPage } from './GrammarPage';
import { VocabularyPage } from './VocabularyPage';
import { previewWords } from './VocabularyPreview';
import Configurator from './Configurator';
import { setRetroActive } from '../retroTheme';
import type { ConfigOptions } from '../types';
import type { GrammarExerciseType, GrammarItem } from '../grammarSet';
import type { GrammarLaunch } from '../savedLessonMeta';

function previewLaunch(exercise: GrammarExerciseType): GrammarLaunch {
  const choice: GrammarItem = {
    kind: 'choice',
    prompt: 'It is nearly midnight, so it is high time we _____ home.',
    options: ['go', 'went', 'have gone', 'are going'],
    correctAnswer: 'went',
    explanation: 'After high time, the verb is in the past simple.',
  };
  const second: GrammarItem = {
    kind: 'choice',
    prompt: 'By the time the train arrives, we _____ for an hour.',
    options: ['wait', 'are waiting', 'will have waited', 'waited'],
    correctAnswer: 'will have waited',
    explanation: 'By the time plus a present verb often needs the future perfect.',
  };
  const order: GrammarItem = {
    kind: 'order',
    prompt: 'Put the parts in order.',
    chunks: ['She', 'had already', 'left', 'the station.'],
    explanation: 'Already sits with the auxiliary.',
  };
  const titles = {
    blanks: 'Grammar: Fill in the blanks',
    phrasal: 'Grammar: Phrasal verbs',
    order: 'Grammar: Put in order',
  } as const;
  return {
    id: '',
    token: 1,
    level: 'C1',
    exercise,
    topic: exercise === 'order' ? '' : 'Travel',
    title: titles[exercise],
    items: exercise === 'order' ? [order, { ...order, prompt: 'Put the next parts in order.' }] : [choice, second],
    grades: null,
  };
}

/** Local screenshot page for the setup buttons. Vite drops this route from production. */
export function SelectorShot() {
  const params = new URLSearchParams(window.location.search);
  const theme = params.get('theme') || 'retro';
  const scene = params.get('scene') || 'grammar';
  const exercise = (params.get('exercise') === 'phrasal' || params.get('exercise') === 'order' || params.get('exercise') === 'blanks')
    ? params.get('exercise') as GrammarExerciseType
    : 'blanks';
  const launch = useMemo(() => (scene === 'play' ? previewLaunch(exercise) : null), [scene, exercise]);
  const [config, setConfig] = useState<ConfigOptions>({
    level: 'beginner',
    topic: 'daily life',
    wordCount: 100,
    questionCount: 5,
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
    if (theme === 'retro') document.documentElement.setAttribute('data-theme', 'retro95');
    else document.documentElement.removeAttribute('data-theme');
    setRetroActive(theme === 'retro');
  }, [theme]);
  return (
    <AppShell
      active={scene === 'vocabulary' ? 'vocabulary' : scene === 'reading' ? 'lesson' : 'grammar'}
      onNavigate={() => undefined}
      onSignOut={() => undefined}
      email="josegamez70+detest@gmail.com"
      status="Free lessons left: 7 of 12"
      showAcademy={false}
    >
      {scene === 'vocabulary' && <VocabularyPage userId="preview-user" fixture={previewWords} />}
      {scene === 'reading' && (
        <Configurator config={config} setConfig={setConfig} onGenerate={() => undefined} isLoading={false} practiceType="reading" />
      )}
      {(scene === 'grammar' || scene === 'play') && (
        <GrammarPage
          fontClass="text-lg"
          initialLevel="C1"
          resetNonce={0}
          onActiveChange={() => undefined}
          onLessonsChanged={() => undefined}
          launch={launch}
        />
      )}
    </AppShell>
  );
}
