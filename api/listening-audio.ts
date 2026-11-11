import { createClient } from '@supabase/supabase-js';
import { isBankId } from '../exerciseBank.ts';
import { listeningAudioPathForRow, signListeningAudio, userWasServedBankItem } from '../exerciseBankServer.ts';
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
 * A fresh signed URL for a listening mp3 this person was already given.
 * The bank row stays on the server. This does not spend a lesson.
 */
export const handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: 'Method not allowed' });
  const token = bearer(event);
  if (!token) return json(401, { ok: false, error: 'auth_required' });
  let bankId = '';
  try {
    const body = JSON.parse(event.body || '{}') as { bankId?: unknown };
    bankId = typeof body.bankId === 'string' ? body.bankId : '';
  } catch {
    bankId = '';
  }
  if (!isBankId(bankId)) return json(400, { ok: false, message: 'Missing lesson.' });
  const env = runtimeEnv();
  const url = readEnvValue(env, 'SUPABASE_URL');
  const key = readEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json(500, { ok: false, message: 'Audio is not available yet.' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const userResult = await admin.auth.getUser(token);
  const userId = userResult.data.user?.id;
  if (userResult.error || !userId) return json(401, { ok: false, error: 'auth_required' });
  const served = await userWasServedBankItem(admin, userId, bankId);
  if (!served) return json(404, { ok: false, message: 'That lesson is not available.' });
  const audioPath = await listeningAudioPathForRow(admin, bankId);
  if (!audioPath) return json(404, { ok: false, message: 'That lesson is not available.' });
  const audioUrl = await signListeningAudio(admin, audioPath);
  if (!audioUrl) return json(502, { ok: false, message: 'The audio could not be opened. Please try again.' });
  return json(200, { ok: true, audioUrl });
};
