import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planScoreboardMail, scoreboardAchievementMessage } from '../scoreboardEmail.ts';
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
  assert.equal(both.recipients.filter((item) => item.alias === 'Busy').length, 1);
  const message = scoreboardAchievementMessage({
    place: 1,
    alias: 'Learner A3BF',
    day: '2026-11-17',
    reading: { done: 4, correct: 8, answered: 20 },
    listening: { done: 5, correct: 5, answered: 25 },
    grammar: { done: 1, correct: 2, answered: 6 },
    totalDone: 10,
    totalCorrect: 15,
    totalAnswered: 51,
    optOutUrl: 'https://dailyenglishtest.es/api/scoreboard-email-opt-out?token=preview',
  });
  assert.match(message.html, /Learner A3BF/);
  assert.match(message.html, /1st/);
  assert.equal(message.html.includes('Most exercises'), false);
  assert.equal(message.html.includes('Best %'), false);
  assert.match(message.html, /Stop these emails/);
  assert.match(message.html, /not a certificate/);
  assert.equal(message.html.includes('@'), false);
  assert.equal(message.text.includes('@'), false);
  const sql = readFileSync(new URL('../supabase/migrations/20261126_scoreboard_emails.sql', import.meta.url), 'utf8');
  assert.match(sql, /scoreboard_email_sends/);
  assert.match(sql, /scoreboard_email_opt_out/);
  assert.match(sql, /primary key \(user_id, madrid_day\)/);
  assert.equal(/update\s+public\.test_results/i.test(sql), false);
});
