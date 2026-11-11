import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterSavedLessons, savedLessonBadges } from '../savedLessonMeta.ts';
import {
  buildMimeMessage,
  readSmtpSettings,
  secretMatches,
} from '../taskMail.ts';
import {
  DEFAULT_TASK_SETTINGS,
  isoWeek,
  nextTaskStep,
  normalizeTaskSettings,
  periodKey,
  settingsToRow,
  taskGenerationDecision,
  taskReminderMessage,
  TASK_PACK_LIMIT,
  unsubscribeResultHtml,
} from '../tasks.ts';

test('a daily pack changes at midnight in Spain, not at UTC midnight', () => {
  assert.equal(periodKey('daily', new Date('2026-11-10T22:30:00.000Z')), '2026-11-10');
  assert.equal(periodKey('daily', new Date('2026-11-10T23:30:00.000Z')), '2026-11-11');
  assert.equal(periodKey('daily', new Date('2026-11-11T12:00:00.000Z')), '2026-11-11');
});

test('a weekly pack uses the Madrid ISO week and starts on Monday', () => {
  assert.deepEqual(isoWeek(2026, 1, 1), { weekYear: 2026, week: 1 });
  assert.equal(periodKey('weekly', new Date('2025-12-31T12:00:00.000Z')), '2026-W01');
  const sundayNight = periodKey('weekly', new Date('2026-11-08T22:30:00.000Z'));
  const mondayMorning = periodKey('weekly', new Date('2026-11-08T23:30:00.000Z'));
  assert.equal(sundayNight, '2026-W45');
  assert.notEqual(mondayMorning, sundayNight);
  assert.equal(mondayMorning, periodKey('weekly', new Date('2026-11-09T12:00:00.000Z')));
});

test('task settings keep the lesson options the app already offers', () => {
  const settings = normalizeTaskSettings({
    ...DEFAULT_TASK_SETTINGS,
    enabled: true,
    frequency: 'weekly',
    level: 'advanced',
    topic: 'wildcard',
    wordCount: 60,
    questionCount: 8,
    readingFormat: 'dialogue',
    listeningFormat: 'text',
    grammarLevel: 'C1',
    grammarExercise: 'order',
    grammarTopic: '  travel  ',
    emailReminders: false,
  });
  assert.ok(settings);
  assert.equal(settings?.grammarTopic, 'travel');
  assert.equal(settings?.emailReminders, false);
  assert.equal(normalizeTaskSettings({ ...DEFAULT_TASK_SETTINGS, wordCount: 90 }), null);
  assert.equal(normalizeTaskSettings({ ...DEFAULT_TASK_SETTINGS, topic: 'not-a-topic' }), null);
  const row = settingsToRow('user-1', settings ?? DEFAULT_TASK_SETTINGS);
  assert.equal(row.reading_format, 'dialogue');
  assert.equal(row.word_count, 60);
});

test('one task pack spends one free lesson and does not touch an unlimited plan', () => {
  assert.deepEqual(taskGenerationDecision('ok_unlimited'), { generate: true, consumeLessons: 0, reason: 'ok' });
  assert.deepEqual(taskGenerationDecision('ok_free'), { generate: true, consumeLessons: 1, reason: 'ok' });
  assert.deepEqual(taskGenerationDecision('free_limit'), { generate: false, consumeLessons: 0, reason: 'free_limit' });
  assert.deepEqual(taskGenerationDecision('pilot_expired'), { generate: false, consumeLessons: 0, reason: 'pilot_expired' });
  assert.equal(taskGenerationDecision('ok_free').consumeLessons, 1);
});

test('a pack is ready only after reading, listening, and grammar exist', () => {
  const story = {
    story: 'Anna walks to the market every morning and buys fresh bread.',
    format: 'text',
    quiz: [],
  };
  assert.equal(nextTaskStep({ reading: null, listening: null, grammar: null }), 'reading-story');
  assert.equal(nextTaskStep({ reading: story, listening: null, grammar: null }), 'reading-quiz');
  assert.equal(nextTaskStep({
    reading: { ...story, quiz: [{ question: 'Where?' }] },
    listening: null,
    grammar: null,
  }), 'listening-story');
  assert.equal(nextTaskStep({
    reading: { ...story, quiz: [{ question: 'Where?' }] },
    listening: { ...story, format: 'dialogue', quiz: [{ question: 'When?' }] },
    grammar: null,
  }), 'grammar');
  assert.equal(nextTaskStep({
    reading: { ...story, quiz: [{ question: 'Where?' }] },
    listening: { ...story, quiz: [{ question: 'When?' }] },
    grammar: { level: 'B1', exercise: 'blanks', items: [{ prompt: 'She _____.' }] },
  }), 'done');
});

test('the reminder email links to the pack and to turn tasks off', () => {
  const mail = taskReminderMessage({
    baseUrl: 'https://dailyenglishtest.es/',
    token: 'abc123',
    frequency: 'daily',
    periodKey: '2026-11-11',
  });
  assert.match(mail.html, /https:\/\/dailyenglishtest\.es\/tasks/);
  assert.match(mail.html, /https:\/\/dailyenglishtest\.es\/api\/tasks-unsubscribe\?token=abc123/);
  assert.match(mail.text, /turn tasks off/i);
  assert.equal(mail.html.includes('TASK_SMTP'), false);
  assert.equal(mail.html.includes('password'), false);
  assert.match(unsubscribeResultHtml('ok'), /Tasks are off/);
});

test('email is skipped when the mailbox settings are missing', () => {
  assert.equal(readSmtpSettings({}), null);
  assert.equal(readSmtpSettings({ TASK_SMTP_HOST: 'smtp.example.com', TASK_SMTP_USER: 'info@dailyenglishtest.es' }), null);
  const settings = readSmtpSettings({
    TASK_SMTP_HOST: 'smtp.buzondecorreo.com',
    TASK_SMTP_USER: 'info@dailyenglishtest.es',
    TASK_SMTP_PASSWORD: 'secret-value',
  });
  assert.equal(settings?.port, 465);
  assert.equal(settings?.from, 'info@dailyenglishtest.es');
  const mime = buildMimeMessage({
    from: 'info@dailyenglishtest.es',
    to: 'student@example.com',
    subject: 'Your English tasks are ready',
    html: '<p>Open</p>',
    text: 'Open',
  });
  assert.match(mime, /From: info@dailyenglishtest\.es/);
  assert.equal(mime.includes('secret-value'), false);
  assert.equal(secretMatches('nope', {}), false);
  assert.equal(secretMatches('right', { TASKS_JOB_SECRET: 'right' }), true);
  assert.equal(secretMatches('wrong', { TASKS_JOB_SECRET: 'right' }), false);
});

test('task packs keep the newest 5 and exercises stay on the owner row', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261112_tasks.sql', import.meta.url), 'utf8');
  assert.equal(TASK_PACK_LIMIT, 5);
  assert.match(sql, /keep_latest_task_packs/);
  assert.match(sql, /limit 5/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /task_pack_exercises_own/);
  assert.match(sql, /task_packs_academy_read/);
  assert.match(sql, /auth\.uid\(\) = user_id/);
  assert.equal(sql.toLowerCase().includes('stripe'), false);
  assert.equal(sql.includes('create or replace function public.consume_lesson'), false);
  assert.equal(sql.includes('alter table public.saved_lessons'), false);
});

test('a task lesson keeps the Task badge inside the existing filters', () => {
  assert.deepEqual(savedLessonBadges({
    mode: 'reading',
    format: 'text',
    level: 'beginner',
    levelLabel: 'Beginner',
    task: true,
  }), [
    { kind: 'task', label: 'Task' },
    { kind: 'mode', label: 'Reading' },
    { kind: 'format', label: 'Text' },
    { kind: 'level', label: 'Beginner' },
  ]);
  const rows = [
    { id: 'task-reading', lesson: { mode: 'reading', task: true } },
    { id: 'plain', lesson: { mode: 'listening' } },
    { id: 'task-grammar', lesson: { mode: 'grammar', task: true, exercise: 'phrasal', level: 'B1' } },
  ];
  assert.deepEqual(filterSavedLessons(rows, 'reading').map((row) => row.id), ['task-reading']);
  assert.deepEqual(filterSavedLessons(rows, 'grammar').map((row) => row.id), ['task-grammar']);
  assert.deepEqual(filterSavedLessons(rows, 'all').map((row) => row.id), ['task-reading', 'plain', 'task-grammar']);
  assert.equal(savedLessonBadges(rows[2].lesson).some((badge) => badge.label === 'Task'), true);
});
