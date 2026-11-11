import { createClient } from '@supabase/supabase-js';
import { buildListeningSsml, listeningProfileSpeed, synthesizeNeuralMp3 } from '../azureSpeech.ts';
import { isBankId } from '../exerciseBank.ts';
import {
  audioSlowPathFromDimensions,
  signListeningAudio,
  uploadListeningAudio,
  userWasServedBankItem,
} from '../exerciseBankServer.ts';
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

async function speakSlow(
  env: Record<string, string>,
  speech: NonNullable<ReturnType<typeof savedListeningSpeech>>,
  profileSpeed: number,
): Promise<{ audio: Uint8Array; path: string; spokenCharacters: number } | null> {
  const built = buildListeningSsml(speech, { slow: true, profileSpeed });
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
      slow: true,
      status: audio.status,
      attempts: audio.attempts,
    }));
    return null;
  }
  return {
    audio: audio.audio,
    path: savedListeningCachePath(speech, { slow: true, profileSpeed }),
    spokenCharacters: audio.spokenCharacters,
  };
}

/**
 * A slower Azure mp3, spoken at 75% with SSML prosody. The player plays it at
 * normal playbackRate. A bank lesson reuses or stores the shared slow file.
 * A saved lesson caches its own. A live lesson is returned once and kept by the page.
 */
export const handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: 'Method not allowed' });
  const token = bearer(event);
  if (!token) return json(401, { ok: false, error: 'auth_required' });
  let body: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(event.body || '{}') as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') body = parsed;
  } catch {
    body = {};
  }
  const env = runtimeEnv();
  const url = readEnvValue(env, 'SUPABASE_URL');
  const key = readEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json(200, { ok: false, fallback: 'browser' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const userResult = await admin.auth.getUser(token);
  const userId = userResult.data.user?.id;
  if (userResult.error || !userId) return json(401, { ok: false, error: 'auth_required' });
  const speed = listeningProfileSpeed(body.speed);
  const bankId = typeof body.bankId === 'string' ? body.bankId : '';
  const savedLessonId = typeof body.savedLessonId === 'string' ? body.savedLessonId : '';

  if (isBankId(bankId) && await userWasServedBankItem(admin, userId, bankId)) {
    const row = await admin.from('exercise_bank').select('kind, payload, dimensions').eq('id', bankId).maybeSingle();
    const dimensions = row.data?.dimensions;
    const ready = audioSlowPathFromDimensions(dimensions);
    if (ready) {
      const audioUrl = await signListeningAudio(admin, ready);
      if (audioUrl) return json(200, { ok: true, audioUrl, source: 'bank' });
    }
    const payload = row.data?.payload && typeof row.data.payload === 'object'
      ? row.data.payload as Record<string, unknown>
      : null;
    const speech = payload ? savedListeningSpeech(payload) : null;
    if (row.data?.kind === 'listening' && speech) {
      const spoken = await speakSlow(env, speech, 1);
      if (!spoken) return json(200, { ok: false, fallback: 'browser' });
      const uploaded = await uploadListeningAudio(admin, spoken.path, spoken.audio);
      if (uploaded !== 'ok' && uploaded !== 'exists') return json(200, { ok: false, fallback: 'browser' });
      const dims = dimensions && typeof dimensions === 'object' ? dimensions as Record<string, unknown> : {};
      await admin.from('exercise_bank').update({ dimensions: { ...dims, audioSlowPath: spoken.path } }).eq('id', bankId);
      const audioUrl = await signListeningAudio(admin, spoken.path);
      if (!audioUrl) return json(200, { ok: false, fallback: 'browser' });
      console.log(JSON.stringify({ stage: 'listening_slow_bank', bankId, spokenCharacters: spoken.spokenCharacters }));
      return json(200, { ok: true, audioUrl, source: 'bank' });
    }
  }

  if (isBankId(savedLessonId)) {
    const row = await admin.from('saved_lessons').select('lesson').eq('id', savedLessonId).eq('user_id', userId).maybeSingle();
    const lesson = row.data?.lesson && typeof row.data.lesson === 'object'
      ? row.data.lesson as Record<string, unknown>
      : null;
    if (!lesson || lesson.mode !== 'listening') return json(404, { ok: false, fallback: 'browser' });
    const speech = savedListeningSpeech(lesson);
    if (!speech) return json(200, { ok: false, fallback: 'browser' });
    const pace = { slow: true, profileSpeed: speed };
    const cached = storedSavedAudioPath(lesson, speech, pace);
    if (cached) {
      const audioUrl = await signListeningAudio(admin, cached);
      if (audioUrl) return json(200, { ok: true, audioUrl, source: 'cache' });
    }
    const spoken = await speakSlow(env, speech, speed);
    if (!spoken) return json(200, { ok: false, fallback: 'browser' });
    const uploaded = await uploadListeningAudio(admin, spoken.path, spoken.audio);
    if (uploaded !== 'ok' && uploaded !== 'exists') return json(200, { ok: false, fallback: 'browser' });
    await admin.from('saved_lessons').update({
      lesson: { ...lesson, audioSlowPath: spoken.path },
    }).eq('id', savedLessonId).eq('user_id', userId);
    const audioUrl = await signListeningAudio(admin, spoken.path);
    if (!audioUrl) return json(200, { ok: false, fallback: 'browser' });
    console.log(JSON.stringify({ stage: 'listening_slow_saved', savedLessonId, spokenCharacters: spoken.spokenCharacters }));
    return json(200, { ok: true, audioUrl, source: 'saved' });
  }

  const speech = savedListeningSpeech({
    format: body.format,
    story: String(body.story ?? '').slice(0, 6000),
    dialogue: body.dialogue,
  });
  if (!speech) return json(400, { ok: false, fallback: 'browser' });
  const spoken = await speakSlow(env, speech, speed);
  if (!spoken) return json(200, { ok: false, fallback: 'browser' });
  console.log(JSON.stringify({ stage: 'listening_slow_live', spokenCharacters: spoken.spokenCharacters }));
  return json(200, { ok: true, audioBase64: Buffer.from(spoken.audio).toString('base64'), source: 'live' });
};
