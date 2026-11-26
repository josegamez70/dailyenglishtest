import { createClient } from '@supabase/supabase-js';
import { isBankId, isListeningAudioPath } from '../exerciseBank.ts';
import { listeningAudioPathForRow, signListeningAudio } from '../exerciseBankServer.ts';
import { readEnvValue, runtimeEnv } from '../taskMail.ts';

type HandlerEvent = {
  httpMethod?: string;
  body?: string | null;
};

function json(status: number, body: unknown) {
  return {
    statusCode: status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

/**
 * A signed URL for one shared listening mp3.
 * The caller may name a saved lesson or a bank row, never a storage path.
 * The response is only that file. It does not return the account, the story, or any other object.
 */
export const handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: 'Method not allowed' });
  let savedLessonId = '';
  let bankId = '';
  try {
    const body = JSON.parse(event.body || '{}') as { savedLessonId?: unknown; bankId?: unknown; path?: unknown };
    if ('path' in body || 'audioPath' in (body as { audioPath?: unknown })) return json(400, { ok: false, message: 'Missing lesson.' });
    savedLessonId = typeof body.savedLessonId === 'string' ? body.savedLessonId : '';
    bankId = typeof body.bankId === 'string' ? body.bankId : '';
  } catch {
    return json(400, { ok: false, message: 'Missing lesson.' });
  }
  if (Boolean(savedLessonId) === Boolean(bankId)) return json(400, { ok: false, message: 'Missing lesson.' });
  if (savedLessonId && !isBankId(savedLessonId)) return json(400, { ok: false, message: 'Missing lesson.' });
  if (bankId && !isBankId(bankId)) return json(400, { ok: false, message: 'Missing lesson.' });
  const env = runtimeEnv();
  const url = readEnvValue(env, 'SUPABASE_URL');
  const key = readEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json(500, { ok: false, message: 'Audio is not available yet.' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let audioPath = '';
  if (bankId) {
    audioPath = await listeningAudioPathForRow(admin, bankId) ?? '';
  } else {
    const row = await admin.from('saved_lessons').select('lesson').eq('id', savedLessonId).maybeSingle();
    const lesson = row.data?.lesson && typeof row.data.lesson === 'object' ? row.data.lesson as Record<string, unknown> : null;
    if (row.error || !lesson || lesson.mode !== 'listening') return json(404, { ok: false, message: 'That lesson is not available.' });
    const storedBank = typeof lesson.bankId === 'string' && isBankId(lesson.bankId) ? lesson.bankId : '';
    if (storedBank) audioPath = await listeningAudioPathForRow(admin, storedBank) ?? '';
    const stored = typeof lesson.audioPath === 'string' ? lesson.audioPath : '';
    if (!audioPath && isListeningAudioPath(stored)) audioPath = stored;
  }
  if (!audioPath) return json(404, { ok: false, message: 'That lesson is not available.' });
  const audioUrl = await signListeningAudio(admin, audioPath);
  if (!audioUrl) return json(502, { ok: false, message: 'The audio could not be opened. Please try again.' });
  return json(200, { ok: true, audioUrl });
};
