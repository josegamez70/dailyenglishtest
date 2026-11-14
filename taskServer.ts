import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveTopic } from './constants.ts';
import { pickDialogueSpeakers } from './dialogue.ts';
import { produceGrammar, producePractice, type LessonParams } from './api/generate.ts';
import {
  exerciseBankId,
  grammarUsesBank,
  isListeningLevel,
  listeningBankQuery,
} from './exerciseBank.ts';
import { claimGrammarFromBank, claimListeningFromBank, releaseGrammarBankItem } from './exerciseBankServer.ts';
import { readEnvValue, runtimeEnv, secretMatches, sendTaskReminder, type EnvMap } from './taskMail.ts';
import { storeTaskListeningAudio } from './taskListeningAudio.ts';
import {
  isGrammarPiece,
  isPracticePiece,
  nextTaskStep,
  issuedPackCount,
  periodKey,
  settingsFromRow,
  taskBlockMessage,
  taskGenerationDecision,
  taskLevelLabel,
  type GrammarPiece,
  type PracticePiece,
  type TaskBlockReason,
  type TaskSettings,
  type TaskStep,
} from './tasks.ts';

const FREE_LESSON_LIMIT = 3;

export type AdvanceResult = {
  ok: boolean;
  missing?: boolean;
  busy?: boolean;
  blocked?: TaskBlockReason;
  step?: TaskStep;
  message?: string;
  packId?: string;
};

type PackState = {
  id: string;
  status: string;
  charged: boolean;
  emailedAt: string | null;
  blockReason: string;
  reading: unknown;
  listening: unknown;
  grammar: unknown;
};

function adminClient(): SupabaseClient | null {
  const env = runtimeEnv();
  const url = readEnvValue(env, 'SUPABASE_URL');
  const key = readEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function pickApiKey(env: EnvMap): string {
  return (
    readEnvValue(env, 'API_KEY')
    || readEnvValue(env, 'GOOGLE_API_KEY')
    || readEnvValue(env, 'VITE_API_KEY')
    || readEnvValue(env, 'GENAI_API_KEY')
  );
}

function isMissing(error: { code?: string; message?: string } | null): boolean {
  const message = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return message.includes('42p01') || message.includes('pgrst') || message.includes('does not exist') || message.includes('schema cache');
}

function isConflict(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

function readAllowance(data: unknown): { allowed: boolean; reason: string } | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  if (typeof record.allowed !== 'boolean') return null;
  return { allowed: record.allowed, reason: typeof record.reason === 'string' ? record.reason : '' };
}

async function blockReason(admin: SupabaseClient, userId: string): Promise<string | null> {
  const gate = await admin.rpc('lesson_block_reason', { uid: userId, free_limit: FREE_LESSON_LIMIT });
  if (gate.error) return null;
  return typeof gate.data === 'string' ? gate.data : null;
}

function asPiece(value: unknown): PracticePiece | null {
  return isPracticePiece(value) ? value : null;
}

function practiceParams(
  settings: TaskSettings,
  mode: 'reading' | 'listening',
  stage: 'story' | 'quiz',
  existing: PracticePiece | null,
): LessonParams {
  const format = mode === 'reading' ? settings.readingFormat : settings.listeningFormat;
  const resolved = existing
    ? { label: existing.topic, surprise: false }
    : resolveTopic(settings.topic);
  const storedSpeakers = existing && Array.isArray(existing.speakers) ? existing.speakers : [];
  const speakers = storedSpeakers.length > 0
    ? storedSpeakers
    : format === 'dialogue'
      ? pickDialogueSpeakers()
      : [];
  return {
    level: taskLevelLabel(existing?.level || settings.level),
    topic: resolved.label,
    surprise: resolved.surprise,
    wordCount: existing?.wordCount || settings.wordCount,
    questionCount: existing?.questionCount || settings.questionCount,
    vocabularyCount: 8,
    mode,
    format: existing?.format || format,
    speakers,
    stage,
    sourceStory: stage === 'quiz' ? existing?.story ?? '' : '',
  };
}

function storyPiece(settings: TaskSettings, params: LessonParams, lesson: { story: string; vocabulary: unknown[]; dialogue: unknown[] }): PracticePiece {
  return {
    story: lesson.story,
    quiz: [],
    vocabulary: lesson.vocabulary,
    dialogue: lesson.dialogue,
    format: params.format,
    level: settings.level,
    levelLabel: taskLevelLabel(settings.level),
    topic: params.topic,
    title: params.topic,
    speakers: params.speakers,
    wordCount: settings.wordCount,
    questionCount: settings.questionCount,
  };
}

async function loadPack(admin: SupabaseClient, userId: string, key: string, slot = 1): Promise<PackState | null> {
  const pack = await admin
    .from('task_packs')
    .select('id, status, charged, emailed_at, block_reason, pack_slot')
    .eq('user_id', userId)
    .eq('period_key', key)
    .eq('pack_slot', slot)
    .maybeSingle();
  if (pack.error || !pack.data) return null;
  const exercises = await admin
    .from('task_pack_exercises')
    .select('reading, listening, grammar')
    .eq('pack_id', pack.data.id)
    .maybeSingle();
  return {
    id: String(pack.data.id),
    status: String(pack.data.status ?? 'generating'),
    charged: pack.data.charged === true,
    emailedAt: pack.data.emailed_at ? String(pack.data.emailed_at) : null,
    blockReason: typeof pack.data.block_reason === 'string' ? pack.data.block_reason : '',
    reading: exercises.data?.reading ?? null,
    listening: exercises.data?.listening ?? null,
    grammar: exercises.data?.grammar ?? null,
  };
}

async function saveExercises(admin: SupabaseClient, pack: PackState, userId: string): Promise<boolean> {
  const saved = await admin.from('task_pack_exercises').upsert({
    pack_id: pack.id,
    user_id: userId,
    reading: pack.reading ?? {},
    listening: pack.listening ?? {},
    grammar: pack.grammar ?? {},
  }, { onConflict: 'pack_id' });
  return !saved.error;
}

async function grabLock(admin: SupabaseClient, packId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const until = new Date(Date.now() + 70_000).toISOString();
  const locked = await admin
    .from('task_packs')
    .update({ locked_until: until })
    .eq('id', packId)
    .or(`locked_until.is.null,locked_until.lt."${now}"`)
    .select('id');
  return !locked.error && (locked.data?.length ?? 0) > 0;
}

async function releaseLock(admin: SupabaseClient, packId: string): Promise<void> {
  await admin.from('task_packs').update({ locked_until: null }).eq('id', packId);
}

async function ensureToken(admin: SupabaseClient, userId: string): Promise<string | null> {
  const existing = await admin.from('task_email_tokens').select('token').eq('user_id', userId).maybeSingle();
  if (typeof existing.data?.token === 'string' && existing.data.token) return existing.data.token;
  const token = randomBytes(32).toString('hex');
  const inserted = await admin.from('task_email_tokens').insert({ user_id: userId, token }).select('token').maybeSingle();
  if (typeof inserted.data?.token === 'string') return inserted.data.token;
  const again = await admin.from('task_email_tokens').select('token').eq('user_id', userId).maybeSingle();
  return typeof again.data?.token === 'string' ? again.data.token : null;
}

async function listPeriodPacks(admin: SupabaseClient, userId: string, key: string): Promise<{ id: string; slot: number; status: string; emailedAt: string | null }[]> {
  const rows = await admin
    .from('task_packs')
    .select('id, pack_slot, status, emailed_at')
    .eq('user_id', userId)
    .eq('period_key', key);
  if (rows.error || !rows.data) return [];
  return rows.data.map((row) => ({
    id: String(row.id),
    slot: Number(row.pack_slot ?? 1),
    status: String(row.status ?? 'generating'),
    emailedAt: row.emailed_at ? String(row.emailed_at) : null,
  }));
}

/** One message for the day, after every requested pack is ready or blocked. */
async function maybeEmailDay(
  admin: SupabaseClient,
  userId: string,
  settings: TaskSettings,
  key: string,
): Promise<void> {
  const packs = await listPeriodPacks(admin, userId, key);
  const wanted = issuedPackCount(settings);
  const ready = packs.filter((pack) => pack.status === 'ready');
  const open = packs.filter((pack) => pack.status !== 'ready' && pack.status !== 'blocked');
  if (packs.length < wanted || open.length || !ready.length || ready.some((pack) => pack.emailedAt)) return;
  if (!settings.emailReminders) return;
  const token = await ensureToken(admin, userId);
  if (!token) return;
  const user = await admin.auth.admin.getUserById(userId);
  const to = user.data.user?.email ?? '';
  const sent = await sendTaskReminder(runtimeEnv(), {
    to,
    token,
    frequency: settings.frequency,
    periodKey: key,
    packCount: ready.length,
  });
  if (!sent.sent) return;
  await admin
    .from('task_packs')
    .update({ emailed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('period_key', key)
    .eq('status', 'ready')
    .is('emailed_at', null);
}

async function withhold(admin: SupabaseClient, pack: PackState, reason: TaskBlockReason, userId: string): Promise<AdvanceResult> {
  const grammarId = exerciseBankId(pack.grammar);
  const listeningId = exerciseBankId(pack.listening);
  await admin.from('task_pack_exercises').delete().eq('pack_id', pack.id);
  if (grammarId) await releaseGrammarBankItem(admin, userId, grammarId);
  if (listeningId && listeningId !== grammarId) await releaseGrammarBankItem(admin, userId, listeningId);
  await admin.from('task_packs').update({
    status: 'blocked',
    block_reason: reason,
    charged: false,
    locked_until: null,
  }).eq('id', pack.id);
  return { ok: false, blocked: reason, message: taskBlockMessage(reason), packId: pack.id, step: 'done' };
}

async function settlePack(
  admin: SupabaseClient,
  userId: string,
  pack: PackState,
  settings: TaskSettings,
  key: string,
): Promise<AdvanceResult> {
  if (!pack.charged) {
    const reason = await blockReason(admin, userId);
    if (!reason) return { ok: false, message: 'Tasks could not be checked. Please try again.', packId: pack.id };
    const decision = taskGenerationDecision(reason);
    if (!decision.generate) {
      const blocked = decision.reason === 'ok' ? 'free_limit' : decision.reason;
      return withhold(admin, pack, blocked, userId);
    }
    if (decision.consumeLessons === 1) {
      const consumed = await admin.rpc('consume_lesson', { uid: userId, free_limit: FREE_LESSON_LIMIT });
      const allowance = readAllowance(consumed.data);
      if (consumed.error || !allowance?.allowed) {
        const blocked = allowance?.reason === 'pilot_expired' ? 'pilot_expired' : 'free_limit';
        return withhold(admin, pack, blocked, userId);
      }
    }
    const marked = await admin.from('task_packs').update({ status: 'ready', charged: true, block_reason: '' }).eq('id', pack.id);
    if (marked.error) return { ok: false, message: 'The task pack could not be saved. Please try again.', packId: pack.id };
    pack.charged = true;
  } else if (pack.status !== 'ready') {
    await admin.from('task_packs').update({ status: 'ready', block_reason: '' }).eq('id', pack.id);
  }
  pack.status = 'ready';
  await maybeEmailDay(admin, userId, settings, key);
  return { ok: true, step: 'done', packId: pack.id };
}

/** Bank first when the grammar topic is empty. A typed topic, or an empty unseen pool, stays on Gemini. */
async function grammarPieceForPack(
  admin: SupabaseClient,
  userId: string,
  request: { level: TaskSettings['grammarLevel']; exercise: TaskSettings['grammarExercise']; topic: string },
  apiKey: string,
  deadline: number,
): Promise<{ piece: GrammarPiece; bankId: string | null } | null> {
  if (grammarUsesBank(request.topic)) {
    const claimed = await claimGrammarFromBank(admin, userId, request);
    if (claimed) {
      const piece: GrammarPiece = {
        level: claimed.set.level,
        exercise: claimed.set.exercise,
        topic: claimed.set.topic,
        title: claimed.set.title,
        items: claimed.set.items,
        bankId: claimed.id,
      };
      if (isGrammarPiece(piece)) return { piece, bankId: claimed.id };
      await releaseGrammarBankItem(admin, userId, claimed.id);
    }
  }
  if (!apiKey) return null;
  const produced = await produceGrammar(apiKey, request, deadline);
  if (!produced.ok) return null;
  const piece: GrammarPiece = {
    level: produced.set.level,
    exercise: produced.set.exercise,
    topic: produced.set.topic,
    title: produced.set.title,
    items: produced.set.items,
  };
  if (!isGrammarPiece(piece)) return null;
  return { piece, bankId: null };
}

/** Bank first when the listening topic is a list topic. A custom topic is not stored on tasks. */
async function listeningPieceFromBank(
  admin: SupabaseClient,
  userId: string,
  settings: TaskSettings,
): Promise<{ piece: PracticePiece; bankId: string } | null> {
  const choice = listeningBankQuery({ customTopic: '', topic: settings.topic });
  const level = taskLevelLabel(settings.level);
  if (!choice.bank || !isListeningLevel(level)) return null;
  const claimed = await claimListeningFromBank(admin, userId, {
    level,
    format: settings.listeningFormat,
    topic: choice.topic,
    wordCount: settings.wordCount,
    questionCount: settings.questionCount,
  });
  if (!claimed) return null;
  const piece: PracticePiece = {
    story: claimed.lesson.story,
    quiz: claimed.lesson.quiz,
    vocabulary: claimed.lesson.vocabulary,
    dialogue: claimed.lesson.dialogue,
    format: claimed.lesson.format,
    level: settings.level,
    levelLabel: level,
    topic: claimed.lesson.topicLabel,
    title: claimed.lesson.title,
    speakers: claimed.lesson.speakers,
    wordCount: settings.wordCount,
    questionCount: settings.questionCount,
    bankId: claimed.id,
  };
  if (!isPracticePiece(piece) || !practiceHasQuiz(piece)) {
    await releaseGrammarBankItem(admin, userId, claimed.id);
    return null;
  }
  return { piece, bankId: claimed.id };
}

async function insertPack(admin: SupabaseClient, userId: string, key: string, settings: TaskSettings, slot: number): Promise<PackState | null> {
  const inserted = await admin.from('task_packs').insert({
    user_id: userId,
    period_key: key,
    pack_slot: slot,
    frequency: settings.frequency,
    status: 'generating',
    charged: false,
  }).select('id').maybeSingle();
  if (inserted.error && !isConflict(inserted.error)) return null;
  return loadPack(admin, userId, key, slot);
}

/** Create the next missing piece of this period's pack, or finish it. One model step. */
export async function advanceTaskPack(userId: string, options?: { deadlineMs?: number }): Promise<AdvanceResult> {
  const admin = adminClient();
  if (!admin) return { ok: false, message: 'Tasks are not available yet.' };
  const settingsRow = await admin.from('task_settings').select('*').eq('user_id', userId).maybeSingle();
  if (settingsRow.error) {
    if (isMissing(settingsRow.error)) {
      return { ok: false, missing: true, message: 'Tasks will be ready after the database update.' };
    }
    return { ok: false, message: 'Tasks could not be loaded.' };
  }
  if (!settingsRow.data) return { ok: true, step: 'done', message: 'Tasks are off.' };
  const settings = settingsFromRow(settingsRow.data);
  if (!settings.enabled) return { ok: true, step: 'done', message: 'Tasks are off.' };
  const key = periodKey(settings.frequency);
  const wanted = issuedPackCount(settings);
  const existing = await listPeriodPacks(admin, userId, key);
  let slot = 0;
  for (let index = 1; index <= wanted; index += 1) {
    const found = existing.find((pack) => pack.slot === index);
    if (!found || (found.status !== 'ready' && found.status !== 'blocked')) {
      slot = index;
      break;
    }
  }
  if (!slot) {
    await maybeEmailDay(admin, userId, settings, key);
    const blocked = existing.find((pack) => pack.status === 'blocked');
    if (blocked && !existing.some((pack) => pack.status === 'ready')) {
      const reason: TaskBlockReason = 'free_limit';
      return { ok: false, blocked: reason, message: taskBlockMessage(reason), packId: blocked.id, step: 'done' };
    }
    return { ok: true, step: 'done', packId: existing[0]?.id };
  }
  let pack = await loadPack(admin, userId, key, slot);
  if (pack?.status === 'blocked') {
    const reason: TaskBlockReason = pack.blockReason === 'pilot_expired' || pack.blockReason === 'missing'
      ? pack.blockReason
      : 'free_limit';
    return { ok: false, blocked: reason, message: taskBlockMessage(reason), packId: pack.id, step: 'done' };
  }
  if (!pack) {
    const reason = await blockReason(admin, userId);
    if (!reason) return { ok: false, message: 'Tasks could not be checked. Please try again.' };
    const decision = taskGenerationDecision(reason);
    if (!decision.generate) {
      const blocked = decision.reason === 'ok' ? 'free_limit' : decision.reason;
      return { ok: false, blocked, message: taskBlockMessage(blocked) };
    }
    pack = await insertPack(admin, userId, key, settings, slot);
    if (!pack) return { ok: false, message: 'The task pack could not be saved. Please try again.' };
  }
  if (pack.status === 'ready') return { ok: true, step: 'done', packId: pack.id };
  const current = pack;
  const locked = await grabLock(admin, current.id);
  if (!locked) return { ok: true, busy: true, step: nextTaskStep(current), packId: current.id };
  try {
    const step = nextTaskStep(current);
    if (step === 'done') return await settlePack(admin, userId, current, settings, key);
    const apiKey = pickApiKey(runtimeEnv());
    const deadline = Date.now() + (options?.deadlineMs ?? 20000);
    let claimedBankId: string | null = null;
    if (step === 'grammar') {
      const built = await grammarPieceForPack(admin, userId, {
        level: settings.grammarLevel,
        exercise: settings.grammarExercise,
        topic: settings.grammarTopic,
      }, apiKey, deadline);
      if (!built) {
        return {
          ok: false,
          message: apiKey
            ? 'The grammar exercises could not be created. Please try again.'
            : 'Tasks are not available yet.',
          packId: current.id,
          step,
        };
      }
      claimedBankId = built.bankId;
      current.grammar = built.piece;
    } else if (step === 'listening-story') {
      const banked = await listeningPieceFromBank(admin, userId, settings);
      if (banked) {
        claimedBankId = banked.bankId;
        current.listening = banked.piece;
      } else if (!apiKey) {
        return { ok: false, message: 'Tasks are not available yet.', packId: current.id, step };
      } else {
        const params = practiceParams(settings, 'listening', 'story', null);
        const produced = await producePractice(apiKey, params, deadline);
        if (!produced.ok) {
          return {
            ok: false,
            message: 'The listening text could not be created. Please try again.',
            packId: current.id,
            step,
          };
        }
        current.listening = storyPiece(settings, params, produced.lesson);
      }
    } else if (step === 'listening-audio') {
      const stored = await storeTaskListeningAudio(admin, runtimeEnv(), userId, current.id, { speed: 1, slow: false });
      if (stored.piece) current.listening = stored.piece;
      else {
        const existing = asPiece(current.listening);
        if (existing) current.listening = { ...existing, audioAttempted: true };
      }
    } else if (!apiKey) {
      return { ok: false, message: 'Tasks are not available yet.', packId: current.id };
    } else {
      const mode = step.startsWith('reading') ? 'reading' : 'listening';
      const stage = step.endsWith('story') ? 'story' : 'quiz';
      const existing = asPiece(mode === 'reading' ? current.reading : current.listening);
      if (stage === 'quiz' && !existing) {
        return { ok: false, message: 'The exercise could not be continued. Please try again.', packId: current.id, step };
      }
      const params = practiceParams(settings, mode, stage, stage === 'quiz' ? existing : null);
      const produced = await producePractice(apiKey, params, deadline);
      if (!produced.ok) {
        const label = mode === 'reading' ? 'reading' : 'listening';
        return {
          ok: false,
          message: stage === 'quiz'
            ? `The ${label} questions could not be created. Please try again.`
            : `The ${label} text could not be created. Please try again.`,
          packId: current.id,
          step,
        };
      }
      const piece = stage === 'story'
        ? storyPiece(settings, params, produced.lesson)
        : { ...(existing as PracticePiece), quiz: produced.lesson.quiz };
      if (mode === 'reading') current.reading = piece;
      else current.listening = piece;
    }
    const saved = await saveExercises(admin, current, userId);
    if (!saved) {
      if (claimedBankId) await releaseGrammarBankItem(admin, userId, claimedBankId);
      return { ok: false, message: 'The task pack could not be saved. Please try again.', packId: current.id };
    }
    if (nextTaskStep(current) === 'done') return await settlePack(admin, userId, current, settings, key);
    return { ok: true, step: nextTaskStep(current), packId: current.id };
  } finally {
    await releaseLock(admin, current.id);
  }
}

/** Finish one user's current pack. Used by the scheduled job, which has more time than a page request. */
export async function completeTaskPack(userId: string): Promise<AdvanceResult> {
  let latest: AdvanceResult = { ok: false, message: 'The task pack could not be created.' };
  for (let attempt = 0; attempt < 24; attempt += 1) {
    latest = await advanceTaskPack(userId, { deadlineMs: 40000 });
    if (latest.busy) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }
    if (!latest.ok || latest.step === 'done' || latest.blocked) return latest;
  }
  return latest;
}

export async function generateDuePacks(limit = 3): Promise<{ worked: number; remaining: boolean }> {
  const admin = adminClient();
  if (!admin) return { worked: 0, remaining: false };
  const settings = await admin.from('task_settings').select('*').eq('enabled', true);
  if (settings.error || !settings.data) return { worked: 0, remaining: false };
  const due: string[] = [];
  for (const row of settings.data) {
    const userId = String(row.user_id ?? '');
    if (!userId) continue;
    const parsed = settingsFromRow(row as Record<string, unknown>);
    if (!parsed.enabled) continue;
    const key = periodKey(parsed.frequency);
    const pack = await admin
      .from('task_packs')
      .select('status, emailed_at, pack_slot')
      .eq('user_id', userId)
      .eq('period_key', key);
    if (pack.error) continue;
    const rows = pack.data ?? [];
    const wanted = issuedPackCount(parsed);
    let needsWork = false;
    for (let slot = 1; slot <= wanted; slot += 1) {
      const found = rows.find((row) => Number(row.pack_slot ?? 1) === slot);
      const status = String(found?.status ?? '');
      if (!found || (status !== 'ready' && status !== 'blocked')) needsWork = true;
    }
    const readyUnsent = rows.some((row) => String(row.status) === 'ready' && !row.emailed_at);
    const finished = rows.filter((row) => String(row.status) === 'ready' || String(row.status) === 'blocked').length >= wanted && !needsWork;
    if (!needsWork && !(finished && readyUnsent && parsed.emailReminders)) continue;
    due.push(userId);
  }
  let worked = 0;
  for (const userId of due.slice(0, limit)) {
    await completeTaskPack(userId);
    worked += 1;
  }
  return { worked, remaining: due.length > limit };
}

export function jobSecretOk(header: string | null | undefined, env: EnvMap = runtimeEnv()): boolean {
  return secretMatches(header, env);
}

export async function turnOffTasks(token: string): Promise<'ok' | 'invalid' | 'unavailable'> {
  const admin = adminClient();
  if (!admin) return 'unavailable';
  const clean = token.trim();
  if (!/^[a-f0-9]{32,64}$/i.test(clean)) return 'invalid';
  const found = await admin.from('task_email_tokens').select('user_id').eq('token', clean).maybeSingle();
  if (found.error) return isMissing(found.error) ? 'unavailable' : 'invalid';
  if (!found.data?.user_id) return 'invalid';
  const updated = await admin
    .from('task_settings')
    .update({ enabled: false, email_reminders: false })
    .eq('user_id', found.data.user_id);
  if (updated.error) return 'unavailable';
  return 'ok';
}
