import { createClient } from '@supabase/supabase-js';
import { buildListeningSsml, synthesizeNeuralMp3 } from '../azureSpeech.ts';
import { isBankId } from '../exerciseBank.ts';
import { listeningAudioPathForRow, signListeningAudio, uploadListeningAudio, userWasServedBankItem } from '../exerciseBankServer.ts';
import { savedListeningCachePath, savedListeningSpeech, storedSavedAudioPath } from '../savedListeningAudio.ts';
import { readEnvValue, runtimeEnv } from '../taskMail.ts';

type HandlerEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined> | null;
};

function json(status: number, body: unknown) {
  return {
    statusCode: status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function bearer(event: HandlerEvent): string | null {
  const headers = event.headers ?? {};
  const raw = headers.authorization || headers.Authorization || '';
  const match = String(raw).match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? null;
}

/**
 * Azure audio for a saved listening lesson. A bank lesson reuses its stored mp3.
 * Anything else is spoken once and kept in the private bucket. This does not spend a lesson.
 * Browser speech is only for the caller when this returns fallback: 'browser'.
 */
export const handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: 'Method not allowed' });
  const token = bearer(event);
  if (!token) return json(401, { ok: false, error: 'auth_required' });
  let savedLessonId = '';
  try {
    const body = JSON.parse(event.body || '{}') as { savedLessonId?: unknown };
    savedLessonId = typeof body.savedLessonId === 'string' ? body.savedLessonId : '';
  } catch {
    savedLessonId = '';
  }
  if (!isBankId(savedLessonId)) return json(400, { ok: false, message: 'Missing lesson.' });
  const env = runtimeEnv();
  const url = readEnvValue(env, 'SUPABASE_URL');
  const key = readEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json(500, { ok: false, fallback: 'browser', message: 'Audio is not available yet.' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const userResult = await admin.auth.getUser(token);
  const userId = userResult.data.user?.id;
  if (userResult.error || !userId) return json(401, { ok: false, error: 'auth_required' });
  const row = await admin
    .from('saved_lessons')
    .select('id, lesson')
    .eq('id', savedLessonId)
    .eq('user_id', userId)
    .maybeSingle();
  if (row.error || !row.data) return json(404, { ok: false, message: 'That lesson is not available.' });
  const lesson = row.data.lesson && typeof row.data.lesson === 'object'
    ? row.data.lesson as Record<string, unknown>
    : null;
  if (!lesson || lesson.mode !== 'listening') return json(400, { ok: false, message: 'That lesson is not a listening lesson.' });

  const bankId = typeof lesson.bankId === 'string' ? lesson.bankId : '';
  if (isBankId(bankId) && await userWasServedBankItem(admin, userId, bankId)) {
    const bankPath = await listeningAudioPathForRow(admin, bankId);
    const bankUrl = bankPath ? await signListeningAudio(admin, bankPath) : null;
    if (bankUrl) {
      console.log(JSON.stringify({ stage: 'saved_listening_bank', savedLessonId }));
      return json(200, { ok: true, audioUrl: bankUrl, source: 'bank' });
    }
    console.log(JSON.stringify({ stage: 'saved_listening_bank_miss', savedLessonId }));
  }

  const speech = savedListeningSpeech(lesson);
  if (!speech) {
    console.log(JSON.stringify({ stage: 'listening_browser_tts', reason: 'no_story', savedLessonId }));
    return json(200, { ok: false, fallback: 'browser' });
  }
  const cached = storedSavedAudioPath(lesson, speech);
  if (cached) {
    const audioUrl = await signListeningAudio(admin, cached);
    if (audioUrl) {
      console.log(JSON.stringify({ stage: 'saved_listening_cache', savedLessonId }));
      return json(200, { ok: true, audioUrl, source: 'cache' });
    }
  }

  const built = buildListeningSsml(speech);
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
      savedLessonId,
      status: audio.status,
      attempts: audio.attempts,
    }));
    return json(200, { ok: false, fallback: 'browser' });
  }
  const audioPath = savedListeningCachePath(speech);
  const uploaded = await uploadListeningAudio(admin, audioPath, audio.audio);
  if (uploaded !== 'ok' && uploaded !== 'exists') {
    console.log(JSON.stringify({ stage: 'listening_browser_tts', reason: 'audio_store_failed', savedLessonId, uploaded }));
    return json(200, { ok: false, fallback: 'browser' });
  }
  const nextLesson = { ...lesson, audioPath };
  const saved = await admin.from('saved_lessons').update({ lesson: nextLesson }).eq('id', savedLessonId).eq('user_id', userId);
  if (saved.error) {
    console.log(JSON.stringify({ stage: 'saved_listening_cache_write_failed', savedLessonId }));
  }
  const audioUrl = await signListeningAudio(admin, audioPath);
  if (!audioUrl) {
    console.log(JSON.stringify({ stage: 'listening_browser_tts', reason: 'sign_failed', savedLessonId }));
    return json(200, { ok: false, fallback: 'browser' });
  }
  console.log(JSON.stringify({
    stage: 'saved_listening_azure',
    savedLessonId,
    spokenCharacters: audio.spokenCharacters,
    attempts: audio.attempts,
  }));
  return json(200, { ok: true, audioUrl, source: 'azure' });
};
