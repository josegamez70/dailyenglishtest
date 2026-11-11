import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bankUnavailable,
  canBankGrammarSet,
  canBankListeningLesson,
  grammarBankPayload,
  grammarContentHash,
  grammarSetFromBankPayload,
  grammarUsesBank,
  isBankId,
  isListeningAudioPath,
  listeningAudioPath,
  listeningBankPayload,
  listeningContentHash,
  listeningDimensions,
  listeningLessonFromBankPayload,
  grammarSlotKey,
  listeningSlotKey,
  type ExerciseBankKind,
  type GrammarSlot,
  type ListeningLesson,
  type ListeningSlot,
  type RefillInsertResult,
} from './exerciseBank.ts';
import type { GrammarRequest, GrammarSet } from './grammarSet.ts';

const LISTENING_BUCKET = 'listening-audio';
const SIGNED_URL_SECONDS = 60 * 60;

const CLAIM_ATTEMPTS = 4;

type ClaimRow = { id: string; payload: unknown; dimensions: unknown };

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
  return { status: 'ok', row: { id: record.id, payload: record.payload, dimensions: record.dimensions ?? null } };
}

/**
 * How many rows each combination already has. An empty map means the refill
 * treats every cell as empty (the count function is not applied yet, or it failed).
 */
export async function exerciseBankFillCounts(
  admin: SupabaseClient,
  kind: ExerciseBankKind,
): Promise<Map<string, number>> {
  const result = await admin.rpc('exercise_bank_fill_counts', { bank_kind: kind });
  const counts = new Map<string, number>();
  if (result.error) {
    if (!bankUnavailable(result.error)) {
      console.error(JSON.stringify({ exerciseBank: 'counts_failed', code: result.error.code ?? '' }));
    }
    return counts;
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  for (const row of rows) {
    const record = row as {
      level?: unknown;
      exercise_type?: unknown;
      topic?: unknown;
      word_count?: unknown;
      question_count?: unknown;
      n?: unknown;
    };
    const n = Number(record.n ?? 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    const key = kind === 'grammar'
      ? grammarSlotKey({
        level: String(record.level ?? '') as GrammarSlot['level'],
        exercise: String(record.exercise_type ?? '') as GrammarSlot['exercise'],
      })
      : listeningSlotKey({
        level: String(record.level ?? '') as ListeningSlot['level'],
        format: String(record.exercise_type ?? '') as ListeningSlot['format'],
        topic: String(record.topic ?? ''),
        wordCount: Number(record.word_count ?? 0),
        questionCount: Number(record.question_count ?? 0),
      });
    counts.set(key, n);
  }
  return counts;
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

function audioPathFromDimensions(dimensions: unknown): string {
  if (!dimensions || typeof dimensions !== 'object') return '';
  const path = String((dimensions as { audioPath?: unknown }).audioPath ?? '');
  return isListeningAudioPath(path) ? path : '';
}

async function deleteListeningObjects(admin: SupabaseClient, paths: string[]): Promise<void> {
  const clean = paths.filter(isListeningAudioPath);
  if (!clean.length) return;
  const removed = await admin.storage.from(LISTENING_BUCKET).remove(clean);
  if (removed.error) {
    console.error(JSON.stringify({ exerciseBank: 'audio_delete_failed', message: removed.error.message.slice(0, 160) }));
  }
}

/** A private-bucket URL for one stored mp3. The path itself never leaves the server except as this signature. */
export async function signListeningAudio(admin: SupabaseClient, audioPath: string): Promise<string | null> {
  if (!isListeningAudioPath(audioPath)) return null;
  const signed = await admin.storage.from(LISTENING_BUCKET).createSignedUrl(audioPath, SIGNED_URL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    if (signed.error) {
      console.error(JSON.stringify({ exerciseBank: 'audio_sign_failed', message: signed.error.message.slice(0, 160) }));
    }
    return null;
  }
  return signed.data.signedUrl;
}

export async function uploadListeningAudio(
  admin: SupabaseClient,
  audioPath: string,
  bytes: Uint8Array,
): Promise<'ok' | 'exists' | 'error' | 'unavailable'> {
  if (!isListeningAudioPath(audioPath) || bytes.byteLength < 64) return 'error';
  const uploaded = await admin.storage.from(LISTENING_BUCKET).upload(audioPath, bytes, {
    contentType: 'audio/mpeg',
    upsert: false,
  });
  if (!uploaded.error) return 'ok';
  const message = uploaded.error.message.toLowerCase();
  if (message.includes('already exists') || message.includes('duplicate') || message.includes('409')) return 'exists';
  if (message.includes('bucket') || message.includes('not found')) return 'unavailable';
  console.error(JSON.stringify({ exerciseBank: 'audio_upload_failed', message: uploaded.error.message.slice(0, 160) }));
  return 'error';
}

/**
 * One unseen listening lesson for this person, already recorded as served.
 * A missing table or a custom topic returns null so the caller can generate live.
 */
export async function claimListeningFromBank(
  admin: SupabaseClient,
  userId: string,
  request: { level: string; format: string; topic: string | null; wordCount: number; questionCount: number },
): Promise<{ id: string; lesson: ListeningLesson; audioPath: string } | null> {
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
    const result = await admin.rpc('claim_listening_bank_item', {
      uid: userId,
      listening_level: request.level,
      listening_format: request.format,
      listening_topic: request.topic ?? '',
      listening_words: request.wordCount,
      listening_questions: request.questionCount,
    });
    if (result.error) {
      if (!bankUnavailable(result.error)) {
        console.error(JSON.stringify({ exerciseBank: 'listening_claim_failed', code: result.error.code ?? '' }));
      }
      return null;
    }
    const claim = readClaim(result.data);
    if (claim.status === 'empty' || claim.status === 'bad') return null;
    if (claim.status === 'conflict') continue;
    const dimensions = claim.row.dimensions;
    const lesson = listeningLessonFromBankPayload(claim.row.payload, dimensions, request);
    const audioPath = audioPathFromDimensions(dimensions);
    if (!lesson || !audioPath) {
      await releaseGrammarBankItem(admin, userId, claim.row.id);
      continue;
    }
    return { id: claim.row.id, lesson, audioPath };
  }
  return null;
}

/** True when this person was given this bank row. Used before signing its audio. */
export async function userWasServedBankItem(
  admin: SupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<boolean> {
  if (!userId || !isBankId(exerciseId)) return false;
  const row = await admin
    .from('exercise_bank_serves')
    .select('exercise_id')
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId)
    .maybeSingle();
  if (row.error) return false;
  return Boolean(row.data);
}

export async function listeningAudioPathForRow(admin: SupabaseClient, exerciseId: string): Promise<string | null> {
  if (!isBankId(exerciseId)) return null;
  const row = await admin
    .from('exercise_bank')
    .select('kind, dimensions')
    .eq('id', exerciseId)
    .maybeSingle();
  if (row.error || !row.data || row.data.kind !== 'listening') return null;
  const path = audioPathFromDimensions(row.data.dimensions);
  return path || null;
}

async function trimListeningSlot(admin: SupabaseClient, slot: ListeningSlot, cap: number): Promise<void> {
  for (let pass = 0; pass < 20; pass += 1) {
    const listed = await admin
      .from('exercise_bank')
      .select('id, dimensions')
      .eq('kind', 'listening')
      .eq('level', slot.level)
      .eq('exercise_type', slot.format)
      .filter('dimensions->>topic', 'eq', slot.topic)
      .filter('dimensions->>wordCount', 'eq', String(slot.wordCount))
      .filter('dimensions->>questionCount', 'eq', String(slot.questionCount))
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(cap, cap + 199);
    if (listed.error) {
      if (!bankUnavailable(listed.error)) {
        console.error(JSON.stringify({ exerciseBank: 'trim_failed', code: listed.error.code ?? '' }));
      }
      return;
    }
    const rows = listed.data ?? [];
    const ids = rows.map((row) => String(row.id ?? '')).filter(isBankId);
    if (!ids.length) return;
    const paths = rows.map((row) => audioPathFromDimensions(row.dimensions));
    await deleteListeningObjects(admin, paths);
    const deleted = await admin.from('exercise_bank').delete().in('id', ids);
    if (deleted.error || ids.length < 200) {
      if (deleted.error && !bankUnavailable(deleted.error)) {
        console.error(JSON.stringify({ exerciseBank: 'trim_failed', code: deleted.error.code ?? '' }));
      }
      return;
    }
  }
}

/** Insert one validated listening lesson and its mp3. A repeated hash is skipped. Oldest rows past the cap are deleted, with their files. */
export async function insertListeningBankItem(
  admin: SupabaseClient,
  lesson: ListeningLesson,
  audio: Uint8Array,
  cap: number,
): Promise<RefillInsertResult> {
  if (!canBankListeningLesson(lesson)) return 'invalid';
  const hash = listeningContentHash(lesson);
  const audioPath = listeningAudioPath(hash);
  const payload = listeningBankPayload(lesson);
  const dimensions = listeningDimensions(lesson, audioPath);
  if (!listeningLessonFromBankPayload(payload, dimensions, {
    level: lesson.level,
    format: lesson.format,
    topic: lesson.topicValue,
    wordCount: lesson.wordCount,
    questionCount: lesson.questionCount,
  })) return 'invalid';
  const uploaded = await uploadListeningAudio(admin, audioPath, audio);
  if (uploaded === 'unavailable') return 'unavailable';
  if (uploaded === 'error') return 'error';
  const inserted = await admin.from('exercise_bank').insert({
    kind: 'listening',
    level: lesson.level,
    exercise_type: lesson.format,
    dimensions,
    payload,
    content_hash: hash,
  }).select('id').maybeSingle();
  if (inserted.error) {
    if (inserted.error.code === '23505') return 'duplicate';
    if (uploaded === 'ok') await deleteListeningObjects(admin, [audioPath]);
    if (inserted.error.code === '23514') return 'invalid';
    if (bankUnavailable(inserted.error)) return 'unavailable';
    console.error(JSON.stringify({ exerciseBank: 'insert_failed', code: inserted.error.code ?? '' }));
    return 'error';
  }
  await trimListeningSlot(admin, {
    level: lesson.level,
    format: lesson.format,
    topic: lesson.topicValue,
    wordCount: lesson.wordCount,
    questionCount: lesson.questionCount,
  }, cap);
  return 'inserted';
}
