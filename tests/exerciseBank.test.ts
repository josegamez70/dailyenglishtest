import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeGrammarSet, shuffleChoiceOptions, type GrammarSet } from '../grammarSet.ts';
import { isGrammarPiece } from '../tasks.ts';
import {
  canBankGrammarSet,
  exerciseBankCap,
  exerciseBankSecretOk,
  grammarBankId,
  grammarBankPayload,
  grammarContentHash,
  grammarSetFromBankPayload,
  grammarSlots,
  grammarUsesBank,
  overflowIds,
  bankUnavailable,
  readRefillRequest,
  runRefillHop,
  shouldChainRefill,
  weeklyBatchSize,
  type GrammarSlot,
} from '../exerciseBank.ts';

function blanks(topic: string) {
  return normalizeGrammarSet({
    items: Array.from({ length: 8 }, (_, index) => ({
      prompt: `Yesterday she _____ door ${index}.`,
      options: [`opened${index}`, `opens${index}`, `opening${index}`, `open${index}`],
      correctAnswer: `opened${index}`,
      explanation: `Yesterday needs the past simple ${index}.`,
    })),
  }, { level: 'B1', exercise: 'blanks', topic });
}

function slotSet(slot: GrammarSlot): GrammarSet {
  return {
    level: slot.level,
    exercise: slot.exercise,
    topic: '',
    title: 'Grammar',
    items: [],
  };
}

test('standard grammar is the 9 level and exercise pairs, and a typed topic stays live', () => {
  const slots = grammarSlots();
  assert.equal(slots.length, 9);
  assert.deepEqual(slots.map((slot) => `${slot.level}:${slot.exercise}`), [
    'B1:blanks', 'B1:phrasal', 'B1:order',
    'B2:blanks', 'B2:phrasal', 'B2:order',
    'C1:blanks', 'C1:phrasal', 'C1:order',
  ]);
  assert.equal(grammarUsesBank(''), true);
  assert.equal(grammarUsesBank('   '), true);
  assert.equal(grammarUsesBank('present perfect'), false);
});

test('the content hash ignores option order and item order', () => {
  const result = blanks('');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(canBankGrammarSet(result.set), true);
  assert.equal(canBankGrammarSet({ ...result.set, topic: 'travel' }), false);
  const shuffled = {
    ...result.set,
    items: [...result.set.items].reverse().map((item) => (
      item.kind === 'choice' ? shuffleChoiceOptions(item, () => 0.2) : item
    )),
  };
  assert.equal(grammarContentHash(shuffled), grammarContentHash(result.set));
  const changed = {
    ...result.set,
    items: result.set.items.map((item, index) => (
      index === 0 && item.kind === 'choice'
        ? { ...item, prompt: 'Tomorrow she _____ door 0.' }
        : item
    )),
  };
  assert.notEqual(grammarContentHash(changed), grammarContentHash(result.set));
  const payload = grammarBankPayload(result.set);
  assert.equal(payload.topic, '');
  assert.equal(payload.mode, 'grammar');
  const served = grammarSetFromBankPayload(payload, { level: 'B1', exercise: 'blanks', topic: '' });
  assert.equal(served?.items.length, result.set.items.length);
  assert.equal(grammarSetFromBankPayload(payload, { level: 'B2', exercise: 'blanks', topic: '' }), null);
  assert.equal(grammarSetFromBankPayload(payload, { level: 'B1', exercise: 'blanks', topic: 'travel' }), null);
});

test('a bank id on a task grammar piece is kept, and a bad id is ignored', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(isGrammarPiece({
    level: 'B1',
    exercise: 'blanks',
    topic: '',
    title: 'Grammar: Fill in the blanks',
    items: [{ prompt: 'She _____.' }],
    bankId: id,
  }), true);
  assert.equal(grammarBankId({ bankId: id }), id);
  assert.equal(grammarBankId({ bankId: 'not-a-uuid' }), null);
  assert.equal(grammarBankId(null), null);
});

test('the cap keeps the newest rows and drops the oldest', () => {
  const rows = [{ id: 'new' }, { id: 'mid' }, { id: 'old' }];
  assert.deepEqual(overflowIds(rows, 2), ['old']);
  assert.deepEqual(overflowIds(rows, 3), []);
  assert.deepEqual(overflowIds(rows, 1000), []);
});

test('batch size and cap come from env and fall back when the value is out of range', () => {
  assert.equal(weeklyBatchSize({}), 250);
  assert.equal(weeklyBatchSize({ EXERCISE_BANK_WEEKLY_BATCH: '300' }), 300);
  assert.equal(weeklyBatchSize({ EXERCISE_BANK_WEEKLY_BATCH: '9000' }), 250);
  assert.equal(exerciseBankCap({}), 1000);
  assert.equal(exerciseBankCap({ EXERCISE_BANK_CAP: '1000' }), 1000);
  assert.equal(exerciseBankCap({ EXERCISE_BANK_CAP: '0' }), 1000);
  assert.equal(readRefillRequest({ headers: {}, body: null, env: {} }).target, 250);
  assert.equal(readRefillRequest({ headers: {}, body: '{"target":100}', env: {} }).target, 100);
  assert.deepEqual(readRefillRequest({
    headers: {
      'x-exercise-bank-remaining': '40',
      'x-exercise-bank-cursor': '4',
      'x-exercise-bank-hops': '2',
    },
    body: '{"target":250}',
    env: { EXERCISE_BANK_WEEKLY_BATCH: '250' },
  }), { target: 40, cursor: 4, hops: 2 });
  assert.equal(readRefillRequest({
    headers: { 'x-exercise-bank-remaining': 'nope' },
    body: null,
    env: {},
  }).target, 0);
});

test('the refill secret matches the tasks secret pattern', () => {
  assert.equal(exerciseBankSecretOk('right', { EXERCISE_BANK_JOB_SECRET: 'right' }), true);
  assert.equal(exerciseBankSecretOk('wrong', { EXERCISE_BANK_JOB_SECRET: 'right' }), false);
  assert.equal(exerciseBankSecretOk('right', {}), false);
  assert.equal(exerciseBankSecretOk('', { EXERCISE_BANK_JOB_SECRET: 'right' }), false);
});

test('a missing bank table is treated as an empty bank', () => {
  assert.equal(bankUnavailable({ code: 'PGRST202', message: 'Could not find the function' }), true);
  assert.equal(bankUnavailable({ code: '42P01', message: 'relation does not exist' }), true);
  assert.equal(bankUnavailable({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(bankUnavailable(null), false);
});

test('one refill hop visits every grammar combination before repeating', async () => {
  const seen: string[] = [];
  const result = await runRefillHop({
    slots: grammarSlots(),
    target: 9,
    cursor: 0,
    deadline: 10_000_000,
    now: () => 0,
    produce: async (slot) => {
      seen.push(`${slot.level}:${slot.exercise}`);
      return slotSet(slot);
    },
    insert: async () => 'inserted',
  });
  assert.equal(result.stopped, 'target');
  assert.equal(result.inserted, 9);
  assert.equal(result.remaining, 0);
  assert.deepEqual(seen, grammarSlots().map((slot) => `${slot.level}:${slot.exercise}`));
  assert.equal(shouldChainRefill(result, 0), false);
});

test('a hop stops on the clock and the next hop continues the same batch', async () => {
  let clock = 0;
  const result = await runRefillHop({
    slots: grammarSlots(),
    target: 10,
    cursor: 3,
    deadline: 70,
    reserveMs: 25,
    now: () => clock,
    produce: async (slot) => {
      clock += 30;
      return slotSet(slot);
    },
    insert: async () => 'inserted',
  });
  assert.equal(result.stopped, 'time');
  assert.equal(result.inserted, 2);
  assert.equal(result.remaining, 8);
  assert.equal(result.cursor, 5);
  assert.equal(shouldChainRefill(result, 0), true);
  assert.equal(shouldChainRefill(result, 199), false);
  assert.equal(shouldChainRefill({ ...result, stopped: 'failures' }, 0), false);
  assert.equal(shouldChainRefill({ ...result, stopped: 'duplicates' }, 0), false);
  assert.equal(shouldChainRefill({ ...result, stopped: 'unavailable' }, 0), false);
});

test('repeated model failures and duplicate hashes stop the chain', async () => {
  const failures = await runRefillHop({
    slots: grammarSlots(),
    target: 5,
    cursor: 0,
    deadline: 10_000_000,
    now: () => 0,
    produce: async () => {
      throw new Error('busy');
    },
    insert: async () => 'inserted',
  });
  assert.equal(failures.stopped, 'failures');
  assert.equal(failures.inserted, 0);
  assert.equal(shouldChainRefill(failures, 0), false);

  const duplicates = await runRefillHop({
    slots: grammarSlots(),
    target: 20,
    cursor: 0,
    deadline: 10_000_000,
    now: () => 0,
    produce: async (slot) => slotSet(slot),
    insert: async () => 'duplicate',
  });
  assert.equal(duplicates.stopped, 'duplicates');
  assert.equal(duplicates.inserted, 0);
  assert.equal(duplicates.cursor, 12);
});

test('the migration locks the bank and the serves to the owner, and does not touch billing', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261113_exercise_bank.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.exercise_bank/);
  assert.match(sql, /kind in \('grammar', 'listening', 'reading'\)/);
  assert.match(sql, /level in \('B1', 'B2', 'C1'\)/);
  assert.match(sql, /exercise_type in \('blanks', 'phrasal', 'order'\)/);
  assert.match(sql, /content_hash/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /exercise_bank_deny_clients/);
  assert.match(sql, /exercise_bank_serves_own/);
  assert.match(sql, /auth\.uid\(\) = user_id/);
  assert.match(sql, /claim_grammar_bank_item/);
  assert.match(sql, /revoke all on function public\.claim_grammar_bank_item/);
  assert.match(sql, /grant execute on function public\.claim_grammar_bank_item\(uuid, text, text\) to service_role/);
  assert.equal(sql.toLowerCase().includes('stripe'), false);
  assert.equal(sql.includes('create or replace function public.consume_lesson'), false);
  assert.equal(sql.includes('alter table public.saved_lessons'), false);
  assert.equal(sql.includes('user_metadata'), false);
});

test('serving still uses the lesson gate, and tasks can take a banked grammar set', () => {
  const generate = readFileSync(new URL('../api/generate.ts', import.meta.url), 'utf8');
  const tasks = readFileSync(new URL('../taskServer.ts', import.meta.url), 'utf8');
  const body = generate.slice(generate.indexOf('async function createGrammarSet'));
  const claimAt = body.indexOf('claimGrammarFromBank');
  const consumeAt = body.indexOf('consumeLessonResponse');
  const releaseAt = body.indexOf('releaseGrammarBankItem');
  const liveAt = body.indexOf('produceGrammar');
  assert.ok(claimAt >= 0 && claimAt < consumeAt && consumeAt < releaseAt);
  assert.ok(liveAt > releaseAt);
  assert.match(body, /grammarUsesBank\(request\.topic\)/);
  assert.match(generate, /freeLimitResponse/);
  assert.match(tasks, /grammarUsesBank\(request\.topic\)/);
  assert.match(tasks, /claimGrammarFromBank/);
  assert.match(tasks, /releaseGrammarBankItem/);
  assert.match(tasks, /consume_lesson/);
  assert.equal(generate.includes('stripe'), false);
  assert.equal(tasks.includes('stripe'), false);
});

test('the Monday job starts the background refill and does not run the model itself', () => {
  const schedule = readFileSync(new URL('../api/exercise-bank-schedule.ts', import.meta.url), 'utf8');
  const background = readFileSync(new URL('../api/exercise-bank-refill-background.ts', import.meta.url), 'utf8');
  const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(schedule, /schedule: '30 5 \* \* 1'/);
  assert.match(schedule, /exercise-bank-refill-background/);
  assert.match(schedule, /EXERCISE_BANK_JOB_SECRET/);
  assert.equal(schedule.includes('produceGrammar'), false);
  assert.match(background, /produceGrammar/);
  assert.match(background, /x-exercise-bank-secret/);
  assert.match(background, /insertGrammarBankItem/);
  assert.match(toml, /\[functions\."exercise-bank-refill-background"\]/);
  assert.match(toml, /timeout = 900/);
});
