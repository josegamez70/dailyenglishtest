import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bankUnavailable,
  canBankGrammarSet,
  grammarBankPayload,
  grammarContentHash,
  grammarSetFromBankPayload,
  grammarUsesBank,
  isBankId,
  type GrammarSlot,
  type RefillInsertResult,
} from './exerciseBank.ts';
import type { GrammarRequest, GrammarSet } from './grammarSet.ts';

const CLAIM_ATTEMPTS = 4;

type ClaimRow = { id: string; payload: unknown };

function readClaim(data: unknown): { status: 'ok'; row: ClaimRow } | { status: 'empty' | 'conflict' | 'bad' } {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return { status: 'bad' };
    }
  }
  if (!value || typeof value !== 'object') return { status: 'bad' };
  const record = value as Record<string, unknown>;
  if (record.status === 'empty') return { status: 'empty' };
  if (record.status === 'conflict') return { status: 'conflict' };
  if (record.status !== 'ok' || typeof record.id !== 'string' || !isBankId(record.id)) return { status: 'bad' };
  return { status: 'ok', row: { id: record.id, payload: record.payload } };
}

export async function exerciseBankReady(admin: SupabaseClient): Promise<boolean> {
  const probe = await admin.from('exercise_bank').select('id').limit(1);
  return !probe.error;
}

/**
 * One unseen grammar set for this person, already recorded as served.
 * A missing table or a custom topic returns null so the caller can generate live.
 */
export async function claimGrammarFromBank(
  admin: SupabaseClient,
  userId: string,
  request: GrammarRequest,
): Promise<{ id: string; set: GrammarSet } | null> {
  if (!grammarUsesBank(request.topic)) return null;
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
    const result = await admin.rpc('claim_grammar_bank_item', {
      uid: userId,
      grammar_level: request.level,
      grammar_exercise: request.exercise,
    });
    if (result.error) {
      if (!bankUnavailable(result.error)) {
        console.error(JSON.stringify({ exerciseBank: 'claim_failed', code: result.error.code ?? '' }));
      }
      return null;
    }
    const claim = readClaim(result.data);
    if (claim.status === 'empty' || claim.status === 'bad') return null;
    if (claim.status === 'conflict') continue;
    const set = grammarSetFromBankPayload(claim.row.payload, request);
    if (!set) {
      await releaseGrammarBankItem(admin, userId, claim.row.id);
      continue;
    }
    return { id: claim.row.id, set };
  }
  return null;
}

export async function releaseGrammarBankItem(
  admin: SupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<void> {
  if (!userId || !isBankId(exerciseId)) return;
  const deleted = await admin
    .from('exercise_bank_serves')
    .delete()
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId);
  if (deleted.error && !bankUnavailable(deleted.error)) {
    console.error(JSON.stringify({ exerciseBank: 'release_failed', code: deleted.error.code ?? '' }));
  }
}

async function trimGrammarSlot(admin: SupabaseClient, slot: GrammarSlot, cap: number): Promise<void> {
  for (let pass = 0; pass < 20; pass += 1) {
    const listed = await admin
      .from('exercise_bank')
      .select('id')
      .eq('kind', 'grammar')
      .eq('level', slot.level)
      .eq('exercise_type', slot.exercise)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(cap, cap + 199);
    if (listed.error) {
      if (!bankUnavailable(listed.error)) {
        console.error(JSON.stringify({ exerciseBank: 'trim_failed', code: listed.error.code ?? '' }));
      }
      return;
    }
    const ids = (listed.data ?? []).map((row) => String(row.id ?? '')).filter(isBankId);
    if (!ids.length) return;
    const deleted = await admin.from('exercise_bank').delete().in('id', ids);
    if (deleted.error || ids.length < 200) {
      if (deleted.error && !bankUnavailable(deleted.error)) {
        console.error(JSON.stringify({ exerciseBank: 'trim_failed', code: deleted.error.code ?? '' }));
      }
      return;
    }
  }
}

/** Insert one validated set. A repeated hash is skipped. Rows past the cap are the oldest. */
export async function insertGrammarBankItem(
  admin: SupabaseClient,
  set: GrammarSet,
  cap: number,
): Promise<RefillInsertResult> {
  if (!canBankGrammarSet(set)) return 'invalid';
  const payload = grammarBankPayload(set);
  if (!grammarSetFromBankPayload(payload, { level: set.level, exercise: set.exercise, topic: '' })) return 'invalid';
  const inserted = await admin.from('exercise_bank').insert({
    kind: 'grammar',
    level: set.level,
    exercise_type: set.exercise,
    dimensions: {},
    payload,
    content_hash: grammarContentHash(set),
  }).select('id').maybeSingle();
  if (inserted.error) {
    if (inserted.error.code === '23505') return 'duplicate';
    if (inserted.error.code === '23514') return 'invalid';
    if (bankUnavailable(inserted.error)) return 'unavailable';
    console.error(JSON.stringify({ exerciseBank: 'insert_failed', code: inserted.error.code ?? '' }));
    return 'error';
  }
  await trimGrammarSlot(admin, { level: set.level, exercise: set.exercise }, cap);
  return 'inserted';
}
