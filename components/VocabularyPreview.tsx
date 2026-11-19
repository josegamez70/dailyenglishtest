import { useEffect, useState } from 'react';
import { AppShell } from './AppShell';
import { setRetroActive } from '../retroTheme';
import { DefinedText, DictionaryPopup } from './DefinedText';
import { KeyVocabularyList } from './KeyVocabularyList';
import { VocabularyPage } from './VocabularyPage';
import { setVocabLessonContext, termKey, type SavedWord } from '../vocabulary';
import type { VocabularyItem } from '../types';

const story = 'Anna walks to the market every morning and buys fresh bread for her family.';

const lessonWords: VocabularyItem[] = [
  { word: 'market', definition: 'A place where people buy and sell food.' },
  { word: 'fresh', definition: 'Newly made or picked, not old.' },
];

export const previewWords: SavedWord[] = [
  {
    id: 'preview-market',
    term: 'market',
    meaning: 'A place where people buy and sell food. · The trade in a particular product.',
    example: 'Anna walks to the market every morning.',
    spanishTerm: 'mercado',
    spanishMeaning: 'Un lugar donde la gente compra y vende comida. · El comercio de un producto.',
    spanishExample: 'Ana va al mercado cada mañana.',
    sourceType: 'reading',
    lessonTitle: 'Daily Life',
    topic: 'Daily Life',
    level: 'Beginner',
    createdAt: '2026-11-14T10:00:00.000Z',
    correctCount: 1,
    wrongCount: 0,
  },
  {
    id: 'preview-train',
    term: 'train',
    meaning: 'A vehicle that runs on rails.',
    example: 'The train leaves at eight.',
    spanishTerm: '',
    spanishMeaning: '',
    spanishExample: '',
    sourceType: 'listening',
    lessonTitle: 'Travel',
    topic: 'Travel',
    level: 'Beginner',
    createdAt: '2026-11-13T10:00:00.000Z',
    correctCount: 0,
    wrongCount: 1,
  },
  {
    id: 'preview-fresh',
    term: 'fresh',
    meaning: 'Newly made or picked, not old.',
    example: 'She buys fresh bread.',
    spanishTerm: '',
    spanishMeaning: '',
    spanishExample: '',
    sourceType: 'reading',
    lessonTitle: 'Daily Life',
    topic: 'Daily Life',
    level: 'Beginner',
    createdAt: '2026-11-12T10:00:00.000Z',
    correctCount: 0,
    wrongCount: 0,
  },
  {
    id: 'preview-leave',
    term: 'leave',
    meaning: 'To go away from a place.',
    example: 'The train leaves at eight.',
    spanishTerm: '',
    spanishMeaning: '',
    spanishExample: '',
    sourceType: 'listening',
    lessonTitle: 'Travel',
    topic: 'Travel',
    level: 'Beginner',
    createdAt: '2026-11-11T10:00:00.000Z',
    correctCount: 2,
    wrongCount: 0,
  },
];

function LessonPreview() {
  const [saved, setSaved] = useState<Set<string>>(() => new Set([termKey('market')]));
  useEffect(() => {
    setVocabLessonContext({
      signedIn: true,
      sourceType: 'reading',
      lessonTitle: 'Daily Life',
      topic: 'Daily Life',
      level: 'Beginner',
      story,
    });
    return () => setVocabLessonContext(null);
  }, []);
  return (
    <div className="mx-auto w-full max-w-3xl">
      <DictionaryPopup />
      <div className="rounded-xl bg-white p-6 shadow-lg dark:bg-slate-800">
        <h2 className="text-center text-2xl font-bold">Read the Story</h2>
        <p className="mt-2 text-center text-base font-semibold">Topic: Daily Life · Level: Beginner · Format: Text</p>
        <DefinedText text={story} className="mt-6 block text-lg leading-relaxed" />
        <div className="mt-6">
          <KeyVocabularyList
            items={lessonWords}
            savedKeys={saved}
            signedIn
            missing={false}
            onToggle={(item) => {
              const key = termKey(item.word);
              setSaved((current) => {
                const next = new Set(current);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function VocabularyPreview({ scene }: { scene: 'lesson' | 'list' }) {
  const params = new URLSearchParams(window.location.search);
  const theme = params.get('theme') || '';
  const shot = params.get('shot') === 'spanish' || params.get('shot') === 'more' || params.get('shot') === 'english'
    ? params.get('shot') as 'spanish' | 'more' | 'english'
    : null;
  useEffect(() => {
    if (theme !== 'retro' && theme !== 'dark' && theme !== 'light') return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
    if (theme === 'retro') document.documentElement.setAttribute('data-theme', 'retro95');
    else document.documentElement.removeAttribute('data-theme');
    setRetroActive(theme === 'retro');
  }, [theme]);
  const words = shot ? [previewWords[0]] : previewWords;
  return (
    <AppShell
      active={scene === 'lesson' ? 'lesson' : 'vocabulary'}
      onNavigate={() => undefined}
      onSignOut={() => undefined}
      email={shot ? 'josegamez70+detest@gmail.com' : 'student@example.com'}
      status="Free lessons left: 7 of 12"
      showAcademy={false}
      academyName={null}
      academyRole="student"
      displayName="Ana"
    >
      {scene === 'lesson'
        ? <LessonPreview />
        : <VocabularyPage userId="preview-user" fixture={words} shot={shot} />}
    </AppShell>
  );
}
