import type { SupabaseClient } from '@supabase/supabase-js';
import { buildListeningSsml, listeningProfileSpeed, synthesizeNeuralMp3 } from './azureSpeech.ts';
import { exerciseBankId, isBankId } from './exerciseBank.ts';
import {
  audioSlowPathFromDimensions,
  listeningAudioPathForRow,
  signListeningAudio,
  uploadListeningAudio,
} from './exerciseBankServer.ts';
import { savedListeningCachePath, savedListeningSpeech, storedSavedAudioPath } from './savedListeningAudio.ts';
import { readEnvValue, type EnvMap } from './taskMail.ts';

type AudioResult = {
  ok: boolean;
  audioUrl?: string;
  source?: 'bank' | 'cache' | 'azure';
  fallback?: 'browser';
  piece: Record<string, unknown> | null;
};

function asPiece(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function loadPiece(
  admin: SupabaseClient,
  userId: string,
  packId: string,
): Promise<Record<string, unknown> | null> {
  if (!isBankId(packId)) return null;
  const pack = await admin.from('task_packs').select('id').eq('id', packId).eq('user_id', userId).maybeSingle();
  if (pack.error || !pack.data) return null;
  const exercises = await admin
    .from('task_pack_exercises')
    .select('listening')
    .eq('pack_id', packId)
    .eq('user_id', userId)
    .maybeSingle();
  if (exercises.error) return null;
  return asPiece(exercises.data?.listening);
}

async function savePiece(
  admin: SupabaseClient,
  userId: string,
  packId: string,
  piece: Record<string, unknown>,
): Promise<void> {
  await admin.from('task_pack_exercises').update({ listening: piece }).eq('pack_id', packId).eq('user_id', userId);
}

async function speak(
  env: EnvMap,
  speech: NonNullable<ReturnType<typeof savedListeningSpeech>>,
  pace: { profileSpeed: number; slow: boolean },
): Promise<{ audio: Uint8Array; path: string } | null> {
  const built = buildListeningSsml(speech, pace);
  const audio = await synthesizeNeuralMp3({
    key: readEnvValue(env, 'AZURE_SPEECH_KEY'),
    region: readEnvValue(env, 'AZURE_SPEECH_REGION'),
    ssml: built.ssml,
    spokenCharacters: built.spokenCharacters,
  });
  if (!audio.ok) {
    console.log(JSON.stringify({
      stage: 'listening_browser_tts',
      reason: 'azure_failed',
      task: true,
      slow: pace.slow,
      status: audio.status,
      attempts: audio.attempts,
    }));
    return null;
  }
  return { audio: audio.audio, path: savedListeningCachePath(speech, pace) };
}

async function bankSlowUrl(
  admin: SupabaseClient,
  env: EnvMap,
  bankId: string,
): Promise<string | null> {
  const row = await admin.from('exercise_bank').select('kind, payload, dimensions').eq('id', bankId).maybeSingle();
  if (row.data?.kind !== 'listening') return null;
  const ready = audioSlowPathFromDimensions(row.data.dimensions);
  if (ready) return signListeningAudio(admin, ready);
  const payload = row.data.payload && typeof row.data.payload === 'object'
    ? row.data.payload as Record<string, unknown>
    : null;
  const speech = payload ? savedListeningSpeech(payload) : null;
  if (!speech) return null;
  const spoken = await speak(env, speech, { profileSpeed: 1, slow: true });
  if (!spoken) return null;
  const uploaded = await uploadListeningAudio(admin, spoken.path, spoken.audio);
  if (uploaded !== 'ok' && uploaded !== 'exists') return null;
  const dims = row.data.dimensions && typeof row.data.dimensions === 'object'
    ? row.data.dimensions as Record<string, unknown>
    : {};
  await admin.from('exercise_bank').update({ dimensions: { ...dims, audioSlowPath: spoken.path } }).eq('id', bankId);
  return signListeningAudio(admin, spoken.path);
}

/**
 * Azure mp3 for one task-pack listening exercise. A bank piece reuses the stored
 * file. A live piece is spoken once and the path is kept on the pack. This does
 * not spend a lesson. Browser speech is only for the caller when fallback is set.
 */
export async function storeTaskListeningAudio(
  admin: SupabaseClient,
  env: EnvMap,
  userId: string,
  packId: string,
  options: { speed?: unknown; slow?: boolean },
): Promise<AudioResult> {
  const piece = await loadPiece(admin, userId, packId);
  if (!piece) return { ok: false, fallback: 'browser', piece: null };
  const slow = options.slow === true;
  const profileSpeed = listeningProfileSpeed(options.speed);
  const bankId = exerciseBankId(piece) ?? '';
  if (isBankId(bankId)) {
    const audioUrl = slow
      ? await bankSlowUrl(admin, env, bankId)
      : await (async () => {
        const path = await listeningAudioPathForRow(admin, bankId);
        return path ? signListeningAudio(admin, path) : null;
      })();
    if (audioUrl) {
      console.log(JSON.stringify({ stage: slow ? 'task_listening_bank_slow' : 'task_listening_bank', packId, bankId }));
      return { ok: true, audioUrl, source: 'bank', piece };
    }
  }

  const speech = savedListeningSpeech(piece);
  if (!speech) {
    const skipped = { ...piece, audioAttempted: true };
    await savePiece(admin, userId, packId, skipped);
    console.log(JSON.stringify({ stage: 'listening_browser_tts', reason: 'no_story', task: true, packId }));
    return { ok: false, fallback: 'browser', piece: skipped };
  }
  const pace = { profileSpeed, slow };
  const cached = storedSavedAudioPath(piece, speech, pace);
  if (cached) {
    const audioUrl = await signListeningAudio(admin, cached);
    if (audioUrl) {
      console.log(JSON.stringify({ stage: 'task_listening_cache', packId, slow }));
      return { ok: true, audioUrl, source: 'cache', piece };
    }
  }
  const spoken = await speak(env, speech, pace);
  if (!spoken) {
    const skipped = slow ? piece : { ...piece, audioAttempted: true };
    if (!slow) await savePiece(admin, userId, packId, skipped);
    return { ok: false, fallback: 'browser', piece: skipped };
  }
  const uploaded = await uploadListeningAudio(admin, spoken.path, spoken.audio);
  if (uploaded !== 'ok' && uploaded !== 'exists') {
    const skipped = slow ? piece : { ...piece, audioAttempted: true };
    if (!slow) await savePiece(admin, userId, packId, skipped);
    console.log(JSON.stringify({ stage: 'listening_browser_tts', reason: 'audio_store_failed', task: true, packId, uploaded }));
    return { ok: false, fallback: 'browser', piece: skipped };
  }
  const next = { ...piece, ...(slow ? { audioSlowPath: spoken.path } : { audioPath: spoken.path }) };
  await savePiece(admin, userId, packId, next);
  const audioUrl = await signListeningAudio(admin, spoken.path);
  if (!audioUrl) {
    console.log(JSON.stringify({ stage: 'listening_browser_tts', reason: 'sign_failed', task: true, packId }));
    return { ok: false, fallback: 'browser', piece: next };
  }
  console.log(JSON.stringify({ stage: slow ? 'task_listening_slow' : 'task_listening_azure', packId, source: 'azure' }));
  return { ok: true, audioUrl, source: 'azure', piece: next };
}
