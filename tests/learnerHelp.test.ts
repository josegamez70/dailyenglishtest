import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { helpPageFromPath } from '../helpContent.ts';
import { LEARNER_HELP_PATH, learnerHelpCopy, learnerHelpPageFromPath } from '../learnerHelp.ts';

const FORBIDDEN = /\b(free|unlimited|premium|price|pricing|€|euro|certif)/i;

test('learner guide is its own public path', () => {
  assert.equal(LEARNER_HELP_PATH, '/learn');
  assert.equal(learnerHelpPageFromPath('/learn'), true);
  assert.equal(learnerHelpPageFromPath('/learn/'), true);
  assert.equal(learnerHelpPageFromPath('/learner'), false);
  assert.equal(learnerHelpPageFromPath('/help'), false);
  assert.equal(helpPageFromPath('/learn'), false);
});

test('learner guide covers the live individual menu and makes no sales claims', () => {
  const en = learnerHelpCopy('en');
  const es = learnerHelpCopy('es');
  assert.equal(en.kicker, 'For learners');
  assert.equal(en.heading, 'How it works');
  assert.equal(es.kicker, 'Para alumnos');
  assert.equal(es.heading, 'Cómo funciona');
  assert.deepEqual(en.steps.map((step) => step.id), es.steps.map((step) => step.id));
  assert.deepEqual(en.steps.map((step) => step.id), [
    'signin', 'profile', 'level', 'practice', 'grammar', 'vocab', 'saved', 'tasks', 'challenge', 'scoreboard', 'legends', 'share', 'progress',
  ]);
  assert.equal(en.faq.length, 0);
  const text = en.steps.map((step) => `${step.title}. ${step.body}`).join('\n');
  for (const label of [
    'Send link', 'Profile', 'Retro 95', 'Light', 'Dark', 'System', 'Reading / Listening',
    'Generate Exercise', 'Text', 'Dialogue', 'Grammar', 'Fill in the blanks', 'Phrasal verbs',
    'Put in order', 'Save word', 'Vocabulary builder', 'Flashcards', 'Quiz', 'Saved lessons',
    'Tasks', 'Task packs', 'Daily challenge', 'Scoreboard', 'Today', 'Yesterday', 'Most exercises',
    'Highest %', 'Retro Legends', 'Share', 'WhatsApp', 'My progress', 'Download PDF',
  ]) {
    assert.match(text, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(text, /not an official exam/);
  assert.match(text, /do not guarantee a result/);
  assert.equal(FORBIDDEN.test(text), false);
  assert.equal(FORBIDDEN.test(es.steps.map((step) => step.body).join(' ')), false);
  assert.equal(FORBIDDEN.test(en.intro), false);
});

test('individuals open the learner guide and academy owners keep theirs', () => {
  const shell = readFileSync(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /showAcademy \? '\/help' : '\/learn'/);
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /learnerHelpPageFromPath/);
  assert.match(app, /<HelpPage audience="learner" \/>/);
  const landing = readFileSync(new URL('../components/Landing.tsx', import.meta.url), 'utf8');
  assert.match(landing, /href="\/learn">For learners/);
  assert.match(landing, /href="\/help">How academies work/);
  const redirects = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(redirects, /from = "\/learn"/);
});
