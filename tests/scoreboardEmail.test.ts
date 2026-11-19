import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planScoreboardMail, sampleScoreboardMail, type ChallengeMailPerson } from '../scoreboardEmail.ts';
import { scoreboardEmailsEnabled } from '../scoreboardEmailJob.ts';
import type { ScoreRow } from '../scoreboard.ts';

function person(alias: string, done: number, correct: number, answered: number, optOut = false): {
  userId: string;
  alias: string;
  optOut: boolean;
  alreadySent: boolean;
  row: ScoreRow;
} {
  return {
    userId: alias,
    alias,
    optOut,
    alreadySent: false,
    row: {
      alias,
      isSelf: false,
      demo: false,
      reading: { done, correct, answered },
      listening: { done: 0, correct: 0, answered: 0 },
      grammar: { done: 0, correct: 0, answered: 0 },
    },
  };
}

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
});

test('only the top 5 qualified learners are mailed, without another person address', () => {
  const people = Array.from({ length: 6 }, (_, index) => person(`Learner ${index + 1}`, 4, 8 - index, 10));
  people.push(person('Learner Low', 1, 1, 5));
  people[1].optOut = true;
  const plan = planScoreboardMail(people, '2026-11-17', () => 'https://dailyenglishtest.es/api/scoreboard-email-opt-out?token=preview');
  assert.equal(plan.recipients.length, 4);
  assert.equal(plan.recipients.some((item) => item.alias === 'Learner 6'), false);
  assert.equal(plan.recipients.some((item) => item.alias === 'Learner Low'), false);
  assert.equal(plan.skipped.some((item) => item.alias === people[1].alias && item.reason === 'opt-out'), true);
  const both = planScoreboardMail([
    person('Busy', 8, 4, 10),
    person('Accurate', 4, 8, 10),
  ], '2026-11-17', () => 'https://dailyenglishtest.es/api/scoreboard-email-opt-out?token=preview', 3);
  const busy = both.recipients.find((item) => item.alias === 'Busy');
  const accurate = both.recipients.find((item) => item.alias === 'Accurate');
  assert.equal(accurate?.position, 1);
  assert.equal(busy?.position, 2);
  assert.equal((busy?.text ?? '').includes('Most exercises'), false);
  assert.equal((busy?.text ?? '').includes('Best %'), false);
  assert.match(busy?.text ?? '', /2nd/);
  assert.match(busy?.text ?? '', /Daily challenge/);
  assert.match(busy?.text ?? '', /\nYesterday\n/);
  assert.match(busy?.text ?? '', /All time/);
  assert.equal(both.recipients.filter((item) => item.alias === 'Busy').length, 1);
  const challenges: ChallengeMailPerson[] = [
    { userId: 'slow', alias: 'Slow High', level: 'B1', correct: 8, total: 10, seconds: 500, optOut: false, alreadySent: false },
    { userId: 'fast', alias: 'Fast Tie', level: 'B1', correct: 8, total: 10, seconds: 200, optOut: false, alreadySent: false },
    { userId: 'lower', alias: 'Lower', level: 'B1', correct: 5, total: 10, seconds: 100, optOut: false, alreadySent: false },
  ];
  const ordered = planScoreboardMail(both.recipients.length ? [
    person('Busy', 8, 4, 10),
    person('Accurate', 4, 8, 10),
  ] : [], '2026-11-17', () => 'https://dailyenglishtest.es/api/scoreboard-email-opt-out?token=preview', 3, challenges);
  const orderedText = ordered.recipients[0]?.text ?? '';
  assert.ok(orderedText.indexOf('Fast Tie') < orderedText.indexOf('Slow High'));
  assert.ok(orderedText.indexOf('Slow High') < orderedText.indexOf('Lower'));
  const sample = sampleScoreboardMail();
  assert.match(sample.html, /Daily challenge/);
  assert.match(sample.html, /Yesterday/);
  assert.match(sample.html, /All time/);
  assert.match(sample.html, /Demo Alba/);
  assert.match(sample.html, /Stop these emails/);
  assert.match(sample.html, /not a certificate/);
  assert.equal(sample.html.includes('@'), false);
  assert.equal(sample.text.includes('@'), false);
  assert.equal(sample.html.includes('josegamez70'), false);
  const schedule = readFileSync(new URL('../api/scoreboard-email-schedule.ts', import.meta.url), 'utf8');
  assert.match(schedule, /SCOREBOARD_EMAILS_ENABLED must be the exact word true/);
  const sql = readFileSync(new URL('../supabase/migrations/20261126_scoreboard_emails.sql', import.meta.url), 'utf8');
  assert.match(sql, /scoreboard_email_sends/);
  assert.match(sql, /scoreboard_email_opt_out/);
  assert.match(sql, /primary key \(user_id, madrid_day\)/);
  assert.equal(/update\s+public\.test_results/i.test(sql), false);
});
