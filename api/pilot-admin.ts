import { randomBytes } from 'node:crypto';
import {
  canCreateInvitation,
  canRevoke,
  cleanPilotLabel,
  cohortLimit,
  inviteStatus,
  isPilotAdmin,
  isPilotCode,
} from '../pilotAccess.ts';
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

type InviteRow = {
  id: string;
  code: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
  redeemed_at: string | null;
  redeemed_by: string | null;
  expires_at: string | null;
};

function publicInvite(row: InviteRow, now: number) {
  return {
    id: row.id,
    label: row.label,
    code: row.code,
    path: '/pilot',
    status: inviteStatus({
      revoked: row.revoked_at != null,
      redeemedBy: row.redeemed_by,
      expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
    }, now),
    createdAt: row.created_at,
    activatedAt: row.redeemed_at,
    endsAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: jsonHeaders, body: '' };
  const token = bearerToken(event);
  const admin = adminClient();
  if (!token || !admin) return json(503, { ok: false, code: 'unavailable' });
  const user = await requireUser(admin, token);
  if (!user || !isPilotAdmin(user.id, process.env.PILOT_ADMIN_UIDS)) {
    return json(403, { ok: false, code: 'not_admin' });
  }

  if (event.httpMethod === 'GET') {
    const listed = await admin.from('academy_pilot_invitations')
      .select('id, code, label, created_at, revoked_at, redeemed_at, redeemed_by, expires_at')
      .order('created_at', { ascending: false });
    if (listed.error) return json(503, { ok: false, code: 'unavailable' });
    const now = Date.now();
    const rows = (listed.data ?? []) as InviteRow[];
    return json(200, {
      ok: true,
      admin: true,
      cohortLimit: cohortLimit(process.env.PILOT_COHORT_LIMIT),
      openCount: rows.filter((row) => row.revoked_at == null).length,
      invitations: rows.map((row) => publicInvite(row, now)),
    });
  }

  if (event.httpMethod !== 'POST') return json(405, { ok: false });
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody(event) || '');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json(400, { ok: false });
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false });
  }

  if (body.action === 'create') {
    const label = cleanPilotLabel(typeof body.label === 'string' ? body.label : '');
    if (!label) return json(400, { ok: false, code: 'label' });
    const existing = await admin.from('academy_pilot_invitations').select('id, revoked_at');
    if (existing.error) return json(503, { ok: false, code: 'unavailable' });
    const open = (existing.data ?? []).filter((row) => (row as { revoked_at?: string | null }).revoked_at == null).length;
    if (!canCreateInvitation(open, cohortLimit(process.env.PILOT_COHORT_LIMIT))) {
      return json(409, { ok: false, code: 'cohort_full' });
    }
    const code = randomBytes(32).toString('base64url');
    if (!isPilotCode(code)) return json(500, { ok: false });
    const inserted = await admin.from('academy_pilot_invitations').insert({
      code,
      label,
      created_by: user.id,
    }).select('id, code, label, created_at, revoked_at, redeemed_at, redeemed_by, expires_at').maybeSingle();
    if (inserted.error || !inserted.data) return json(503, { ok: false, code: 'unavailable' });
    return json(200, { ok: true, invitation: publicInvite(inserted.data as InviteRow, Date.now()) });
  }

  if (body.action === 'revoke') {
    const id = typeof body.id === 'string' ? body.id : '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { ok: false });
    const current = await admin.from('academy_pilot_invitations')
      .select('id, code, label, created_at, revoked_at, redeemed_at, redeemed_by, expires_at')
      .eq('id', id)
      .maybeSingle();
    if (current.error || !current.data) return json(404, { ok: false });
    const row = current.data as InviteRow;
    if (!canRevoke({
      code: row.code,
      label: row.label,
      revoked: row.revoked_at != null,
      redeemedBy: row.redeemed_by,
      expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
    })) return json(409, { ok: false, code: 'not_revocable' });
    const updated = await admin.from('academy_pilot_invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .is('redeemed_by', null)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle();
    if (updated.error || !updated.data) return json(409, { ok: false, code: 'not_revocable' });
    return json(200, { ok: true });
  }

  return json(400, { ok: false });
};
