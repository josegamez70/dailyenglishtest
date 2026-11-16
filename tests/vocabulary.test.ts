import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildVocabQuiz,
  filterVocabulary,
  normalizeTerm,
  sourceLabel,
  sentenceWith,
  rowsWithSaved,
  shuffleItems,
  termKey,
  VOCAB_QUIZ_MIN,
  type SavedWord,
} from '../vocabulary.ts';

function word(term: string, meaning: string, source: SavedWord['sourceType'] = 'reading'): SavedWord {
  return {
    id: term,
    term,
    meaning,
    example: `${term} is in a sentence.`,
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
  }
  const page = readFileSync(new URL('../components/VocabularyPage.tsx', import.meta.url), 'utf8');
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
