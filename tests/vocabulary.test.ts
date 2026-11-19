import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildVocabQuiz,
  vocabQuizWhy,
  fillVocabSpanish,
  filterVocabulary,
  normalizeTerm,
  sourceLabel,
  sentenceWith,
  rowsWithSaved,
  savedMatchKeys,
  lessonWordSaved,
  matchedSavedTerm,
  shuffleItems,
  termKey,
  vocabSpanishGaps,
  VOCAB_QUIZ_MIN,
  type SavedWord,
} from '../vocabulary.ts';

function word(term: string, meaning: string, source: SavedWord['sourceType'] = 'reading'): SavedWord {
  return {
    id: term,
    term,
    meaning,
    example: `${term} is in a sentence.`,
    spanishTerm: '',
    spanishMeaning: '',
    spanishExample: '',
    sourceType: source,
    lessonTitle: 'Daily Life',
    topic: 'Daily Life',
    level: 'Beginner',
    createdAt: '2026-11-14T10:00:00.000Z',
    correctCount: 0,
    wrongCount: 0,
  };
}

test('a saved term ignores case and extra spaces', () => {
  assert.equal(normalizeTerm('  Fresh  bread '), 'Fresh bread');
  assert.equal(termKey('  Market '), termKey('market'));
  assert.equal(sentenceWith('Anna walks to the market. She buys bread.', 'Market'), 'Anna walks to the market.');
});

test('a lesson word is already saved when only the base form is in the builder', () => {
  const saved = savedMatchKeys(['Wake up', 'Teasing']);
  assert.equal(lessonWordSaved(saved, 'wakes up'), true);
  assert.equal(lessonWordSaved(saved, 'teased'), true);
  assert.equal(lessonWordSaved(saved, 'market'), false);
  assert.equal(matchedSavedTerm(['Wake up', 'city'], 'wakes up'), 'Wake up');
});

test('search and source filters keep the matching words', () => {
  const items = [word('market', 'A place to buy food.'), word('train', 'A vehicle on rails.', 'listening')];
  assert.equal(filterVocabulary(items, 'rails', 'all').length, 1);
  assert.equal(filterVocabulary(items, '', 'listening')[0].term, 'train');
  assert.equal(filterVocabulary(items, 'food', 'listening').length, 0);
  assert.equal(sourceLabel('lookup'), 'From popup');
  const page = readFileSync(new URL('../components/VocabularyPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /\['lookup', 'From popup'\]/);
  assert.equal(page.includes('Word lookup'), false);
  assert.match(page, /rows\.length === 0/);
  assert.match(page, /No words match this search or filter\./);
  assert.match(page, /Clear search and filters/);
  assert.match(page, /setQuery\(''\); setSource\('all'\)/);
  assert.match(page, /defineSearchText/);
  assert.match(page, /No meaning found for/);
  assert.match(page, /sourceType: 'lookup'/);
  assert.match(page, /500/);
});

test('the quiz is built only from saved words and needs four of them', () => {
  const three = [word('a', 'one'), word('b', 'two'), word('c', 'three')];
  assert.equal(buildVocabQuiz(three, () => 0), null);
  const four = [...three, word('d', 'four')];
  const quiz = buildVocabQuiz(four, () => 0);
  assert.ok(quiz);
  assert.equal(quiz?.length, VOCAB_QUIZ_MIN);
  for (const question of quiz ?? []) {
    assert.equal(question.choices.includes(question.answer), true);
    assert.equal(new Set(question.choices).size, question.choices.length);
    assert.match(question.explanation, new RegExp(question.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(question.explanation.includes('gemini'), false);
  }
  assert.equal(vocabQuizWhy('wake up', 'to stop sleeping · to become alert', true), '“wake up” means to stop sleeping.');
  assert.equal(vocabQuizWhy('wake up', 'to stop sleeping', false), '“to stop sleeping” is the meaning of “wake up”.');
  assert.equal(vocabQuizWhy('strife', 'Hard work . More words follow. · another sense', true), '“strife” means Hard work.');
  const page = readFileSync(new URL('../components/VocabularyPage.tsx', import.meta.url), 'utf8');
  const pageQuiz = page.slice(page.indexOf('function Quiz'), page.indexOf('export function VocabularyPage'));
  assert.match(pageQuiz, /Exercise complete!|ExerciseComplete/);
  assert.match(pageQuiz, /Your answer/);
  assert.match(pageQuiz, /Correct answer/);
  assert.match(pageQuiz, /Why: /);
  assert.match(pageQuiz, /SpanishWhy/);
  assert.match(pageQuiz, /if \(locked\) return/);
  assert.match(pageQuiz, /playEffect\(right \? 'correct' : 'wrong', retro\)/);
  assert.equal(pageQuiz.includes('onNew={onExit}'), false);
  const effects = readFileSync(new URL('../effects.ts', import.meta.url), 'utf8');
  assert.match(effects, /if \(!soundEffectsEnabled\(\)\) return;/);
  assert.equal(page.includes('gemini'), false);
  assert.equal(page.includes('generateStory'), false);
  const sql = readFileSync(new URL('../supabase/migrations/20261121_saved_vocabulary.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public.saved_vocabulary/);
  assert.match(sql, /user_id uuid not null references auth.users/);
  assert.match(sql, /unique index if not exists saved_vocabulary_user_term_uidx/);
  assert.match(sql, /lower\(term\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /auth.uid\(\) = user_id/);
  const shell = readFileSync(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /Vocabulary builder/);
  assert.equal(shell.includes('My vocabulary'), false);
  const menu = shell.slice(shell.indexOf('baseItems'), shell.indexOf('function NavLinks'));
  assert.ok(menu.indexOf("label: 'Grammar'") < menu.indexOf("label: 'Vocabulary builder'"));
  assert.ok(menu.indexOf("label: 'Vocabulary builder'") < menu.indexOf("label: 'Tasks'"));
  const netlify = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(netlify, /from = "\/vocabulary"/);
  const list = readFileSync(new URL('../components/KeyVocabularyList.tsx', import.meta.url), 'utf8');
  assert.match(list, /type="checkbox"/);
  assert.match(list, /bg-blue-700/);
  assert.equal(list.includes('pendingKey === key'), false);
  const store = readFileSync(new URL('../vocabularyStore.ts', import.meta.url), 'utf8');
  const commit = store.slice(store.indexOf('async function commitVocabulary'));
  assert.ok(commit.indexOf('rowsWithSaved') < commit.indexOf('await persist'));
  assert.equal(rowsWithSaved([], {
    term: 'market',
    meaning: 'A place to buy food.',
    example: '',
    sourceType: 'reading',
    lessonTitle: 'Daily Life',
    topic: 'Daily Life',
    level: 'Beginner',
  }, true)[0].term, 'market');
  assert.equal(rowsWithSaved([{
    id: '1',
    term: 'market',
    meaning: 'A place to buy food.',
    example: '',
    spanishTerm: 'mercado',
    spanishMeaning: '',
    spanishExample: '',
    sourceType: 'reading',
    lessonTitle: '',
    topic: '',
    level: '',
    createdAt: '',
    correctCount: 0,
    wrongCount: 0,
  }], {
    term: 'market',
    meaning: '',
    example: '',
    sourceType: 'reading',
    lessonTitle: '',
    topic: '',
    level: '',
  }, false).length, 0);
  const popup = readFileSync(new URL('../components/DefinedText.tsx', import.meta.url), 'utf8');
  assert.match(popup, /Save word/);
  assert.match(popup, /Sign in to save/);
});

test('shuffle keeps every word', () => {
  const items = ['market', 'train', 'fresh', 'leave'];
  const shuffled = shuffleItems(items, () => 0.99);
  assert.deepEqual([...shuffled].sort(), [...items].sort());
});

test('a saved word keeps popup Spanish and translates only the missing lines once', async () => {
  const kept = rowsWithSaved([word('market', 'A place to buy food.')], {
    term: 'market',
    meaning: 'A place to buy food.',
    example: 'Anna walks to the market.',
    spanishTerm: 'mercado',
    sourceType: 'reading',
    lessonTitle: 'Daily Life',
    topic: 'Daily Life',
    level: 'Beginner',
  }, true)[0];
  assert.equal(kept.spanishTerm, 'mercado');
  assert.deepEqual(vocabSpanishGaps(kept), ['meaning', 'example']);
  const asked: string[] = [];
  const filled = await fillVocabSpanish(kept, async (text) => {
    asked.push(text);
    if (text.startsWith('A place')) return 'Un lugar donde se compra comida.';
    if (text.startsWith('Anna')) return 'Ana va al mercado.';
    return 'mercado';
  });
  assert.deepEqual(asked, ['A place to buy food.', 'Anna walks to the market.']);
  assert.equal(filled.term, 'mercado');
  assert.equal(filled.meaning, 'Un lugar donde se compra comida.');
  assert.equal(filled.example, 'Ana va al mercado.');
  assert.equal(filled.complete, true);
  const again = await fillVocabSpanish({
    ...kept,
    spanishMeaning: filled.meaning,
    spanishExample: filled.example,
  }, async () => {
    throw new Error('already stored');
  });
  assert.equal(again.complete, true);
  assert.equal(again.term, 'mercado');
  const page = readFileSync(new URL('../components/VocabularyPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /English/);
  assert.match(page, /Español/);
  assert.match(page, /vocab-lang/);
  assert.match(page, /vocab-more/);
  assert.match(page, /translateToSpanish/);
  assert.match(page, /saveVocabularySpanish/);
  const popup = readFileSync(new URL('../components/DefinedText.tsx', import.meta.url), 'utf8');
  assert.match(popup, /spanishTerm: entry\?\.spanish \|\| ''/);
  const store = readFileSync(new URL('../vocabularyStore.ts', import.meta.url), 'utf8');
  assert.match(store, /spanish_term/);
  assert.match(store, /isMissingColumn\(result\.error, 'spanish_term'\)/);
  assert.match(store, /isMissingColumn\(saved\.error, 'spanish_term'\)/);
  const sql = readFileSync(new URL('../supabase/migrations/20261202_saved_vocabulary_spanish.sql', import.meta.url), 'utf8');
  assert.match(sql, /add column if not exists spanish_term/);
  assert.match(sql, /add column if not exists spanish_meaning/);
  assert.match(sql, /add column if not exists spanish_example/);
  const css = readFileSync(new URL('../phase2.css', import.meta.url), 'utf8');
  assert.match(css, /\.vocab-lang button \{[^}]*min-height:\s*2\.75rem/);
  assert.match(css, /button\.vocab-more \{[^}]*min-height:\s*2\.75rem/);
});
