import { createHash, timingSafeEqual } from 'node:crypto';
import {
  GRAMMAR_ITEM_COUNT,
  GRAMMAR_MIN_ITEMS,
  normalizeGrammarSet,
  type GrammarExerciseType,
  type GrammarItem,
  type GrammarLevel,
  type GrammarRequest,
  type GrammarSet,
} from './grammarSet.ts';
import { readEnvValue, type EnvMap } from './taskMail.ts';

/** Standard grammar options. A typed topic is not a bank key. */
export const GRAMMAR_BANK_LEVELS: readonly GrammarLevel[] = ['B1', 'B2', 'C1'];
export const GRAMMAR_BANK_EXERCISES: readonly GrammarExerciseType[] = ['blanks', 'phrasal', 'order'];

/** New grammar sets per Monday run, spread across the 9 level × exercise pairs. */
export const EXERCISE_BANK_WEEKLY_BATCH_DEFAULT = 250;
export const EXERCISE_BANK_BATCH_MAX = 3000;
/** Stored sets kept for one level and one exercise. Older rows are deleted past this. */
export const EXERCISE_BANK_CAP_DEFAULT = 1000;
export const EXERCISE_BANK_CAP_MAX = 5000;
export const EXERCISE_BANK_HOP_LIMIT = 200;
export const REFILL_RESERVE_MS = 40_000;
export const REFILL_HARD_FAILURE_LIMIT = 4;
export const REFILL_MISS_LIMIT = 8;
export const REFILL_DUPLICATE_LIMIT = 12;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GrammarSlot = {
  level: GrammarLevel;
  exercise: GrammarExerciseType;
};

export type RefillInsertResult = 'inserted' | 'duplicate' | 'invalid' | 'error' | 'unavailable';

export type RefillStop = 'target' | 'time' | 'failures' | 'duplicates' | 'unavailable';

export type RefillHopResult = {
  inserted: number;
  remaining: number;
  cursor: number;
  stopped: RefillStop | null;
};

export function grammarSlots(): GrammarSlot[] {
  return GRAMMAR_BANK_LEVELS.flatMap((level) => (
    GRAMMAR_BANK_EXERCISES.map((exercise) => ({ level, exercise }))
  ));
}

/** An empty topic is the standard exercise. Typed text always stays on live generation. */
export function grammarUsesBank(topic: string): boolean {
  return topic.trim().length === 0;
}

export function isBankId(value: string): boolean {
  return UUID_RE.test(value);
}

/** Id stored on a task grammar piece so a withheld pack can return the set to the pool. */
export function grammarBankId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const id = (value as { bankId?: unknown }).bankId;
  return typeof id === 'string' && isBankId(id) ? id : null;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function canonicalItem(item: GrammarItem): { kind: 'choice' | 'order'; prompt?: string; answer?: string; chunks?: string[] } {
  if (item.kind === 'order') {
    return { kind: 'order', chunks: item.chunks.map(oneLine) };
  }
  return { kind: 'choice', prompt: oneLine(item.prompt), answer: oneLine(item.correctAnswer) };
}

/**
 * Same prompts and answers are one exercise, even when the options were shuffled
 * or the items were reordered. The topic is not part of the hash: banked sets have none.
 */
export function grammarContentHash(set: Pick<GrammarSet, 'level' | 'exercise' | 'items'>): string {
  const items = set.items.map(canonicalItem).sort((left, right) => {
    const a = JSON.stringify(left);
    const b = JSON.stringify(right);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  const body = JSON.stringify({
    kind: 'grammar',
    level: set.level,
    exercise: set.exercise,
    items,
  });
  return createHash('sha256').update(body).digest('hex');
}

export function grammarBankPayload(set: GrammarSet): {
  mode: 'grammar';
  level: GrammarLevel;
  exercise: GrammarExerciseType;
  topic: '';
  title: string;
  items: GrammarItem[];
} {
  return {
    mode: 'grammar',
    level: set.level,
    exercise: set.exercise,
    topic: '',
    title: set.title,
    items: set.items,
  };
}

export function canBankGrammarSet(set: GrammarSet): boolean {
  return grammarUsesBank(set.topic)
    && GRAMMAR_BANK_LEVELS.includes(set.level)
    && GRAMMAR_BANK_EXERCISES.includes(set.exercise)
    && set.items.length >= GRAMMAR_MIN_ITEMS
    && set.items.length <= GRAMMAR_ITEM_COUNT;
}

/** Re-check a stored set with the same validator the generator uses. Options are shuffled again. */
export function grammarSetFromBankPayload(payload: unknown, request: GrammarRequest): GrammarSet | null {
  if (!grammarUsesBank(request.topic)) return null;
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (record.level !== request.level || record.exercise !== request.exercise) return null;
  if (typeof record.topic === 'string' && record.topic.trim()) return null;
  const normalized = normalizeGrammarSet(payload, {
    level: request.level,
    exercise: request.exercise,
    topic: '',
  });
  if (!normalized.ok || !canBankGrammarSet(normalized.set)) return null;
  return normalized.set;
}

/** Ids past the cap when `newestFirst` is ordered newest to oldest. */
export function overflowIds(newestFirst: readonly { id: string }[], cap: number): string[] {
  if (cap < 1) return newestFirst.map((row) => row.id);
  return newestFirst.slice(cap).map((row) => row.id);
}

export function bankUnavailable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return message.includes('42p01')
    || message.includes('42883')
    || message.includes('pgrst202')
    || message.includes('pgrst205')
    || message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('could not find the function');
}

function readBoundedInt(raw: string, min: number, max: number): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

export function weeklyBatchSize(env: EnvMap): number {
  const parsed = readBoundedInt(readEnvValue(env, 'EXERCISE_BANK_WEEKLY_BATCH'), 1, EXERCISE_BANK_BATCH_MAX);
  return parsed ?? EXERCISE_BANK_WEEKLY_BATCH_DEFAULT;
}

export function exerciseBankCap(env: EnvMap): number {
  const parsed = readBoundedInt(readEnvValue(env, 'EXERCISE_BANK_CAP'), 1, EXERCISE_BANK_CAP_MAX);
  return parsed ?? EXERCISE_BANK_CAP_DEFAULT;
}

function headerValue(headers: Record<string, string | undefined>, name: string): string {
  return (headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '').trim();
}

/**
 * A continuation hop sends the remaining count in a header.
 * The first hop uses the JSON target, or the weekly batch when that is omitted.
 * A broken remaining count stops the chain instead of starting the batch over.
 */
export function readRefillRequest(input: {
  headers: Record<string, string | undefined>;
  body: string | null | undefined;
  env: EnvMap;
}): { target: number; cursor: number; hops: number } {
  const cursor = readBoundedInt(headerValue(input.headers, 'x-exercise-bank-cursor'), 0, 1_000_000) ?? 0;
  const hops = readBoundedInt(headerValue(input.headers, 'x-exercise-bank-hops'), 0, EXERCISE_BANK_HOP_LIMIT) ?? 0;
  const remaining = headerValue(input.headers, 'x-exercise-bank-remaining');
  if (remaining) {
    return {
      target: readBoundedInt(remaining, 1, EXERCISE_BANK_BATCH_MAX) ?? 0,
      cursor,
      hops,
    };
  }
  let bodyTarget: unknown;
  try {
    const parsed = JSON.parse(input.body || '{}') as { target?: unknown };
    bodyTarget = parsed && typeof parsed === 'object' ? parsed.target : undefined;
  } catch {
    bodyTarget = undefined;
  }
  if (bodyTarget != null && String(bodyTarget).trim()) {
    const target = readBoundedInt(String(bodyTarget), 1, EXERCISE_BANK_BATCH_MAX);
    return { target: target ?? weeklyBatchSize(input.env), cursor, hops };
  }
  return { target: weeklyBatchSize(input.env), cursor, hops };
}

export function exerciseBankSecretOk(header: string | null | undefined, env: EnvMap): boolean {
  const expected = readEnvValue(env, 'EXERCISE_BANK_JOB_SECRET');
  const got = header?.trim() ?? '';
  if (!expected || !got) return false;
  const left = Buffer.from(got);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function shouldChainRefill(result: RefillHopResult, hops: number, hopLimit = EXERCISE_BANK_HOP_LIMIT): boolean {
  if (result.remaining <= 0) return false;
  if (hops + 1 >= hopLimit) return false;
  return result.stopped === 'time' || result.stopped === null;
}

/**
 * One background invocation. It rotates through the 9 grammar combinations
 * and stops for the clock, a string of failures, or the target.
 */
export async function runRefillHop(input: {
  slots: readonly GrammarSlot[];
  target: number;
  cursor: number;
  deadline: number;
  now?: () => number;
  reserveMs?: number;
  produce: (slot: GrammarSlot) => Promise<GrammarSet | null>;
  insert: (slot: GrammarSlot, set: GrammarSet) => Promise<RefillInsertResult>;
}): Promise<RefillHopResult> {
  const now = input.now ?? (() => Date.now());
  const reserveMs = input.reserveMs ?? REFILL_RESERVE_MS;
  const slots = input.slots;
  if (input.target <= 0) {
    return { inserted: 0, remaining: 0, cursor: input.cursor, stopped: 'target' };
  }
  if (!slots.length) {
    return { inserted: 0, remaining: input.target, cursor: input.cursor, stopped: 'failures' };
  }
  let inserted = 0;
  let cursor = input.cursor;
  let hard = 0;
  let misses = 0;
  let duplicates = 0;
  let stopped: RefillStop | null = null;

  while (inserted < input.target) {
    if (now() + reserveMs >= input.deadline) {
      stopped = 'time';
      break;
    }
    const slot = slots[((cursor % slots.length) + slots.length) % slots.length];
    cursor += 1;
    let produced: GrammarSet | null = null;
    try {
      produced = await input.produce(slot);
    } catch {
      hard += 1;
      misses = 0;
      duplicates = 0;
      if (hard >= REFILL_HARD_FAILURE_LIMIT) {
        stopped = 'failures';
        break;
      }
      continue;
    }
    if (!produced) {
      hard = 0;
      duplicates = 0;
      misses += 1;
      if (misses >= REFILL_MISS_LIMIT) {
        stopped = 'failures';
        break;
      }
      continue;
    }
    const saved = await input.insert(slot, produced);
    if (saved === 'inserted') {
      inserted += 1;
      hard = 0;
      misses = 0;
      duplicates = 0;
      continue;
    }
    if (saved === 'duplicate') {
      hard = 0;
      misses = 0;
      duplicates += 1;
      if (duplicates >= REFILL_DUPLICATE_LIMIT) {
        stopped = 'duplicates';
        break;
      }
      continue;
    }
    if (saved === 'unavailable') {
      stopped = 'unavailable';
      break;
    }
    if (saved === 'error') hard += 1;
    else hard = 0;
    misses += 1;
    duplicates = 0;
    if (hard >= REFILL_HARD_FAILURE_LIMIT || misses >= REFILL_MISS_LIMIT) {
      stopped = 'failures';
      break;
    }
  }

  if (!stopped && inserted >= input.target) stopped = 'target';
  return {
    inserted,
    remaining: Math.max(0, input.target - inserted),
    cursor,
    stopped,
  };
}
