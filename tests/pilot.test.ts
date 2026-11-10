import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { inclusiveVatBreakdown } from '../billingPlans.ts';
import { stripeMayWrite, type BillingProfile } from '../billingPolicy.ts';
import {
  PILOT_DAYS,
  PILOT_SEATS,
  canCreateInvitation,
  canRevoke,
  cleanPilotLabel,
  cohortLimit,
  commitRedeem,
  inviteStatus,
  isPilotAdmin,
  isPilotCode,
  lessonBlockReason,
  pilotAdminIds,
  pilotDaysLeft,
  pilotExpiry,
  pilotIsActive,
  redeemOutcome,
  type AccessProfile,
  type StoredActor,
  type StoredInvite,
} from '../pilotAccess.ts';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const CODE = randomBytes(32).toString('base64url');
const NOW = Date.parse('2026-11-09T12:00:00.000Z');

function access(patch: Partial<AccessProfile> = {}): AccessProfile {
  return {
    found: true,
    plan: 'free',
    billingProvider: null,
    lessonsUsed: 0,
    pilotExpiresAt: null,
    studentPilotExpiresAt: null,
    nonPilotAcademyStudent: false,
    pilotFreeBlocked: false,
    ...patch,
  };
}

function actor(patch: Partial<StoredActor> = {}): StoredActor {
  return {
    userId: OWNER,
    plan: 'free',
    billingProvider: null,
    ownsAcademy: false,
    pilotInvitationCode: null,
    ...patch,
  };
}

function invite(patch: Partial<StoredInvite> = {}): StoredInvite {
  return { code: CODE, label: 'Example academy', revoked: false, redeemedBy: null, expiresAt: null, ...patch };
}

test('admin access is deny-by-default and ignores emails', () => {
  assert.deepEqual(pilotAdminIds(undefined), []);
  assert.deepEqual(pilotAdminIds(''), []);
  assert.deepEqual(pilotAdminIds('not-a-uuid'), []);
  assert.deepEqual(pilotAdminIds(`owner@example.com,${ADMIN}`), []);
  assert.equal(isPilotAdmin(ADMIN, undefined), false);
  assert.equal(isPilotAdmin(ADMIN, 'owner@example.com'), false);
  assert.equal(isPilotAdmin('not-a-user', ADMIN), false);
  assert.equal(isPilotAdmin(ADMIN, ` ${ADMIN.toUpperCase()} `), true);
  assert.equal(isPilotAdmin(OTHER, ADMIN), false);
});

test('cohort defaults to fourteen and still accepts a configured limit', () => {
  assert.equal(cohortLimit(undefined), 14);
  assert.equal(cohortLimit(''), 14);
  assert.equal(cohortLimit('nope'), 14);
  assert.equal(cohortLimit('0'), 14);
  assert.equal(cohortLimit('21'), 14);
  assert.equal(cohortLimit('4'), 4);
  assert.equal(cohortLimit('14'), 14);
  assert.equal(canCreateInvitation(13), true);
  assert.equal(canCreateInvitation(14), false);
  assert.equal(canCreateInvitation(3, 4), true);
  assert.equal(canCreateInvitation(4, 4), false);
  assert.equal(PILOT_SEATS, 20);
  assert.equal(PILOT_DAYS, 20);
});

test('a code is single-use, idempotent for the same owner, and rejects repeat trials', () => {
  assert.equal(isPilotCode(CODE), true);
  assert.equal(isPilotCode('EXAMPLE-NOT-A-REAL-INVITE'), false);
  const first = commitRedeem(invite(), actor(), NOW);
  assert.equal(first.result.ok, true);
  if (!first.result.ok) return;
  assert.equal(first.result.idempotent, false);
  assert.equal(first.result.expiresAt, pilotExpiry(NOW));
  assert.equal(first.actor.billingProvider, 'pilot');
  assert.equal(first.actor.plan, 'academy');

  const replay = commitRedeem(first.invite, first.actor, NOW + 1000);
  assert.equal(replay.result.ok, true);
  if (replay.result.ok) {
    assert.equal(replay.result.idempotent, true);
    assert.equal(replay.result.expiresAt, first.result.expiresAt);
  }

  const raced = commitRedeem(first.invite, actor({ userId: OTHER }), NOW + 5);
  assert.deepEqual(raced.result, { ok: false, reason: 'used' });

  const secondCode = randomBytes(32).toString('base64url');
  const again = redeemOutcome(invite({ code: secondCode }), first.actor, NOW);
  assert.deepEqual(again, { ok: false, reason: 'already_piloted' });
});

test('manual, tester, and Stripe accounts are not converted into a pilot', () => {
  assert.equal(redeemOutcome(invite(), actor({ plan: 'tester' }), NOW).ok, false);
  assert.equal(redeemOutcome(invite(), actor({ plan: 'pro', billingProvider: 'stripe' }), NOW).ok, false);
  assert.equal(redeemOutcome(invite(), actor({ plan: 'academy', billingProvider: null }), NOW).ok, false);
  assert.equal(redeemOutcome(invite(), actor({ plan: 'academy', billingProvider: 'manual' }), NOW).ok, false);
  assert.equal(redeemOutcome(invite(), actor({ ownsAcademy: true }), NOW).ok, false);
  assert.equal(redeemOutcome(invite({ revoked: true }), actor(), NOW).ok, false);
  assert.equal(canRevoke(invite()), true);
  assert.equal(canRevoke(invite({ redeemedBy: OWNER })), false);
});

test('expiry blocks owner and student generation without touching paid academies or free quota', () => {
  const end = pilotExpiry(NOW);
  assert.equal(pilotIsActive(end - 1, end), true);
  assert.equal(pilotIsActive(end, end), false);
  assert.equal(pilotDaysLeft(end - 1, end) > 0, true);
  assert.equal(pilotDaysLeft(end, end), 0);

  assert.equal(lessonBlockReason(access({
    plan: 'academy',
    billingProvider: 'pilot',
    pilotExpiresAt: end,
    lessonsUsed: 40,
  }), end - 1, 3), 'ok_unlimited');
  assert.equal(lessonBlockReason(access({
    plan: 'academy',
    billingProvider: 'pilot',
    pilotExpiresAt: end,
    lessonsUsed: 0,
  }), end, 3), 'pilot_expired');
  assert.equal(lessonBlockReason(access({
    plan: 'free',
    studentPilotExpiresAt: end,
    lessonsUsed: 0,
  }), end, 3), 'pilot_expired');
  assert.equal(lessonBlockReason(access({
    plan: 'free',
    studentPilotExpiresAt: end,
    lessonsUsed: 0,
  }), end - 1, 3), 'ok_unlimited');
  assert.equal(lessonBlockReason(access({
    plan: 'free',
    pilotFreeBlocked: true,
    lessonsUsed: 0,
  }), NOW, 3), 'pilot_expired');
  assert.equal(lessonBlockReason(access({ plan: 'free', lessonsUsed: 1 }), NOW, 3), 'ok_free');
  assert.equal(lessonBlockReason(access({ plan: 'free', lessonsUsed: 3 }), NOW, 3), 'free_limit');
  assert.equal(lessonBlockReason(access({ plan: 'academy', billingProvider: null }), NOW, 3), 'ok_unlimited');
  assert.equal(lessonBlockReason(access({ plan: 'academy', billingProvider: 'stripe' }), NOW, 3), 'ok_unlimited');
  assert.equal(lessonBlockReason(access({ plan: 'tester' }), NOW, 3), 'ok_unlimited');
  assert.equal(lessonBlockReason(access({ plan: 'free', nonPilotAcademyStudent: true }), NOW, 3), 'ok_unlimited');

  const pilotProfile: BillingProfile = {
    plan: 'academy',
    billingProvider: 'pilot',
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    billingEventCreated: 0,
    billingHold: null,
    planKey: null,
    seats: 20,
  };
  assert.equal(stripeMayWrite(pilotProfile), false);
  assert.equal(inviteStatus({ revoked: false, redeemedBy: OWNER, expiresAt: end }, end), 'ended');
  assert.equal(inviteStatus({ revoked: false, redeemedBy: null, expiresAt: null }, NOW), 'created');
  assert.equal(cleanPilotLabel('  North academy  '), 'North academy');
  assert.equal(cleanPilotLabel(''), null);
  const vat = inclusiveVatBreakdown(3000);
  assert.equal(vat.baseCents + vat.vatCents, 3000);
});
