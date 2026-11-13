import { createClient } from '@supabase/supabase-js';
import { isBankId } from '../exerciseBank.ts';
import { readEnvValue, runtimeEnv } from '../taskMail.ts';
import { storeTaskListeningAudio } from '../taskListeningAudio.ts';

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

/** Signed Azure mp3 for the listening exercise in one of this person's task packs. */
export const handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: 'Method not allowed' });
  const token = bearer(event);
  if (!token) return json(401, { ok: false, error: 'auth_required' });
  let packId = '';
  let slow = false;
  let speed: unknown = 1;
  try {
    const body = JSON.parse(event.body || '{}') as { packId?: unknown; slow?: unknown; speed?: unknown };
    packId = typeof body.packId === 'string' ? body.packId : '';
    slow = body.slow === true;
    speed = body.speed;
  } catch {
    packId = '';
  }
  if (!isBankId(packId)) return json(400, { ok: false, message: 'Missing pack.' });
  const env = runtimeEnv();
  const url = readEnvValue(env, 'SUPABASE_URL');
  const key = readEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json(200, { ok: false, fallback: 'browser' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const userResult = await admin.auth.getUser(token);
  const userId = userResult.data.user?.id;
  if (userResult.error || !userId) return json(401, { ok: false, error: 'auth_required' });
  const stored = await storeTaskListeningAudio(admin, env, userId, packId, { speed, slow });
  if (!stored.ok || !stored.audioUrl) return json(200, { ok: false, fallback: 'browser' });
  return json(200, { ok: true, audioUrl: stored.audioUrl, source: stored.source });
};
