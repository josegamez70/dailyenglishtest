import { createClient } from '@supabase/supabase-js';
import { advanceTaskPack } from '../taskServer.ts';
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

export const handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: 'Method not allowed' });
  const token = bearer(event);
  if (!token) return json(401, { ok: false, error: 'auth_required' });
  const env = runtimeEnv();
  const url = readEnvValue(env, 'SUPABASE_URL');
  const key = readEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json(500, { ok: false, message: 'Tasks are not available yet.' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const userResult = await admin.auth.getUser(token);
  const userId = userResult.data.user?.id;
  if (userResult.error || !userId) return json(401, { ok: false, error: 'auth_required' });
  try {
    const result = await advanceTaskPack(userId);
    const status = result.blocked ? 402 : result.ok || result.missing ? 200 : 502;
    return json(status, result);
  } catch (error) {
    console.error('tasks advance failed', error instanceof Error ? error.message : 'error');
    return json(502, { ok: false, message: 'The task pack could not be created. Please try again.' });
  }
};
