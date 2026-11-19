import { useEffect, useState } from 'react';
import { AppShell } from './AppShell';
import { GrammarPage } from './GrammarPage';
import { VocabularyPage } from './VocabularyPage';
import { previewWords } from './VocabularyPreview';
import Configurator from './Configurator';
import { setRetroActive } from '../retroTheme';
import type { ConfigOptions } from '../types';
import type { GrammarLaunch } from '../savedLessonMeta';

const grammarQuestion: GrammarLaunch = {
  id: '',
  token: 1,
  level: 'C1',
  exercise: 'blanks',
  topic: 'Travel',
  title: 'Grammar: Fill in the blanks',
  grades: null,
  items: [{
    kind: 'choice',
    prompt: 'It is nearly midnight, so it is high time we _____ home.',
    options: ['go', 'went', 'have gone', 'are going'],
    correctAnswer: 'went',
    explanation: 'After high time, the verb is in the past simple.',
  }],
};

/** Local screenshot page for the setup buttons. Vite drops this route from production. */
export function SelectorShot() {
  const params = new URLSearchParams(window.location.search);
  const theme = params.get('theme') || 'retro';
  const scene = params.get('scene') || 'grammar';
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
      {(scene === 'grammar' || scene === 'question') && (
        <GrammarPage
          fontClass="text-lg"
          initialLevel="C1"
          resetNonce={0}
          onActiveChange={() => undefined}
          onLessonsChanged={() => undefined}
          launch={scene === 'question' ? grammarQuestion : null}
        />
      )}
    </AppShell>
  );
}
