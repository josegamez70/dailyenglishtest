/** Private academy pilot rules. No admin ids, codes, or personal rows belong here. */

export const PILOT_DAYS = 20;
export const PILOT_SEATS = 20;
export const PILOT_COHORT_LIMIT = 14;
export const PILOT_DAY_MS = 24 * 60 * 60 * 1000;
export const PILOT_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const PILOT_STORAGE_KEY = 'pilot-invite-code';

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BillingProvider = 'stripe' | 'manual' | 'pilot' | null;

export type PilotInviteStatus = 'created' | 'activated' | 'ended' | 'revoked';

export type RedeemReason =
  | 'invalid'
  | 'revoked'
  | 'used'
  | 'conflict_tester'
  | 'conflict_paid'
  | 'conflict_manual'
  | 'already_academy'
  | 'already_piloted';

export type LessonReason = 'ok_unlimited' | 'ok_free' | 'pilot_expired' | 'free_limit' | 'missing';

export type AccessProfile = {
  found: boolean;
  plan: string;
  billingProvider: BillingProvider;
  lessonsUsed: number;
  pilotExpiresAt: number | null;
  studentPilotExpiresAt: number | null;
  nonPilotAcademyStudent: boolean;
  pilotFreeBlocked: boolean;
};

export type StoredInvite = {
  code: string;
  label: string;
  revoked: boolean;
  redeemedBy: string | null;
  expiresAt: number | null;
};

export type StoredActor = {
  userId: string;
  plan: string;
  billingProvider: BillingProvider;
  ownsAcademy: boolean;
  pilotInvitationCode: string | null;
};

export function pilotAdminIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0 || parts.some((part) => !USER_ID.test(part))) return [];
  return [...new Set(parts)];
}

/** Deny unless the signed-in user id is listed in server config. Emails never match. */
export function isPilotAdmin(userId: string | null | undefined, raw: string | undefined): boolean {
  if (!userId || !USER_ID.test(userId)) return false;
  return pilotAdminIds(raw).includes(userId.toLowerCase());
}

export function cohortLimit(raw: string | undefined): number {
  if (raw == null || raw.trim() === '') return PILOT_COHORT_LIMIT;
  if (!/^\d+$/.test(raw.trim())) return PILOT_COHORT_LIMIT;
  const value = Number(raw.trim());
  if (value < 1 || value > 20) return PILOT_COHORT_LIMIT;
  return value;
}

export function canCreateInvitation(nonRevokedCount: number, limit = PILOT_COHORT_LIMIT): boolean {
  return nonRevokedCount < limit;
}

export function isPilotCode(code: string): boolean {
  return PILOT_CODE_PATTERN.test(code);
}

export function pilotExpiry(activatedAt: number): number {
  return activatedAt + PILOT_DAYS * PILOT_DAY_MS;
}

export function pilotIsActive(now: number, expiresAt: number | null): boolean {
  return expiresAt != null && now < expiresAt;
}

export function pilotDaysLeft(now: number, expiresAt: number | null): number {
  if (expiresAt == null || now >= expiresAt) return 0;
  return Math.ceil((expiresAt - now) / PILOT_DAY_MS);
}

/** Same screen as “My academy” in the menu. www redirects to the canonical host. */
export const PILOT_ACADEMY_PATH = '/academy';
export const PILOT_ACADEMY_URL = 'https://www.dailyenglishtest.es/academy';

/** Stay on this site when the owner is already there, so the sign-in is kept. */
export function pilotAcademyHref(origin: string): string {
  try {
    const host = new URL(origin).hostname.replace(/\.$/, '').toLowerCase();
    if (host === 'dailyenglishtest.es' || host === 'www.dailyenglishtest.es') return PILOT_ACADEMY_PATH;
  } catch {
    /* use the public academy URL */
  }
  return PILOT_ACADEMY_URL;
}

/** Shown once this account’s academy pilot is active. The day count stays dynamic. */
export function pilotActiveNotice(daysLeft: number, seats = PILOT_SEATS): string {
  return `Your academy pilot is active: ${daysLeft} days left, up to ${seats} students. Go to www.dailyenglishtest.es and open My academy in the menu to name your academy and invite your students.`;
}

export function inviteStatus(invite: {
  revoked: boolean;
  redeemedBy: string | null;
  expiresAt: number | null;
}, now: number): PilotInviteStatus {
  if (invite.revoked) return 'revoked';
  if (invite.redeemedBy && invite.expiresAt != null && now >= invite.expiresAt) return 'ended';
  if (invite.redeemedBy) return 'activated';
  return 'created';
}

export function cleanPilotLabel(label: string): string | null {
  const clean = label.replace(/[\r\n]/g, ' ').trim();
  if (clean.length < 1 || clean.length > 60) return null;
  return clean;
}

function paidUnlimited(profile: AccessProfile): boolean {
  if (!profile.found) return false;
  if (profile.billingProvider === 'stripe') return true;
  if (profile.plan === 'tester') return true;
  if (profile.plan === 'pro' && profile.billingProvider !== 'pilot') return true;
  if (profile.plan === 'academy' && profile.pilotExpiresAt == null && profile.billingProvider !== 'pilot') return true;
  return false;
}

/** Generation gate. An expired pilot does not fall through to the free quota. */
export function lessonBlockReason(profile: AccessProfile, now: number, freeLimit: number): LessonReason {
  if (!profile.found) return 'missing';
  if (paidUnlimited(profile)) return 'ok_unlimited';
  if (profile.pilotExpiresAt != null) {
    return pilotIsActive(now, profile.pilotExpiresAt) ? 'ok_unlimited' : 'pilot_expired';
  }
  if (profile.studentPilotExpiresAt != null) {
    return pilotIsActive(now, profile.studentPilotExpiresAt) ? 'ok_unlimited' : 'pilot_expired';
  }
  if (profile.nonPilotAcademyStudent) return 'ok_unlimited';
  if (profile.pilotFreeBlocked) return 'pilot_expired';
  if (profile.plan !== 'free') return 'ok_unlimited';
  if (profile.lessonsUsed >= freeLimit) return 'free_limit';
  return 'ok_free';
}

export function canRevoke(invite: StoredInvite): boolean {
  return !invite.revoked && invite.redeemedBy == null;
}

export function redeemOutcome(
  invite: StoredInvite | null,
  actor: StoredActor,
  now: number,
): { ok: true; idempotent: boolean; expiresAt: number } | { ok: false; reason: RedeemReason } {
  if (!invite || !isPilotCode(invite.code)) return { ok: false, reason: 'invalid' };
  if (invite.redeemedBy === actor.userId) {
    return { ok: true, idempotent: true, expiresAt: invite.expiresAt ?? pilotExpiry(now) };
  }
  if (invite.revoked) return { ok: false, reason: 'revoked' };
  if (invite.redeemedBy) return { ok: false, reason: 'used' };
  if (actor.plan === 'tester') return { ok: false, reason: 'conflict_tester' };
  if (actor.billingProvider === 'stripe' || (actor.plan === 'pro' && actor.billingProvider !== 'pilot')) {
    return { ok: false, reason: 'conflict_paid' };
  }
  if (actor.billingProvider === 'manual' || (actor.plan === 'academy' && actor.billingProvider !== 'pilot' && !actor.pilotInvitationCode)) {
    return { ok: false, reason: 'conflict_manual' };
  }
  if (actor.ownsAcademy) return { ok: false, reason: 'already_academy' };
  if (actor.pilotInvitationCode && actor.pilotInvitationCode !== invite.code) {
    return { ok: false, reason: 'already_piloted' };
  }
  return { ok: true, idempotent: false, expiresAt: pilotExpiry(now) };
}

/** One locked redemption. A racing caller must use the updated invite. */
export function commitRedeem(
  invite: StoredInvite | null,
  actor: StoredActor,
  now: number,
): { invite: StoredInvite | null; actor: StoredActor; result: ReturnType<typeof redeemOutcome> } {
  const result = redeemOutcome(invite, actor, now);
  if (!result.ok || !invite) return { invite, actor, result };
  if (result.idempotent) return { invite, actor, result };
  return {
    invite: { ...invite, redeemedBy: actor.userId, expiresAt: result.expiresAt },
    actor: { ...actor, plan: 'academy', billingProvider: 'pilot', pilotInvitationCode: invite.code },
    result,
  };
}
