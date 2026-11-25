import { isPilotCode } from '../pilotAccess.ts';
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

const SAFE = 'The invitation could not be used.';

async function ownPilot(admin: NonNullable<ReturnType<typeof adminClient>>, userId: string) {
  const profile = await admin.from('profiles')
    .select('plan, billing_provider, pilot_expires_at, pilot_invitation_id')
    .eq('id', userId)
    .maybeSingle();
  if (profile.error || !profile.data) return { status: 'none' as const };
  if (ownerIsPilot(profile.data)) return { status: 'active' as const };
  const membership = await admin.from('academy_members').select('academy_id').eq('user_id', userId).maybeSingle();
  const academyId = (membership.data as { academy_id?: string } | null)?.academy_id;
  if (!academyId) return { status: 'none' as const };
  const academy = await admin.from('academies').select('owner_id').eq('id', academyId).maybeSingle();
  const ownerId = (academy.data as { owner_id?: string } | null)?.owner_id;
  if (!ownerId) return { status: 'none' as const };
  const owner = await admin.from('profiles')
    .select('plan, billing_provider, pilot_expires_at, pilot_invitation_id')
    .eq('id', ownerId)
    .maybeSingle();
  return ownerIsPilot(owner.data) ? { status: 'active' as const } : { status: 'none' as const };
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: jsonHeaders, body: '' };
  const token = bearerToken(event);
  const admin = adminClient();
  if (!token || !admin) return json(401, { ok: false, message: 'Sign in to use an invitation.' });
  const user = await requireUser(admin, token);
  if (!user) return json(401, { ok: false, message: 'Sign in to use an invitation.' });

  if (event.httpMethod === 'GET') return json(200, { ok: true, pilot: await ownPilot(admin, user.id) });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: SAFE });

  let code = '';
  try {
    const parsed = JSON.parse(rawBody(event) || '') as { code?: unknown };
    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).some((key) => key !== 'code')) {
      return json(400, { ok: false, code: 'invalid', message: SAFE });
    }
    code = typeof parsed.code === 'string' ? parsed.code.trim() : '';
  } catch {
    return json(400, { ok: false, code: 'invalid', message: SAFE });
  }
  if (!isPilotCode(code)) return json(400, { ok: false, code: 'invalid', message: SAFE });

  const redeemed = await admin.rpc('redeem_pilot_invitation', { uid: user.id, invite_code: code });
  if (redeemed.error) return json(503, { ok: false, message: SAFE });
  const result = String(redeemed.data ?? '');
  if (result === 'ok' || result === 'idempotent') {
    return json(200, { ok: true, idempotent: result === 'idempotent', pilot: await ownPilot(admin, user.id) });
  }
  return json(409, { ok: false, code: result, message: SAFE });
};
