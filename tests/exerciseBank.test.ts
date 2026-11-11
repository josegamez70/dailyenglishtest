import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeGrammarSet, shuffleChoiceOptions, type GrammarSet } from '../grammarSet.ts';
import { isGrammarPiece } from '../tasks.ts';
import { TOPICS, WILDCARD_TOPIC } from '../constants.ts';
import {
  AZURE_NEURAL_FREE_CHARACTERS,
  assembleListeningLesson,
  canBankGrammarSet,
  exerciseBankCap,
  exerciseBankSecretOk,
  grammarBankId,
  grammarBankPayload,
  grammarContentHash,
  grammarSetFromBankPayload,
  grammarSlotKey,
  grammarSlots,
  grammarUsesBank,
  LISTENING_CHARS_PER_LESSON_HIGH,
  listeningAudioPath,
  listeningBankPayload,
  listeningBankQuery,
  listeningContentHash,
  listeningFocuses,
  listeningLessonFromBankPayload,
  listeningSlotKey,
  listeningSlots,
  listeningStoryForBank,
  nextGrammarSlot,
  nextListeningSlot,
  listeningWeeklyBatchSize,
  listeningWeeklyCharacters,
  overflowIds,
  bankUnavailable,
  readRefillRequest,
  runRefillHop,
  shouldChainRefill,
  weeklyBatchSize,
  type GrammarSlot,
  type ListeningLesson,
  type ListeningSlot,
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
  }), { target: 40, cursor: 4, hops: 2, kind: 'grammar' });
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
  assert.equal(shouldChainRefill({ ...result, stopped: 'attempts', inserted: 0 }, 0), false);
  assert.equal(shouldChainRefill({ ...result, stopped: 'attempts', inserted: 2, remaining: 4 }, 0), true);
});

test('a rate-limit pause retries the same cell on the next hop', async () => {
  const result = await runRefillHop({
    slots: grammarSlots(),
    target: 3,
    cursor: 4,
    deadline: 10_000_000,
    now: () => 0,
    attemptLimit: 10,
    produce: async () => {
      throw Object.assign(new Error('refill_pause'), { refillPause: true });
    },
    insert: async () => 'inserted',
  });
  assert.equal(result.stopped, 'time');
  assert.equal(result.cursor, 4);
  assert.equal(result.inserted, 0);
  assert.equal(shouldChainRefill(result, 0), true);
});

test('validation misses rotate to the next cell instead of ending the batch', async () => {
  const seen: string[] = [];
  const result = await runRefillHop({
    slots: [],
    target: 6,
    cursor: 0,
    deadline: 10_000_000,
    now: () => 0,
    attemptLimit: 36,
    pick: (cursor) => nextListeningSlot({ cursor, random: () => 0 }),
    label: (slot) => `${slot.level}/${slot.format}`,
    produce: async (slot) => {
      seen.push(`${slot.level}:${slot.format}`);
      return slot.format === 'dialogue' ? null : slot;
    },
    insert: async () => 'inserted',
  });
  assert.equal(result.stopped, 'target');
  assert.equal(result.inserted, 6);
  assert.equal(seen.filter((item) => item.endsWith(':dialogue')).length > 0, true);
  assert.deepEqual(seen.filter((item) => item.endsWith(':text')), [
    'Beginner:text', 'Intermediate:text', 'Advanced:text',
    'Beginner:text', 'Intermediate:text', 'Advanced:text',
  ]);
});

test('eight misses do not stop a refill that can still insert', async () => {
  let calls = 0;
  const result = await runRefillHop({
    slots: grammarSlots(),
    target: 2,
    cursor: 0,
    deadline: 10_000_000,
    now: () => 0,
    produce: async (slot) => {
      calls += 1;
      return calls <= 8 ? null : slotSet(slot);
    },
    insert: async () => 'inserted',
  });
  assert.equal(result.stopped, 'target');
  assert.equal(result.inserted, 2);
  assert.equal(calls, 10);
});

test('thrown attempts do not end the batch before the attempt cap', async () => {
  let calls = 0;
  const failures = await runRefillHop({
    slots: grammarSlots(),
    target: 5,
    cursor: 0,
    deadline: 10_000_000,
    now: () => 0,
    attemptLimit: 12,
    produce: async (slot) => {
      calls += 1;
      if (calls < 5) throw new Error('busy');
      return slotSet(slot);
    },
    insert: async () => 'inserted',
  });
  assert.equal(failures.stopped, 'target');
  assert.equal(failures.inserted, 5);
  assert.equal(calls, 9);

  const capped = await runRefillHop({
    slots: grammarSlots(),
    target: 5,
    cursor: 0,
    deadline: 10_000_000,
    now: () => 0,
    attemptLimit: 4,
    produce: async () => {
      throw new Error('busy');
    },
    insert: async () => 'inserted',
  });
  assert.equal(capped.stopped, 'attempts');
  assert.equal(capped.inserted, 0);
  assert.equal(shouldChainRefill(capped, 0), false);

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
  const refill = readFileSync(new URL('../exerciseBankRefill.ts', import.meta.url), 'utf8');
  const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(schedule, /schedule: '30 5 \* \* 1'/);
  assert.match(schedule, /exercise-bank-refill-background/);
  assert.match(schedule, /EXERCISE_BANK_JOB_SECRET/);
  assert.equal(schedule.includes('produceGrammar'), false);
  assert.match(refill, /produceGrammar/);
  assert.match(refill, /x-exercise-bank-secret/);
  assert.match(refill, /insertGrammarBankItem/);
  assert.match(background, /recordExerciseBankCrash/);
  assert.match(background, /import\('\.\.\/exerciseBankRefill\.ts'\)/);
  assert.match(toml, /\[functions\."exercise-bank-refill-background"\]/);
  assert.match(toml, /timeout = 900/);
  assert.match(schedule, /kind: 'listening'/);
  assert.match(schedule, /listeningWeeklyBatchSize\(env\)/);
  assert.match(schedule, /EXERCISE_BANK_LISTENING_WEEKLY_BATCH/);
  assert.match(refill, /produceListeningLesson/);
  assert.match(refill, /synthesizeNeuralMp3/);
  assert.match(refill, /insertListeningBankItem/);
  assert.match(refill, /nextListeningSlot/);
  assert.match(refill, /nextGrammarSlot/);
  assert.match(refill, /exerciseBankFillCounts/);
  assert.match(refill, /exercise_bank_runs|startExerciseBankRun/);
  assert.equal(refill.includes('Promise.all'), false);
  assert.equal(background.includes('Promise.all'), false);
});

test('a listening batch round-robins level and format before it repeats one', () => {
  const counts = new Map<string, number>();
  const seen: string[] = [];
  for (let cursor = 0; cursor < listeningFocuses().length; cursor += 1) {
    const slot = nextListeningSlot({ cursor, counts, random: () => 0 });
    seen.push(`${slot.level}:${slot.format}`);
    counts.set(listeningSlotKey(slot), 1);
  }
  assert.deepEqual(seen, [
    'Beginner:text',
    'Beginner:dialogue',
    'Intermediate:text',
    'Intermediate:dialogue',
    'Advanced:text',
    'Advanced:dialogue',
  ]);
});

test('a 100-lesson listening batch gives every level and format about the same number', () => {
  const counts = new Map<string, number>();
  const focus = new Map<string, number>();
  for (let cursor = 0; cursor < 100; cursor += 1) {
    const slot = nextListeningSlot({ cursor, counts, random: () => 0 });
    const key = `${slot.level}:${slot.format}`;
    focus.set(key, (focus.get(key) ?? 0) + 1);
    counts.set(listeningSlotKey(slot), (counts.get(listeningSlotKey(slot)) ?? 0) + 1);
  }
  assert.equal(focus.get('Beginner:text'), 17);
  assert.equal(focus.get('Beginner:dialogue'), 17);
  assert.equal(focus.get('Intermediate:text'), 17);
  assert.equal(focus.get('Intermediate:dialogue'), 17);
  assert.equal(focus.get('Advanced:text'), 16);
  assert.equal(focus.get('Advanced:dialogue'), 16);
  const beginner = (focus.get('Beginner:text') ?? 0) + (focus.get('Beginner:dialogue') ?? 0);
  const intermediate = (focus.get('Intermediate:text') ?? 0) + (focus.get('Intermediate:dialogue') ?? 0);
  const advanced = (focus.get('Advanced:text') ?? 0) + (focus.get('Advanced:dialogue') ?? 0);
  assert.equal(beginner, 34);
  assert.equal(intermediate, 34);
  assert.equal(advanced, 32);
  const text = [...focus.entries()].filter(([key]) => key.endsWith(':text')).reduce((sum, [, n]) => sum + n, 0);
  const dialogue = 100 - text;
  assert.equal(text, 50);
  assert.equal(dialogue, 50);
  assert.equal(Math.max(...counts.values()), 1);
});

test('a dialogue with the wrong names can still be stored when the lines fit', () => {
  const lines = [
    'I missed the early morning train and waited outside today.',
    'We can take the next one together if we hurry now.',
    'It leaves in about ten minutes from platform four today.',
    'I will buy the tickets while we wait in line.',
    'Thank you that gives us enough time for a coffee.',
    'I already saved two seats by the window for us.',
  ];
  const dialogue = lines.map((line, index) => ({
    speaker: index % 2 === 0 ? 'Emma' : 'Daniel',
    line,
    gender: index % 2 === 0 ? 'female' as const : 'male' as const,
  }));
  const prepared = listeningStoryForBank({
    format: 'dialogue',
    story: '',
    dialogue,
    wordCount: 60,
    speakers: [
      { name: 'Anna', gender: 'female' },
      { name: 'James', gender: 'male' },
    ],
  });
  assert.deepEqual(prepared.problems, []);
  assert.equal(prepared.dialogue[0].speaker, 'Anna');
  assert.equal(prepared.dialogue[0].gender, 'female');
  assert.equal(prepared.dialogue[1].speaker, 'James');
  assert.equal(prepared.dialogue[1].gender, 'male');
  assert.match(prepared.story, /^Anna: /);
});

test('listening refill prefers the thinnest cell and randomizes ties', () => {
  const full = listeningSlotKey({
    level: 'Beginner',
    format: 'text',
    topic: 'daily life',
    wordCount: 60,
    questionCount: 5,
  });
  const counts = new Map<string, number>([[full, 4]]);
  const next = nextListeningSlot({ cursor: 0, counts, random: () => 0 });
  assert.equal(`${next.level}:${next.format}`, 'Beginner:text');
  assert.notEqual(listeningSlotKey(next), full);
  assert.equal(next.topic, 'fantasy');
  const last = nextListeningSlot({ cursor: 0, counts: new Map(), random: () => 0.999 });
  assert.equal(last.level, 'Beginner');
  assert.equal(last.format, 'text');
  assert.equal(last.wordCount, 140);
  assert.equal(last.questionCount, 10);
  assert.equal(last.topic, 'culture_food');
  const first = nextListeningSlot({ cursor: 0, counts: new Map(), random: () => 0 });
  assert.equal(first.topic, 'daily life');
  assert.equal(first.wordCount, 60);
  assert.equal(first.questionCount, 5);
});

test('grammar refill walks levels in turn and fills the thinner exercise', () => {
  const counts = new Map<string, number>();
  const seen: string[] = [];
  for (let cursor = 0; cursor < 9; cursor += 1) {
    const slot = nextGrammarSlot({ cursor, counts, random: () => 0 });
    seen.push(`${slot.level}:${slot.exercise}`);
    counts.set(grammarSlotKey(slot), (counts.get(grammarSlotKey(slot)) ?? 0) + 1);
  }
  assert.deepEqual(seen, [
    'B1:blanks', 'B2:blanks', 'C1:blanks',
    'B1:phrasal', 'B2:phrasal', 'C1:phrasal',
    'B1:order', 'B2:order', 'C1:order',
  ]);
  counts.set(grammarSlotKey({ level: 'B1', exercise: 'blanks' }), 10);
  const behind = nextGrammarSlot({ cursor: 0, counts, random: () => 0 });
  assert.equal(`${behind.level}:${behind.exercise}`, 'B1:phrasal');
  const levels = new Map<string, number>();
  const fresh = new Map<string, number>();
  for (let cursor = 0; cursor < 250; cursor += 1) {
    const slot = nextGrammarSlot({ cursor, counts: fresh, random: () => 0 });
    levels.set(slot.level, (levels.get(slot.level) ?? 0) + 1);
    fresh.set(grammarSlotKey(slot), (fresh.get(grammarSlotKey(slot)) ?? 0) + 1);
  }
  assert.equal(levels.get('B1'), 84);
  assert.equal(levels.get('B2'), 83);
  assert.equal(levels.get('C1'), 83);
  assert.equal(Math.max(...fresh.values()) - Math.min(...fresh.values()), 1);
});

test('text and dialogue fixtures both satisfy the bank and the speech markup', async () => {
  const { buildListeningSsml, AZURE_VOICE_FEMALE, AZURE_VOICE_MALE, dialogueVoiceCast } = await import('../azureSpeech.ts');
  const { assembleListeningLesson } = await import('../exerciseBank.ts');
  const quiz = Array.from({ length: 5 }, (_, index) => ({
    question: `What happens in part ${index}?`,
    options: [`answer ${index}`, 'other idea', 'another idea', 'none of these'],
    correctAnswer: `answer ${index}`,
    explanation: 'The story says so.',
    supportingSentence: 'A sentence from the story.',
  }));
  const text = words(60, 'word');
  const textLesson = assembleListeningLesson({
    slot: { level: 'Beginner', format: 'text', topic: 'daily life', wordCount: 60, questionCount: 5 },
    story: text,
    dialogue: [],
    vocabulary: [{ word: 'word0', definition: 'A word.' }],
    quiz,
    speakers: [],
  });
  assert.ok(textLesson);
  const textSpeech = buildListeningSsml({ format: 'text', story: text, dialogue: [] });
  assert.match(textSpeech.ssml, new RegExp(AZURE_VOICE_FEMALE));
  assert.equal(textSpeech.ssml.includes(AZURE_VOICE_MALE), false);
  const lines = [
    'I missed the early morning train and waited outside today.',
    'We can take the next one together if we hurry now.',
    'It leaves in about ten minutes from platform four today.',
    'I will buy the tickets while we wait in line.',
    'Thank you that gives us enough time for a coffee.',
    'I already saved two seats by the window for us.',
  ];
  const prepared = listeningStoryForBank({
    format: 'dialogue',
    story: '',
    dialogue: lines.map((line, index) => ({
      speaker: index % 2 === 0 ? 'Emma' : 'Daniel',
      line,
      gender: index % 2 === 0 ? 'female' as const : 'male' as const,
    })),
    wordCount: 60,
    speakers: [
      { name: 'Anna', gender: 'female' },
      { name: 'James', gender: 'male' },
    ],
  });
  assert.deepEqual(prepared.problems, []);
  const dialogueLesson = assembleListeningLesson({
    slot: { level: 'Intermediate', format: 'dialogue', topic: 'travel', wordCount: 60, questionCount: 5 },
    story: prepared.story,
    dialogue: prepared.dialogue,
    vocabulary: [{ word: 'train', definition: 'A transport.' }],
    quiz,
    speakers: [
      { name: 'Anna', gender: 'female' },
      { name: 'James', gender: 'male' },
    ],
  });
  assert.ok(dialogueLesson);
  const dialogueSpeech = buildListeningSsml({
    format: 'dialogue',
    story: prepared.story,
    dialogue: prepared.dialogue,
  });
  assert.deepEqual(dialogueVoiceCast(prepared.dialogue), [
    { speaker: 'Anna', gender: 'female', voice: AZURE_VOICE_FEMALE },
    { speaker: 'James', gender: 'male', voice: AZURE_VOICE_MALE },
  ]);
  assert.match(dialogueSpeech.ssml, new RegExp(`<voice name="${AZURE_VOICE_FEMALE}">Anna\\.`));
  assert.match(dialogueSpeech.ssml, new RegExp(`<voice name="${AZURE_VOICE_MALE}">James\\.`));
});

test('the refill diagnostic tables are private and do not store the lesson', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261116_exercise_bank_runs.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.exercise_bank_runs/);
  assert.match(sql, /create table if not exists public\.exercise_bank_attempts/);
  assert.match(sql, /result in \('ok', 'miss', 'error'\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /grant select, insert, update, delete on public\.exercise_bank_runs to service_role/);
  assert.match(sql, /revoke all on public\.exercise_bank_attempts from public, anon, authenticated/);
  assert.equal(sql.includes('payload'), false);
  assert.equal(sql.toLowerCase().includes('stripe'), false);
  assert.equal(sql.includes('consume_lesson'), false);
});

test('the fill-count migration does not expose lessons or touch billing', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261115_exercise_bank_fill_counts.sql', import.meta.url), 'utf8');
  assert.match(sql, /exercise_bank_fill_counts\(bank_kind text\)/);
  assert.match(sql, /count\(\*\)::bigint/);
  assert.match(sql, /bank_kind in \('grammar', 'listening'\)/);
  assert.match(sql, /revoke all on function public\.exercise_bank_fill_counts\(text\)/);
  assert.match(sql, /grant execute on function public\.exercise_bank_fill_counts\(text\) to service_role/);
  assert.equal(sql.includes('payload'), false);
  assert.equal(sql.toLowerCase().includes('stripe'), false);
  assert.equal(sql.includes('consume_lesson'), false);
});

function words(count: number, label: string): string {
  return Array.from({ length: count }, (_, index) => `${label}${index}`).join(' ');
}

function listeningFixture(slot: ListeningSlot, storyWords = slot.wordCount): ListeningLesson {
  const story = words(storyWords, 'word');
  const dialogue = slot.format === 'dialogue'
    ? Array.from({ length: 6 }, (_, index) => ({
      speaker: index % 2 === 0 ? 'Anna' : 'James',
      line: words(Math.ceil(storyWords / 6), `line${index}`),
      gender: index % 2 === 0 ? 'female' as const : 'male' as const,
    }))
    : [];
  const lesson = assembleListeningLesson({
    slot,
    story: slot.format === 'dialogue'
      ? dialogue.map((turn) => `${turn.speaker}: ${turn.line}`).join('\n')
      : story,
    dialogue,
    vocabulary: [{ word: 'word0', definition: 'A word.' }],
    quiz: Array.from({ length: slot.questionCount }, (_, index) => ({
      question: `What happens in part ${index}?`,
      options: [`answer ${index}`, 'other', 'another', 'none'],
      correctAnswer: `answer ${index}`,
      explanation: 'The story says so.',
      supportingSentence: 'word0 word1.',
    })),
    speakers: slot.format === 'dialogue'
      ? [{ name: 'Anna', gender: 'female' }, { name: 'James', gender: 'male' }]
      : [],
  });
  if (!lesson) throw new Error(`fixture was not bankable for ${slot.level} ${slot.format}`);
  return lesson;
}

test('listening combinations are the list topics, and a typed topic stays live', () => {
  const topics = TOPICS.filter((topic) => topic.value !== WILDCARD_TOPIC);
  const slots = listeningSlots();
  assert.equal(slots.length, 3 * 2 * 3 * 3 * topics.length);
  assert.equal(listeningBankQuery({ customTopic: '', topic: 'daily life' }).bank, true);
  assert.equal(listeningBankQuery({ customTopic: '   ', topic: 'Travel' }).bank, true);
  const any = listeningBankQuery({ customTopic: '', topic: 'wildcard' });
  assert.equal(any.bank, true);
  if (any.bank) assert.equal(any.topic, null);
  const named = listeningBankQuery({ customTopic: '', topic: 'Daily Life' });
  assert.equal(named.bank, true);
  if (named.bank) assert.equal(named.topic, 'daily life');
  assert.deepEqual(listeningBankQuery({ customTopic: 'my street market', topic: 'daily life' }), {
    bank: false,
    reason: 'custom',
  });
  assert.equal(listeningBankQuery({ customTopic: '', topic: 'not a list topic' }).bank, false);
});

test('a listening hash ignores option order and keeps the audio path off the payload', () => {
  const slot = listeningSlots().find((item) => item.format === 'text' && item.wordCount === 60 && item.questionCount === 5);
  assert.ok(slot);
  if (!slot) return;
  const lesson = listeningFixture(slot);
  const shuffled = {
    ...lesson,
    quiz: lesson.quiz.map((item) => ({ ...item, options: [...item.options].reverse() })),
  };
  assert.equal(listeningContentHash(shuffled), listeningContentHash(lesson));
  const payload = listeningBankPayload(lesson);
  assert.equal(payload.mode, 'listening');
  assert.equal(payload.topic, 'Daily Life');
  assert.equal('audioPath' in payload, false);
  assert.equal('audioUrl' in payload, false);
  const path = listeningAudioPath(listeningContentHash(lesson));
  const served = listeningLessonFromBankPayload(payload, {
    topic: lesson.topicValue,
    wordCount: lesson.wordCount,
    questionCount: lesson.questionCount,
    audioPath: path,
  }, {
    level: lesson.level,
    format: lesson.format,
    topic: lesson.topicValue,
    wordCount: lesson.wordCount,
    questionCount: lesson.questionCount,
  });
  assert.equal(served?.quiz.length, lesson.questionCount);
  assert.equal(listeningLessonFromBankPayload(payload, {
    topic: lesson.topicValue,
    wordCount: lesson.wordCount,
    questionCount: lesson.questionCount,
    audioPath: path,
  }, {
    level: 'Advanced',
    format: lesson.format,
    topic: lesson.topicValue,
    wordCount: lesson.wordCount,
    questionCount: lesson.questionCount,
  }), null);
});

test('the listening batch stays under the Azure free-tier month at the default size', () => {
  assert.equal(listeningWeeklyBatchSize({}), 100);
  assert.equal(listeningWeeklyBatchSize({ EXERCISE_BANK_LISTENING_WEEKLY_BATCH: '80' }), 80);
  assert.equal(listeningWeeklyBatchSize({ EXERCISE_BANK_LISTENING_WEEKLY_BATCH: '9000' }), 100);
  assert.equal(readRefillRequest({ headers: {}, body: '{"kind":"listening"}', env: {} }).target, 100);
  assert.equal(readRefillRequest({ headers: {}, body: '{"kind":"listening","target":12}', env: {} }).target, 12);
  assert.equal(readRefillRequest({ headers: {}, body: '{"kind":"reading"}', env: {} }).kind, null);
  const weekly = listeningWeeklyCharacters(listeningWeeklyBatchSize({}), LISTENING_CHARS_PER_LESSON_HIGH);
  assert.equal(weekly, 100 * 900);
  assert.ok(weekly * 4 < AZURE_NEURAL_FREE_CHARACTERS);
  assert.equal(readRefillRequest({
    headers: {
      'x-exercise-bank-remaining': '15',
      'x-exercise-bank-kind': 'listening',
    },
    body: '{"kind":"grammar","target":250}',
    env: {},
  }).kind, 'listening');
});

test('the listening migration keeps audio private and does not touch billing', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261114_listening_bank.sql', import.meta.url), 'utf8');
  assert.match(sql, /exercise_bank_listening_slot_check/);
  assert.match(sql, /listening-audio/);
  assert.match(sql, /public = false/);
  assert.match(sql, /listening_audio_no_client/);
  assert.match(sql, /claim_listening_bank_item/);
  assert.match(sql, /revoke all on function public\.claim_listening_bank_item/);
  assert.match(sql, /grant execute on function public\.claim_listening_bank_item\(uuid, text, text, text, integer, integer\) to service_role/);
  assert.match(sql, /audioPath/);
  for (const topic of TOPICS) {
    if (topic.value === WILDCARD_TOPIC) continue;
    assert.match(sql, new RegExp(topic.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal(sql.toLowerCase().includes('stripe'), false);
  assert.equal(sql.includes('create or replace function public.consume_lesson'), false);
  assert.equal(sql.includes('alter table public.saved_lessons'), false);
});

test('a standard listening request claims before it counts a lesson, and a custom topic does not', () => {
  const generate = readFileSync(new URL('../api/generate.ts', import.meta.url), 'utf8');
  const body = generate.slice(generate.indexOf('async function createListeningLesson'));
  const claimAt = body.indexOf('claimListeningFromBank');
  const consumeAt = body.indexOf('consumeLessonResponse');
  const releaseAt = body.indexOf('releaseGrammarBankItem');
  const liveAt = body.indexOf('producePractice');
  const azureAt = body.indexOf('synthesizeNeuralMp3');
  assert.ok(claimAt >= 0 && claimAt < consumeAt && consumeAt < releaseAt);
  assert.ok(liveAt > releaseAt);
  assert.ok(azureAt > liveAt);
  const liveTail = body.slice(liveAt);
  assert.equal(liveTail.includes('if (!choice.bank)'), false);
  assert.match(liveTail, /reason: choice\.bank \? 'bank_empty'/);
  assert.match(body, /listeningBankQuery/);
  assert.match(body, /audioBase64/);
  assert.match(generate, /freeLimitResponse/);
  const tasks = readFileSync(new URL('../taskServer.ts', import.meta.url), 'utf8');
  assert.match(tasks, /listeningPieceFromBank/);
  assert.match(tasks, /claimListeningFromBank/);
  assert.match(tasks, /releaseGrammarBankItem/);
  const app = readFileSync(new URL('../components/Configurator.tsx', import.meta.url), 'utf8');
  assert.match(app, /id="listening-topic"/);
  assert.match(app, /placeholder="Any topic \(optional\)"/);
  const screen = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(screen, /practiceType === 'listening' \? setListeningCustomTopic/);
  assert.match(screen, /const configScreen = \(/);
  assert.doesNotMatch(screen, /<ConfigScreen/);
  assert.match(screen, /lessonAudioUrlRef/);
  assert.match(screen, /lessonAzureOnlyRef/);
  assert.match(screen, /listening: 'browser_tts'/);
  assert.match(screen, /listening: 'bank_audio_missing'/);
  const grammar = readFileSync(new URL('../components/GrammarPage.tsx', import.meta.url), 'utf8');
  assert.match(grammar, /id="grammar-topic"/);
  assert.doesNotMatch(grammar, /const \w+ = \(\) => \([\s\S]*id="grammar-topic"/);
});
