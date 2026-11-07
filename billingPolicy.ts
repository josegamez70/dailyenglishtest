import { randomBytes } from 'node:crypto';
import {
  BILLING_CANCEL_PATH,
  BILLING_PORTAL_RETURN_PATH,
  BILLING_SUCCESS_PATH,
  planByKey,
  PUBLIC_PLANS,
  type PlanKey,
  type PublicPlan,
} from './billingPlans.ts';

/**
 * Live price candidates verified by a read of acct_1RjMnfD66URNCYcO on 7 Nov 2026.
 * They are not secret. Checkout still fails closed until env and feature flags are set.
 * The archived €5 price is refused everywhere.
 */
export const LIVE_PRICE_CANDIDATES: Record<PlanKey, { priceId: string; productId: string }> = {
  premium: { priceId: 'price_1UZAQeD66URNCYcOYdbZxyM1', productId: 'prod_VaKlT63gAOYYpv' },
  academy_20: { priceId: 'price_1UZA8OD66URNCYcOPqLPrd6C', productId: 'prod_VaKo9BcJRQ2Ecv' },
  academy_40: { priceId: 'price_1UZA8UD66URNCYcOcVm2hP5J', productId: 'prod_VaKo9BcJRQ2Ecv' },
  academy_70: { priceId: 'price_1UZA8XD66URNCYcOcJGLVvoA', productId: 'prod_VaKo9BcJRQ2Ecv' },
  academy_100: { priceId: 'price_1UZA8YD66URNCYcOTIepFerZ', productId: 'prod_VaKo9BcJRQ2Ecv' },
};

/** Archived Premium price of €5. Lookup key removed. Never grant or charge it. */
export const RETIRED_PREMIUM_PRICE_ID = 'price_1UZA5yD66URNCYcO98GAaLbD';

export const RETIRED_LOOKUP_KEYS = ['det_academy_8', 'det_academy_15', 'det_academy_30'] as const;
const RETIRED_LOOKUP_SET = new Set<string>(RETIRED_LOOKUP_KEYS);

export type EnvMap = Record<string, string | undefined>;

export type PriceSnapshot = {
  id?: string;
  active?: boolean;
  currency?: string;
  unit_amount?: number | null;
  type?: string;
  lookup_key?: string | null;
  livemode?: boolean;
  product?: string | { id?: string } | null;
  metadata?: Record<string, string> | null;
  recurring?: {
    interval?: string;
    interval_count?: number;
    usage_type?: string;
    trial_period_days?: number | null;
  } | null;
};

export type BillingReadiness = {
  checkout: boolean;
  reason: 'ready' | 'flag_off' | 'live_not_allowed' | 'incomplete';
};

const BLOCKING_STATUSES = new Set(['active', 'past_due', 'unpaid', 'paused', 'trialing']);

export function keyMode(secretKey: string | undefined): 'live' | 'test' | null {
  const key = secretKey ?? '';
  if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) return 'live';
  if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) return 'test';
  return null;
}

export function appBaseUrl(env: EnvMap): string | null {
  const raw = env.APP_BASE_URL?.trim().replace(/\/+$/, '') ?? '';
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol === 'http:' && local) return url.origin;
  if (url.protocol !== 'https:') return null;
  if (url.pathname !== '' && url.pathname !== '/') return null;
  return url.origin;
}

export function billingUrls(env: EnvMap): { success: string; cancel: string; portalReturn: string } | null {
  const base = appBaseUrl(env);
  if (!base) return null;
  return {
    success: `${base}${BILLING_SUCCESS_PATH}`,
    cancel: `${base}${BILLING_CANCEL_PATH}`,
    portalReturn: `${base}${BILLING_PORTAL_RETURN_PATH}`,
  };
}

export function billingReadiness(env: EnvMap): BillingReadiness {
  if (env.STRIPE_BILLING_ENABLED !== 'true') return { checkout: false, reason: 'flag_off' };
  const mode = keyMode(env.STRIPE_SECRET_KEY);
  if (!mode) return { checkout: false, reason: 'incomplete' };
  if (mode === 'live' && env.STRIPE_ALLOW_LIVE_CHARGES !== 'true') {
    return { checkout: false, reason: 'live_not_allowed' };
  }
  if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) return { checkout: false, reason: 'incomplete' };
  if (!appBaseUrl(env)) return { checkout: false, reason: 'incomplete' };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { checkout: false, reason: 'incomplete' };
  for (const plan of PUBLIC_PLANS) {
    const priceId = env[plan.envPrice]?.trim() ?? '';
    const productId = env[plan.envProduct]?.trim() ?? '';
    if (!priceId.startsWith('price_') || !productId.startsWith('prod_')) {
      return { checkout: false, reason: 'incomplete' };
    }
    if (priceId === RETIRED_PREMIUM_PRICE_ID) return { checkout: false, reason: 'incomplete' };
    const candidate = LIVE_PRICE_CANDIDATES[plan.key];
    if (mode === 'live') {
      if (priceId !== candidate.priceId || productId !== candidate.productId) {
        return { checkout: false, reason: 'incomplete' };
      }
    } else if (priceId === candidate.priceId || productId === candidate.productId || priceId === RETIRED_PREMIUM_PRICE_ID) {
      return { checkout: false, reason: 'incomplete' };
    }
  }
  return { checkout: true, reason: 'ready' };
}

export function priceMismatch(plan: PublicPlan, price: PriceSnapshot, mode: 'live' | 'test'): string | null {
  if (price.id === RETIRED_PREMIUM_PRICE_ID) return 'retired_price';
  if (price.active !== true) return 'inactive';
  if (price.livemode !== (mode === 'live')) return 'livemode';
  const candidate = LIVE_PRICE_CANDIDATES[plan.key];
  if (mode === 'live') {
    if (price.id !== candidate.priceId) return 'price_id';
  } else if (!price.id || price.id === candidate.priceId || price.id === RETIRED_PREMIUM_PRICE_ID) {
    return 'price_id';
  }
  if (price.currency?.toLowerCase() !== 'eur') return 'currency';
  if (price.unit_amount !== plan.amountCents) return 'amount';
  if (price.type !== 'recurring') return 'type';
  if (price.lookup_key && RETIRED_LOOKUP_SET.has(price.lookup_key)) return 'retired_lookup';
  if (price.lookup_key !== plan.lookupKey) return 'lookup_key';
  if (!price.recurring) return 'recurring';
  if (price.recurring.interval !== 'month' || price.recurring.interval_count !== 1) return 'interval';
  if (price.recurring.usage_type !== 'licensed') return 'usage_type';
  if (price.recurring.trial_period_days) return 'trial';
  const productId = typeof price.product === 'string' ? price.product : price.product?.id;
  if (mode === 'live') {
    if (productId !== candidate.productId) return 'product';
  } else if (!productId || productId === candidate.productId) {
    return 'product';
  }
  const seats = price.metadata?.max_students;
  if (plan.seats == null) {
    if (seats) return 'unexpected_capacity';
    if (price.metadata?.plan !== 'pro') return 'plan_metadata';
  } else if (seats !== String(plan.seats)) {
    return 'capacity';
  }
  return null;
}

export function readPlanRequest(body: unknown): { ok: true; planKey: PlanKey } | { ok: false } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false };
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== 'planKey' || typeof record.planKey !== 'string') return { ok: false };
  const plan = planByKey(record.planKey);
  if (!plan) return { ok: false };
  return { ok: true, planKey: plan.key };
}

export function readEmptyBody(body: unknown): boolean {
  if (body == null) return true;
  if (typeof body !== 'object' || Array.isArray(body)) return false;
  return Object.keys(body as Record<string, unknown>).length === 0;
}

export type CheckoutAccount = {
  plan: string | null;
  billingProvider: 'stripe' | 'manual' | null;
  subscriptionStatus: string | null;
  academyRole: 'owner' | 'student' | null;
};

export type CheckoutEligibility =
  | { ok: true; mode: 'checkout' | 'portal' }
  | { ok: false; reason: 'tester' | 'manual_academy' | 'manual_paid' | 'academy_student' };

export function checkoutEligibility(account: CheckoutAccount): CheckoutEligibility {
  if (account.academyRole === 'student') return { ok: false, reason: 'academy_student' };
  if (account.plan === 'tester' || account.billingProvider === 'manual') {
    return { ok: false, reason: account.plan === 'academy' ? 'manual_academy' : account.plan === 'tester' ? 'tester' : 'manual_paid' };
  }
  if (account.billingProvider !== 'stripe' && account.plan === 'academy') return { ok: false, reason: 'manual_academy' };
  if (account.billingProvider !== 'stripe' && account.plan === 'pro') return { ok: false, reason: 'manual_paid' };
  if (
    account.billingProvider === 'stripe'
    && account.subscriptionStatus
    && BLOCKING_STATUSES.has(account.subscriptionStatus)
  ) {
    return { ok: true, mode: 'portal' };
  }
  return { ok: true, mode: 'checkout' };
}

export type BillingProfile = {
  plan: string;
  billingProvider: 'stripe' | 'manual' | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  billingEventCreated: number;
  billingHold: 'dispute' | 'fraud_warning' | 'refund' | null;
  planKey: string | null;
  seats: number | null;
};

export type SubscriptionFact = {
  eventCreated: number;
  subscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
  itemCount: number;
  quantity: number | null;
  matchedPlan: PublicPlan | null;
};

export type RiskHold = 'dispute' | 'fraud_warning' | 'refund' | null;

export type ApplyBilling = {
  plan: 'free' | 'pro' | 'academy';
  planKey: string | null;
  seats: number | null;
  status: string;
  subscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
  hold: RiskHold;
  setProvider: boolean;
};

export type SyncDecision =
  | { action: 'ignore'; reason: 'manual' | 'stale' | 'duplicate' }
  | { action: 'apply'; billing: ApplyBilling };

export function stripeMayWrite(profile: BillingProfile): boolean {
  if (profile.billingProvider === 'manual') return false;
  if (profile.billingProvider === 'stripe') return true;
  return profile.plan === 'free';
}

export function decideSubscriptionSync(
  profile: BillingProfile,
  fact: SubscriptionFact,
  options: { allowGrant?: boolean; incomingHold?: RiskHold } = {},
): SyncDecision {
  if (!stripeMayWrite(profile)) return { action: 'ignore', reason: 'manual' };
  if (fact.eventCreated < profile.billingEventCreated) return { action: 'ignore', reason: 'stale' };
  const storedEntitled = profile.billingProvider === 'stripe'
    && (profile.subscriptionStatus === 'active' || profile.subscriptionStatus === 'past_due')
    && profile.plan !== 'free';
  if (storedEntitled && profile.stripeSubscriptionId && profile.stripeSubscriptionId !== fact.subscriptionId) {
    return { action: 'ignore', reason: 'duplicate' };
  }

  const sticky = profile.billingHold === 'dispute' || profile.billingHold === 'fraud_warning'
    ? profile.billingHold
    : null;
  const incoming = options.incomingHold ?? null;
  const hold: RiskHold = incoming === 'dispute' || incoming === 'fraud_warning'
    ? incoming
    : sticky
      ? sticky
      : incoming === 'refund'
        ? 'refund'
        : null;

  const licensed = fact.itemCount === 1 && fact.quantity === 1 && fact.matchedPlan;
  const allowGrant = options.allowGrant !== false && !hold;
  const base = {
    status: fact.status,
    subscriptionId: fact.subscriptionId,
    cancelAtPeriodEnd: fact.cancelAtPeriodEnd,
    currentPeriodEnd: fact.currentPeriodEnd,
    hold,
  };

  if (allowGrant && fact.status === 'active' && licensed && fact.matchedPlan) {
    return {
      action: 'apply',
      billing: {
        ...base,
        plan: fact.matchedPlan.appPlan,
        planKey: fact.matchedPlan.key,
        seats: fact.matchedPlan.seats,
        hold: null,
        setProvider: true,
      },
    };
  }

  const previouslyPaid = profile.billingProvider === 'stripe' && (profile.plan === 'pro' || profile.plan === 'academy');
  if (allowGrant && fact.status === 'past_due' && previouslyPaid) {
    const same = licensed && fact.matchedPlan?.appPlan === profile.plan;
    const keptPlan = profile.plan === 'pro' || profile.plan === 'academy' ? profile.plan : 'free';
    return {
      action: 'apply',
      billing: {
        ...base,
        plan: keptPlan,
        planKey: same && fact.matchedPlan ? fact.matchedPlan.key : profile.planKey,
        seats: same && fact.matchedPlan ? fact.matchedPlan.seats : profile.seats,
        setProvider: true,
      },
    };
  }

  const alreadyStripe = profile.billingProvider === 'stripe';
  return {
    action: 'apply',
    billing: {
      ...base,
      plan: 'free',
      planKey: null,
      seats: null,
      setProvider: alreadyStripe || hold != null,
    },
  };
}

export function subscriptionIdFromInvoice(invoice: {
  parent?: {
    type?: string | null;
    subscription_details?: { subscription?: string | { id?: string } | null } | null;
  } | null;
  subscription?: string | { id?: string } | null;
}): string | null {
  const modern = invoice.parent?.subscription_details?.subscription;
  const modernId = idOf(modern);
  if (modernId) return modernId;
  return idOf(invoice.subscription);
}

export function paymentIntentIdFromCharge(charge: {
  payment_intent?: string | { id?: string } | null;
}): string | null {
  return idOf(charge.payment_intent);
}

export function refundShouldSuspend(charge: {
  amount?: number | null;
  amount_refunded?: number | null;
  refunded?: boolean | null;
}): boolean {
  if (charge.refunded === true) return true;
  const amount = charge.amount ?? 0;
  const refunded = charge.amount_refunded ?? 0;
  return amount > 0 && refunded >= amount;
}

export function sessionShouldSync(session: { mode?: string | null; payment_status?: string | null }): boolean {
  return session.mode === 'subscription'
    && (session.payment_status === 'paid' || session.payment_status === 'no_payment_required');
}

export function makeIntegrationIdentifier(suffix: string): string | null {
  if (!/^[a-z]{8}$/.test(suffix)) return null;
  return `det_checkout_${suffix}`;
}

export function randomLetterSuffix(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) out += alphabet[bytes[i] % 26];
  return out;
}

export function checkoutIdempotencyKey(userId: string, planKey: string, now = Date.now()): string {
  const bucket = Math.floor(now / 600_000);
  return `checkout_${userId}_${planKey}_${bucket}`.slice(0, 255);
}

export function idOf(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.id ?? null;
}

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function userIdFromMetadata(metadata: Record<string, string> | null | undefined): string | null {
  const value = metadata?.supabase_user_id?.trim() ?? '';
  return USER_ID.test(value) ? value : null;
}
