import { ownerIsPilot } from '../pilotGate.ts';
import {
  adminClient,
  bearerToken,
  json,
  jsonHeaders,
  rawBody,
  requireUser,
  type HandlerEvent,
  type HandlerResponse,
} from './billingHttp.ts';

/**
 * Joins a pilot academy when the database function still reports it full or inactive.
 * Paid and hand-set academies keep their own seat check. This does not start a payment.
 */
export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: jsonHeaders, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false });
  const token = bearerToken(event);
  const admin = adminClient();
  if (!token || !admin) return json(401, { ok: false });
  const user = await requireUser(admin, token);
  if (!user) return json(401, { ok: false });

  let code = '';
  try {
    const parsed = JSON.parse(rawBody(event) || '') as { code?: unknown };
    code = typeof parsed.code === 'string' ? parsed.code.trim().toUpperCase() : '';
  } catch {
    return json(400, { ok: false });
  }
  if (!code) return json(400, { ok: false });

  const academy = await admin.from('academies').select('id, owner_id').eq('invite_code', code).maybeSingle();
  const academyId = (academy.data as { id?: string; owner_id?: string } | null)?.id;
  const ownerId = (academy.data as { owner_id?: string } | null)?.owner_id;
  if (!academyId || !ownerId) return json(409, { ok: false, code: 'invalid_code' });

  const owner = await admin.from('profiles')
    .select('plan, billing_provider, pilot_expires_at, pilot_invitation_id')
    .eq('id', ownerId)
    .maybeSingle();
  if (!ownerIsPilot(owner.data)) return json(409, { ok: false, code: 'not_pilot' });

  const owns = await admin.from('academies').select('id').eq('owner_id', user.id).maybeSingle();
  if (owns.data) return json(200, { ok: true, code: 'already_member' });
  const existing = await admin.from('academy_members').select('user_id').eq('user_id', user.id).maybeSingle();
  if (existing.data) return json(200, { ok: true, code: 'already_member' });

  const inserted = await admin.from('academy_members').insert({ academy_id: academyId, user_id: user.id });
  if (inserted.error) return json(409, { ok: false, code: 'not_joined' });
  await admin.from('profiles').update({ pilot_free_blocked: true }).eq('id', user.id);
  return json(200, { ok: true, code: 'ok' });
};
