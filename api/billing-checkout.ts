import { isHostedStripeUrl, planByKey } from '../billingPlans.ts';
import {
  billingReadiness,
  billingUrls,
  checkoutEligibility,
  checkoutIdempotencyKey,
  keyMode,
  inclusiveTaxRateId,
  makeIntegrationIdentifier,
  priceMismatch,
  randomLetterSuffix,
  readPlanRequest,
  type CheckoutAccount,
} from '../billingPolicy.ts';
import {
  adminClient,
  bearerToken,
  json,
  PROFILE_BILLING_COLUMNS,
  rawBody,
  requireUser,
  stripeClient,
  stripeErrorCode,
  type HandlerEvent,
  type HandlerResponse,
} from './billingHttp.ts';

const BLOCKING = new Set(['active', 'past_due', 'unpaid', 'paused', 'trialing']);
const SAFE_FAILURE = 'Billing could not be started. No charge was made.';

type ProfileRow = {
  id: string;
  plan?: string | null;
  billing_provider?: string | null;
  stripe_customer_id?: string | null;
  subscription_status?: string | null;
};

function providerOf(value: string | null | undefined): CheckoutAccount['billingProvider'] {
  if (value === 'stripe' || value === 'manual') return value;
  return null;
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: json(200, {}).headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: SAFE_FAILURE });

  const readiness = billingReadiness(process.env);
  if (!readiness.checkout) return json(503, { ok: false, code: 'billing_off', message: 'Billing is not active. No charge was made.' });

  const urls = billingUrls(process.env);
  const mode = keyMode(process.env.STRIPE_SECRET_KEY);
  const stripe = stripeClient();
  const admin = adminClient();
  if (!urls || !mode || !stripe || !admin) return json(503, { ok: false, code: 'billing_off', message: SAFE_FAILURE });

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody(event) || '');
  } catch {
    return json(400, { ok: false, message: SAFE_FAILURE });
  }
  const request = readPlanRequest(parsed);
  if (!request.ok) return json(400, { ok: false, message: SAFE_FAILURE });
  const plan = planByKey(request.planKey);
  if (!plan) return json(400, { ok: false, message: SAFE_FAILURE });

  const token = bearerToken(event);
  if (!token) return json(401, { ok: false, message: 'Sign in to subscribe.' });
  const user = await requireUser(admin, token);
  if (!user) return json(401, { ok: false, message: 'Sign in to subscribe.' });

  const profileResult = await admin.from('profiles').select(PROFILE_BILLING_COLUMNS).eq('id', user.id).maybeSingle();
  if (profileResult.error || !profileResult.data) return json(503, { ok: false, message: SAFE_FAILURE });
  const profile = profileResult.data as ProfileRow;
  const membership = await admin.from('academy_members').select('user_id').eq('user_id', user.id).maybeSingle();
  if (membership.error) return json(503, { ok: false, message: SAFE_FAILURE });

  const eligibility = checkoutEligibility({
    plan: profile.plan ?? 'free',
    billingProvider: providerOf(profile.billing_provider),
    subscriptionStatus: profile.subscription_status ?? null,
    academyRole: membership.data ? 'student' : null,
  });
  if (!eligibility.ok) return json(409, { ok: false, code: eligibility.reason, message: 'This account is not billed through Stripe.' });

  try {
    if (eligibility.mode === 'portal') {
      if (!profile.stripe_customer_id) return json(503, { ok: false, message: SAFE_FAILURE });
      const portal = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: urls.portalReturn,
      });
      if (!isHostedStripeUrl(portal.url)) return json(502, { ok: false, message: SAFE_FAILURE });
      return json(200, { ok: true, action: 'portal', url: portal.url });
    }

    const priceId = process.env[plan.envPrice]?.trim() ?? '';
    const taxRateId = process.env.STRIPE_TAX_RATE_IVA_21?.trim() ?? '';
    const price = await stripe.prices.retrieve(priceId);
    const taxRate = await stripe.taxRates.retrieve(taxRateId);
    if (priceMismatch(plan, price, mode) || !inclusiveTaxRateId(taxRate, mode)) {
      return json(503, { ok: false, code: 'price_rejected', message: SAFE_FAILURE });
    }

    let customerId = profile.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      }, { idempotencyKey: `customer_${user.id}` });
      const saved = await admin.from('profiles')
        .update({ stripe_customer_id: customer.id })
        .eq('id', user.id)
        .is('stripe_customer_id', null)
        .select('stripe_customer_id')
        .maybeSingle();
      if (saved.error) return json(503, { ok: false, message: SAFE_FAILURE });
      customerId = (saved.data as { stripe_customer_id?: string } | null)?.stripe_customer_id || customer.id;
      const current = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle();
      if (current.data && (current.data as { stripe_customer_id?: string }).stripe_customer_id) {
        customerId = (current.data as { stripe_customer_id: string }).stripe_customer_id;
      }
    }

    const existing = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
    if (existing.has_more) return json(503, { ok: false, message: SAFE_FAILURE });
    if (existing.data.some((subscription) => BLOCKING.has(subscription.status))) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: urls.portalReturn,
      });
      if (!isHostedStripeUrl(portal.url)) return json(502, { ok: false, message: SAFE_FAILURE });
      return json(200, { ok: true, action: 'portal', url: portal.url });
    }
    for (const subscription of existing.data) {
      if (subscription.status === 'incomplete') {
        await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false });
      }
    }

    const suffix = randomLetterSuffix();
    const identifier = makeIntegrationIdentifier(suffix);
    if (!identifier) return json(500, { ok: false, message: SAFE_FAILURE });
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ui_mode: 'hosted_page',
      origin_context: 'web',
      customer: customerId,
      client_reference_id: user.id,
      locale: 'en',
      line_items: [{ price: price.id, quantity: 1, tax_rates: [taxRate.id] }],
      success_url: urls.success,
      cancel_url: urls.cancel,
      integration_identifier: identifier,
      subscription_data: {
        description: plan.checkoutDescription,
        billing_mode: { type: 'flexible' },
        default_tax_rates: [taxRate.id],
        metadata: { supabase_user_id: user.id, plan_key: plan.key },
      },
      metadata: { supabase_user_id: user.id, plan_key: plan.key },
    }, { idempotencyKey: checkoutIdempotencyKey(user.id, plan.key) });

    if (!session.url || !isHostedStripeUrl(session.url)) return json(502, { ok: false, message: SAFE_FAILURE });
    return json(200, { ok: true, action: 'checkout', url: session.url });
  } catch (error) {
    console.error('billing checkout failed', stripeErrorCode(error));
    return json(502, { ok: false, message: SAFE_FAILURE });
  }
};
