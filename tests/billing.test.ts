import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_PLANS, formatEuro, inclusiveVatBreakdown, isHostedStripeUrl, planByKey, renewalVatBreakdowns } from '../billingPlans.ts';
import {
  LIVE_PRICE_CANDIDATES,
  RETIRED_LOOKUP_KEYS,
  RETIRED_PREMIUM_PRICE_ID,
  appBaseUrl,
  billingReadiness,
  checkoutEligibility,
  decideSubscriptionSync,
  inclusiveTaxRateId,
  makeIntegrationIdentifier,
  priceMismatch,
  priceTaxBehaviorMismatch,
  readPlanRequest,
  refundShouldSuspend,
  sessionShouldSync,
  subscriptionIdFromInvoice,
  taxRateMismatch,
  type BillingProfile,
  type PriceSnapshot,
  type PublicPlan,
} from '../billingPolicy.ts';

const TEST_KEY = ['rk', 'test', 'example'].join('_');
const LIVE_KEY = ['rk', 'live', 'example'].join('_');
const WEBHOOK_SECRET = ['whsec', 'example'].join('_');

function env(extra: Record<string, string>): Record<string, string> {
  return {
    STRIPE_BILLING_ENABLED: 'true',
    STRIPE_SECRET_KEY: TEST_KEY,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    APP_BASE_URL: 'https://preview.example.test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-example',
    STRIPE_TAX_RATE_IVA_21: 'txr_test_iva21',
    ...extra,
  };
}

function testPriceEnv(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const plan of PUBLIC_PLANS) {
    values[plan.envPrice] = `price_test_${plan.key}`;
    values[plan.envProduct] = `prod_test_${plan.key}`;
  }
  return values;
}

function priceFor(plan: PublicPlan, mode: 'live' | 'test', patch: Partial<PriceSnapshot> = {}): PriceSnapshot {
  const candidate = LIVE_PRICE_CANDIDATES[plan.key];
  return {
    id: mode === 'live' ? candidate.priceId : `price_test_${plan.key}`,
    active: true,
    currency: 'eur',
    unit_amount: plan.amountCents,
    type: 'recurring',
    lookup_key: plan.lookupKey,
    livemode: mode === 'live',
    product: mode === 'live' ? candidate.productId : `prod_test_${plan.key}`,
    metadata: plan.seats == null ? { plan: 'pro' } : { max_students: String(plan.seats) },
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed', trial_period_days: null },
    ...patch,
  };
}

function profile(patch: Partial<BillingProfile> = {}): BillingProfile {
  return {
    plan: 'free',
    billingProvider: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    billingEventCreated: 0,
    billingHold: null,
    planKey: null,
    seats: null,
    ...patch,
  };
}

const premium = planByKey('premium');
const academy20 = planByKey('academy_20');
assert.ok(premium && academy20);

test('catalog is the corrected euro monthly prices', () => {
  assert.deepEqual(PUBLIC_PLANS.map((plan) => [plan.key, plan.amountCents, plan.seats, plan.lookupKey]), [
    ['premium', 300, null, 'det_premium_monthly'],
    ['academy_20', 3000, 20, 'det_academy_20'],
    ['academy_40', 4500, 40, 'det_academy_40'],
    ['academy_70', 6000, 70, 'det_academy_70'],
    ['academy_100', 8000, 100, 'det_academy_100'],
  ]);
  assert.equal(formatEuro(300), '3 €');
  assert.equal(formatEuro(4500), '45 €');
});

test('billing stays off until flags, webhook, and price env are complete', () => {
  assert.equal(billingReadiness({}).reason, 'flag_off');
  assert.equal(billingReadiness({ STRIPE_BILLING_ENABLED: 'true' }).reason, 'incomplete');
  assert.equal(billingReadiness(env({
    STRIPE_SECRET_KEY: LIVE_KEY,
    ...testPriceEnv(),
    STRIPE_PRICE_PREMIUM: LIVE_PRICE_CANDIDATES.premium.priceId,
    STRIPE_PRODUCT_PREMIUM: LIVE_PRICE_CANDIDATES.premium.productId,
    STRIPE_PRICE_ACADEMY_20: LIVE_PRICE_CANDIDATES.academy_20.priceId,
    STRIPE_PRODUCT_ACADEMY_20: LIVE_PRICE_CANDIDATES.academy_20.productId,
    STRIPE_PRICE_ACADEMY_40: LIVE_PRICE_CANDIDATES.academy_40.priceId,
    STRIPE_PRODUCT_ACADEMY_40: LIVE_PRICE_CANDIDATES.academy_40.productId,
    STRIPE_PRICE_ACADEMY_70: LIVE_PRICE_CANDIDATES.academy_70.priceId,
    STRIPE_PRODUCT_ACADEMY_70: LIVE_PRICE_CANDIDATES.academy_70.productId,
    STRIPE_PRICE_ACADEMY_100: LIVE_PRICE_CANDIDATES.academy_100.priceId,
    STRIPE_PRODUCT_ACADEMY_100: LIVE_PRICE_CANDIDATES.academy_100.productId,
  })).reason, 'live_not_allowed');
  assert.equal(billingReadiness(env(testPriceEnv())).reason, 'ready');
  const withoutTax = env(testPriceEnv());
  delete withoutTax.STRIPE_TAX_RATE_IVA_21;
  assert.equal(billingReadiness(withoutTax).reason, 'incomplete');
  assert.equal(billingReadiness(env({
    ...testPriceEnv(),
    STRIPE_PRICE_PREMIUM: RETIRED_PREMIUM_PRICE_ID,
  })).checkout, false);
});

test('a live price must match amount, lookup, product, and capacity', () => {
  assert.equal(priceMismatch(premium, priceFor(premium, 'live'), 'live'), null);
  assert.equal(priceMismatch(academy20, priceFor(academy20, 'live'), 'live'), null);
  assert.equal(priceMismatch(premium, priceFor(premium, 'live', {
    id: RETIRED_PREMIUM_PRICE_ID,
    unit_amount: 500,
    lookup_key: null,
    active: false,
  }), 'live'), 'retired_price');
  assert.equal(priceMismatch(premium, priceFor(premium, 'live', { unit_amount: 500 }), 'live'), 'amount');
  assert.equal(priceMismatch(academy20, priceFor(academy20, 'live', { lookup_key: 'det_academy_8' }), 'live'), 'retired_lookup');
  assert.equal(priceMismatch(academy20, priceFor(academy20, 'live', { metadata: { max_students: '8' } }), 'live'), 'capacity');
  assert.equal(priceMismatch(premium, priceFor(premium, 'live', {
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed', trial_period_days: 7 },
  }), 'live'), 'trial');
  assert.equal(priceMismatch(premium, priceFor(premium, 'live', {
    recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed', trial_period_days: null },
  }), 'live'), 'interval');
  assert.equal(priceMismatch(academy20, priceFor(academy20, 'test'), 'live'), 'livemode');
});

test('the client cannot choose a price, customer, or redirect', () => {
  assert.equal(readPlanRequest({ planKey: 'premium' }).ok, true);
  assert.equal(readPlanRequest({ planKey: 'academy_8' }).ok, false);
  assert.equal(readPlanRequest({ planKey: 'premium', price: LIVE_PRICE_CANDIDATES.premium.priceId }).ok, false);
  assert.equal(readPlanRequest({ planKey: 'premium', success_url: 'https://evil.example' }).ok, false);
  assert.equal(appBaseUrl({ APP_BASE_URL: 'https://dailyenglishtest.es/profile?next=https://evil.example' }), null);
  assert.equal(appBaseUrl({ APP_BASE_URL: 'https://dailyenglishtest.es' }), 'https://dailyenglishtest.es');
  assert.equal(isHostedStripeUrl('https://checkout.stripe.com/c/pay/cs_test_123'), true);
  assert.equal(isHostedStripeUrl('https://evil.example/checkout.stripe.com'), false);
  assert.equal(makeIntegrationIdentifier('abcdefgh'), 'det_checkout_abcdefgh');
  assert.equal(makeIntegrationIdentifier('abc'), null);
});

test('manual tester and academy accounts are not sent to checkout', () => {
  assert.deepEqual(checkoutEligibility({ plan: 'tester', billingProvider: null, subscriptionStatus: null, academyRole: null }), { ok: false, reason: 'tester' });
  assert.deepEqual(checkoutEligibility({ plan: 'academy', billingProvider: null, subscriptionStatus: null, academyRole: 'owner' }), { ok: false, reason: 'manual_academy' });
  assert.deepEqual(checkoutEligibility({ plan: 'pro', billingProvider: 'manual', subscriptionStatus: null, academyRole: null }), { ok: false, reason: 'manual_paid' });
  assert.deepEqual(checkoutEligibility({ plan: 'free', billingProvider: null, subscriptionStatus: null, academyRole: 'student' }), { ok: false, reason: 'academy_student' });
  assert.equal(checkoutEligibility({ plan: 'pro', billingProvider: 'stripe', subscriptionStatus: 'active', academyRole: null }).ok && checkoutEligibility({ plan: 'pro', billingProvider: 'stripe', subscriptionStatus: 'active', academyRole: null }).mode, 'portal');
  assert.equal(checkoutEligibility({ plan: 'free', billingProvider: null, subscriptionStatus: null, academyRole: null }).mode, 'checkout');
});

test('subscription sync grants only a paid active price and keeps manual plans', () => {
  const granted = decideSubscriptionSync(profile(), {
    eventCreated: 10,
    subscriptionId: 'sub_new',
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: 20,
    itemCount: 1,
    quantity: 1,
    matchedPlan: premium,
  });
  assert.equal(granted.action, 'apply');
  if (granted.action === 'apply') {
    assert.equal(granted.billing.plan, 'pro');
    assert.equal(granted.billing.planKey, 'premium');
    assert.equal(granted.billing.seats, null);
    assert.equal(granted.billing.setProvider, true);
  }

  const manual = decideSubscriptionSync(profile({ plan: 'academy', billingProvider: null }), {
    eventCreated: 10,
    subscriptionId: 'sub_new',
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: 20,
    itemCount: 1,
    quantity: 1,
    matchedPlan: academy20,
  });
  assert.deepEqual(manual, { action: 'ignore', reason: 'manual' });

  const stale = decideSubscriptionSync(profile({ billingProvider: 'stripe', billingEventCreated: 50, plan: 'pro' }), {
    eventCreated: 10,
    subscriptionId: 'sub_new',
    status: 'canceled',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    itemCount: 1,
    quantity: 1,
    matchedPlan: premium,
  });
  assert.deepEqual(stale, { action: 'ignore', reason: 'stale' });

  const firstFailure = decideSubscriptionSync(profile(), {
    eventCreated: 10,
    subscriptionId: 'sub_new',
    status: 'past_due',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: 20,
    itemCount: 1,
    quantity: 1,
    matchedPlan: premium,
  });
  assert.equal(firstFailure.action, 'apply');
  if (firstFailure.action === 'apply') assert.equal(firstFailure.billing.plan, 'free');

  const renewalFailure = decideSubscriptionSync(profile({
    plan: 'academy',
    billingProvider: 'stripe',
    planKey: 'academy_40',
    seats: 40,
    subscriptionStatus: 'active',
    stripeSubscriptionId: 'sub_old',
  }), {
    eventCreated: 10,
    subscriptionId: 'sub_old',
    status: 'past_due',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: 20,
    itemCount: 1,
    quantity: 1,
    matchedPlan: planByKey('academy_40'),
  });
  assert.equal(renewalFailure.action, 'apply');
  if (renewalFailure.action === 'apply') {
    assert.equal(renewalFailure.billing.plan, 'academy');
    assert.equal(renewalFailure.billing.seats, 40);
  }

  const ended = decideSubscriptionSync(profile({
    plan: 'pro',
    billingProvider: 'stripe',
    subscriptionStatus: 'active',
    stripeSubscriptionId: 'sub_old',
  }), {
    eventCreated: 12,
    subscriptionId: 'sub_old',
    status: 'canceled',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    itemCount: 1,
    quantity: 1,
    matchedPlan: premium,
  });
  assert.equal(ended.action, 'apply');
  if (ended.action === 'apply') {
    assert.equal(ended.billing.plan, 'free');
    assert.equal(ended.billing.setProvider, true);
  }

  const untilEnd = decideSubscriptionSync(profile({ plan: 'pro', billingProvider: 'stripe', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_old' }), {
    eventCreated: 12,
    subscriptionId: 'sub_old',
    status: 'active',
    cancelAtPeriodEnd: true,
    currentPeriodEnd: 99,
    itemCount: 1,
    quantity: 1,
    matchedPlan: premium,
  });
  assert.equal(untilEnd.action, 'apply');
  if (untilEnd.action === 'apply') {
    assert.equal(untilEnd.billing.plan, 'pro');
    assert.equal(untilEnd.billing.cancelAtPeriodEnd, true);
  }
});

test('risk holds suspend access and a second subscription does not replace an active one', () => {
  const disputed = decideSubscriptionSync(profile({ plan: 'pro', billingProvider: 'stripe', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_old' }), {
    eventCreated: 12,
    subscriptionId: 'sub_old',
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: 20,
    itemCount: 1,
    quantity: 1,
    matchedPlan: premium,
  }, { incomingHold: 'dispute' });
  assert.equal(disputed.action, 'apply');
  if (disputed.action === 'apply') {
    assert.equal(disputed.billing.plan, 'free');
    assert.equal(disputed.billing.hold, 'dispute');
  }

  const stillHeld = decideSubscriptionSync(profile({
    plan: 'free',
    billingProvider: 'stripe',
    billingHold: 'dispute',
    subscriptionStatus: 'active',
    stripeSubscriptionId: 'sub_old',
  }), {
    eventCreated: 13,
    subscriptionId: 'sub_old',
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: 20,
    itemCount: 1,
    quantity: 1,
    matchedPlan: premium,
  });
  assert.equal(stillHeld.action, 'apply');
  if (stillHeld.action === 'apply') assert.equal(stillHeld.billing.hold, 'dispute');

  const duplicate = decideSubscriptionSync(profile({
    plan: 'pro',
    billingProvider: 'stripe',
    subscriptionStatus: 'active',
    stripeSubscriptionId: 'sub_old',
  }), {
    eventCreated: 14,
    subscriptionId: 'sub_other',
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: 20,
    itemCount: 1,
    quantity: 1,
    matchedPlan: academy20,
  });
  assert.deepEqual(duplicate, { action: 'ignore', reason: 'duplicate' });

  const quantity = decideSubscriptionSync(profile(), {
    eventCreated: 10,
    subscriptionId: 'sub_new',
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: 20,
    itemCount: 1,
    quantity: 8,
    matchedPlan: academy20,
  });
  assert.equal(quantity.action, 'apply');
  if (quantity.action === 'apply') assert.equal(quantity.billing.plan, 'free');
});

test('checkout success is not fulfillment, and only a full refund suspends', () => {
  assert.equal(sessionShouldSync({ mode: 'subscription', payment_status: 'unpaid' }), false);
  assert.equal(sessionShouldSync({ mode: 'subscription', payment_status: 'paid' }), true);
  assert.equal(refundShouldSuspend({ amount: 300, amount_refunded: 300, refunded: true }), true);
  assert.equal(refundShouldSuspend({ amount: 300, amount_refunded: 100, refunded: false }), false);
  assert.equal(subscriptionIdFromInvoice({
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_123' } },
  }), 'sub_123');
  assert.deepEqual(RETIRED_LOOKUP_KEYS, ['det_academy_8', 'det_academy_15', 'det_academy_30']);
});

test('21% VAT is included in every plan total and repeats on later invoices', () => {
  const expected = [
    [300, 248, 52],
    [3000, 2479, 521],
    [4500, 3719, 781],
    [6000, 4959, 1041],
    [8000, 6612, 1388],
  ];
  assert.deepEqual(PUBLIC_PLANS.map((plan) => plan.amountCents), expected.map((row) => row[0]));
  for (const [total, base, vat] of expected) {
    const split = inclusiveVatBreakdown(total);
    assert.equal(split.baseCents, base);
    assert.equal(split.vatCents, vat);
    assert.equal(split.baseCents + split.vatCents, total);
    assert.equal(split.ratePercent, 21);
    const year = renewalVatBreakdowns(total, 12);
    assert.equal(year.length, 12);
    assert.ok(year.every((invoice) => invoice.baseCents === base && invoice.vatCents === vat && invoice.totalCents === total));
  }
  assert.equal(formatEuro(248), '2.48 €');
  assert.equal(formatEuro(52), '0.52 €');
});

test('checkout accepts only an active inclusive 21% tax rate', () => {
  const good = { id: 'txr_test_iva21', active: true, inclusive: true, percentage: 21, livemode: false };
  assert.equal(taxRateMismatch(good, 'test'), null);
  assert.equal(inclusiveTaxRateId(good, 'test'), 'txr_test_iva21');
  assert.equal(taxRateMismatch({ ...good, inclusive: false }, 'test'), 'exclusive');
  assert.equal(inclusiveTaxRateId({ ...good, inclusive: false }, 'test'), null);
  assert.equal(taxRateMismatch({ ...good, percentage: 10 }, 'test'), 'percentage');
  assert.equal(taxRateMismatch({ ...good, active: false }, 'test'), 'inactive');
  assert.equal(taxRateMismatch({ ...good, livemode: true }, 'test'), 'livemode');
  assert.equal(priceTaxBehaviorMismatch('unspecified'), null);
  assert.equal(priceTaxBehaviorMismatch('inclusive'), null);
  assert.equal(priceTaxBehaviorMismatch('exclusive'), 'exclusive_price');
  assert.equal(priceMismatch(premium, priceFor(premium, 'test', { tax_behavior: 'exclusive' }), 'test'), 'exclusive_price');
  assert.equal(priceMismatch(premium, priceFor(premium, 'test', { tax_behavior: 'unspecified' }), 'test'), null);
});

test('source does not contain Stripe secret keys', () => {
  const root = join(import.meta.dirname, '..');
  const skip = new Set(['node_modules', 'dist', '.git', '.netlify']);
  const pattern = /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]|whsec_[A-Za-z0-9]/;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (/\.(ts|tsx|js|mjs|md|sql|json|toml|html)$/.test(name) && name !== 'package-lock.json') files.push(path);
    }
  };
  walk(root);
  const hits = files.filter((path) => pattern.test(readFileSync(path, 'utf8')));
  assert.deepEqual(hits, []);
});
