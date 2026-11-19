import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planScoreboardMail, sampleScoreboardMail } from '../scoreboardEmail.ts';
import { scoreboardEmailsEnabled } from '../scoreboardEmailJob.ts';
import type { ChallengeMailPerson, ScoreboardMailPerson } from '../scoreboardEmail.ts';
import type { ScoreRow } from '../scoreboard.ts';

function person(alias: string, done: number, correct: number, answered: number, optOut = false, lessons = 38): ScoreboardMailPerson {
  const row: ScoreRow = {
    alias,
    isSelf: false,
    demo: false,
    reading: { done, correct, answered },
    listening: { done: 0, correct: 0, answered: 0 },
    grammar: { done: 0, correct: 0, answered: 0 },
  };
  return {
    userId: alias,
    alias,
    optOut,
    alreadySent: false,
    lessons,
    unlocked: lessons >= 25 ? ['rookie', 'first_steps', 'retro_player'] : [],
    row,
  };
}

function challenge(alias: string, correct: number, total: number, seconds: number): ChallengeMailPerson {
  return {
    userId: alias,
    alias,
    level: 'B1',
    correct,
    total,
    seconds,
    optOut: false,
    alreadySent: false,
    lessons: 38,
    unlocked: ['rookie', 'first_steps', 'retro_player'],
  };
}

const optOutUrl = () => 'https://dailyenglishtest.es/api/scoreboard-email-opt-out?token=preview';

test('the achievement email stays off unless the flag is exactly true', () => {
  assert.equal(scoreboardEmailsEnabled({}), false);
  assert.equal(scoreboardEmailsEnabled({ SCOREBOARD_EMAILS_ENABLED: 'false' }), false);
  assert.equal(scoreboardEmailsEnabled({ SCOREBOARD_EMAILS_ENABLED: 'true' }), true);
  const schedule = readFileSync(new URL('../api/scoreboard-email-schedule.ts', import.meta.url), 'utf8');
  assert.match(schedule, /schedule: '0 6 \* \* \*'/);
  assert.match(schedule, /scoreboardEmailsEnabled/);
  const dry = readFileSync(new URL('../api/scoreboard-email-dry-run.ts', import.meta.url), 'utf8');
  assert.equal(dry.includes('sendSmtpMail'), false);
  assert.equal(dry.includes('deliverScoreboardEmails'), false);
  const job = readFileSync(new URL('../scoreboardEmailJob.ts', import.meta.url), 'utf8');
  assert.match(job, /lesson_completions/);
  assert.match(job, /user_achievements/);
  assert.match(job, /daily_challenge_attempts/);
});

test('the email has two top-5 sections, medals, and the next Retro Legend', () => {
  const people = Array.from({ length: 6 }, (_, index) => person(`Learner ${index + 1}`, 4, 8 - index, 10));
  people.push(person('Learner Low', 1, 1, 5));
  people[1].optOut = true;
  const plan = planScoreboardMail({ people, day: '2026-11-17', optOutUrlFor: optOutUrl });
  assert.equal(plan.recipients.length, 4);
  assert.equal(plan.recipients.some((item) => item.alias === 'Learner 6'), false);
  assert.equal(plan.recipients.some((item) => item.alias === 'Learner Low'), false);
  assert.equal(plan.skipped.some((item) => item.alias === people[1].alias && item.reason === 'opt-out'), true);
  const both = planScoreboardMail({
    people: [
      person('Busy', 8, 4, 10),
      person('Accurate', 4, 8, 10),
    ],
    challenges: [
      challenge('Slow High', 8, 10, 500),
      challenge('Fast Tie', 8, 10, 200),
      challenge('Lower', 5, 10, 100),
      challenge('Fourth', 4, 10, 100),
      challenge('Fifth', 3, 10, 100),
    ],
    day: '2026-11-17',
    optOutUrlFor: optOutUrl,
  });
  const busy = both.recipients.find((item) => item.alias === 'Busy');
  const accurate = both.recipients.find((item) => item.alias === 'Accurate');
  assert.equal(accurate?.position, 1);
  assert.equal(busy?.position, 2);
  const text = busy?.text ?? '';
  assert.equal(text.includes('Most exercises'), false);
  assert.equal(text.includes('Best %'), false);
  assert.equal(text.includes('All time'), false);
  assert.match(text, /Yesterday's daily challenge/);
  assert.match(text, /\nYesterday\n/);
  assert.ok(text.indexOf('Fast Tie') < text.indexOf('Slow High'));
  assert.ok(text.indexOf('Slow High') < text.indexOf('Lower'));
  assert.match(text, /Special mention/);
  assert.match(text, /12 more lessons to Arcade Starter/);
  assert.match(busy?.html ?? '', /medal_gold\.png/);
  assert.match(busy?.html ?? '', /medal_silver\.png/);
  assert.match(busy?.html ?? '', /medal_bronze\.png/);
  assert.match(busy?.html ?? '', /retro_player_walkman\.png/);
  assert.equal((busy?.html ?? '').includes('All time'), false);
  assert.equal((busy?.html ?? '').includes('@'), false);
  const sample = sampleScoreboardMail();
  assert.match(sample.html, /Demo Alba/);
  assert.match(sample.html, /Gold medal/);
  assert.match(sample.html, /Special mention/);
  assert.match(sample.html, /12 more lessons to Arcade Starter/);
  assert.match(sample.html, /https:\/\/dailyenglishtest\.es\/achievements\/retro_player_walkman\.png/);
  assert.match(sample.html, /https:\/\/dailyenglishtest\.es\/icons\/medal_gold\.png/);
  assert.equal(sample.html.includes('All time'), false);
  assert.equal(sample.text.includes('@'), false);
  assert.equal(sample.html.includes('josegamez70'), false);
  const sql = readFileSync(new URL('../supabase/migrations/20261126_scoreboard_emails.sql', import.meta.url), 'utf8');
  assert.match(sql, /scoreboard_email_sends/);
  assert.match(sql, /scoreboard_email_opt_out/);
  assert.match(sql, /primary key \(user_id, madrid_day\)/);
  assert.equal(/update\s+public\.test_results/i.test(sql), false);
});
