import type Stripe from 'stripe';
import { PUBLIC_PLANS, type PublicPlan } from '../billingPlans.ts';
import {
  decideSubscriptionSync,
  idOf,
  paymentIntentIdFromCharge,
  priceMismatch,
  refundShouldSuspend,
  sessionShouldSync,
  subscriptionIdFromInvoice,
  userIdFromMetadata,
  type ApplyBilling,
  type BillingProfile,
  type PriceSnapshot,
  type RiskHold,
  type SubscriptionFact,
} from '../billingPolicy.ts';
import {
  adminClient,
  json,
  rawBody,
  stripeClient,
  stripeErrorCode,
  stripeSignature,
  type HandlerEvent,
  type HandlerResponse,
} from './billingHttp.ts';

type ProfileRow = {
  id: string;
  plan: string | null;
  billing_provider: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_plan_key: string | null;
  academy_seat_limit: number | null;
  billing_event_created: number | null;
  billing_hold: string | null;
};

const HANDLED = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.dispute.created',
  'charge.refunded',
  'radar.early_fraud_warning.created',
]);

function holdOf(value: string | null): BillingProfile['billingHold'] {
  if (value === 'dispute' || value === 'fraud_warning' || value === 'refund') return value;
  return null;
}

function profileFromRow(row: ProfileRow): BillingProfile {
  return {
    plan: row.plan ?? 'free',
    billingProvider: row.billing_provider === 'stripe' || row.billing_provider === 'manual' ? row.billing_provider : null,
    stripeSubscriptionId: row.stripe_subscription_id,
    subscriptionStatus: row.subscription_status,
    billingEventCreated: Number(row.billing_event_created ?? 0),
    billingHold: holdOf(row.billing_hold),
    planKey: row.subscription_plan_key,
    seats: row.academy_seat_limit,
  };
}

function matchPlan(price: PriceSnapshot, mode: 'live' | 'test'): PublicPlan | null {
  for (const plan of PUBLIC_PLANS) {
    if (priceMismatch(plan, price, mode) === null) return plan;
  }
  return null;
}

function factFromSubscription(subscription: Stripe.Subscription, matched: PublicPlan | null, eventCreated: number): SubscriptionFact {
  const items = subscription.items?.data ?? [];
  const first = items[0];
  return {
    eventCreated,
    subscriptionId: subscription.id,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: first?.current_period_end ?? null,
    itemCount: items.length,
    quantity: first?.quantity ?? null,
    matchedPlan: matched,
  };
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod !== 'POST') return json(405, { received: false });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = stripeClient();
  const admin = adminClient();
  if (!secret || !stripe || !admin) return json(503, { received: false });

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody(event), stripeSignature(event), secret, 300);
  } catch (error) {
    console.error('stripe webhook signature rejected', stripeErrorCode(error));
    return json(400, { received: false });
  }

  const liveAllowed = process.env.STRIPE_ALLOW_LIVE_CHARGES === 'true';
  const billingOn = process.env.STRIPE_BILLING_ENABLED === 'true';
  if (stripeEvent.livemode && !liveAllowed) {
    console.error('stripe webhook ignored live event while live charges are off', stripeEvent.id, stripeEvent.type);
    return json(200, { received: true, ignored: 'live_charges_off' });
  }
  if (!billingOn) {
    console.error('stripe webhook ignored because billing is off', stripeEvent.id, stripeEvent.type);
    return stripeEvent.livemode
      ? json(200, { received: true, ignored: 'billing_disabled' })
      : json(503, { received: false, ignored: 'billing_disabled' });
  }
  if (!HANDLED.has(stripeEvent.type)) return json(200, { received: true, ignored: 'unhandled' });

  const inserted = await admin.from('billing_events').insert({
    event_id: stripeEvent.id,
    event_type: stripeEvent.type,
    created_unix: stripeEvent.created,
  }).select('event_id');
  if (inserted.error) {
    if (inserted.error.code === '23505') return json(200, { received: true, duplicate: true });
    console.error('stripe webhook event store failed', stripeEvent.id);
    return json(500, { received: false });
  }

  try {
    await dispatch(stripe, admin, stripeEvent);
    return json(200, { received: true });
  } catch (error) {
    console.error('stripe webhook failed', stripeEvent.id, stripeEvent.type, stripeErrorCode(error));
    await admin.from('billing_events').delete().eq('event_id', stripeEvent.id);
    return json(500, { received: false });
  }
};

async function dispatch(
  stripe: Stripe,
  admin: NonNullable<ReturnType<typeof adminClient>>,
  stripeEvent: Stripe.Event,
) {
  const mode = stripeEvent.livemode ? 'live' : 'test';
  if (stripeEvent.type === 'checkout.session.completed' || stripeEvent.type === 'checkout.session.async_payment_succeeded' || stripeEvent.type === 'checkout.session.async_payment_failed') {
    const session = stripeEvent.data.object as Stripe.Checkout.Session;
    const allowGrant = stripeEvent.type === 'checkout.session.async_payment_failed' ? false : sessionShouldSync(session);
    if (stripeEvent.type !== 'checkout.session.async_payment_failed' && !allowGrant) return;
    const subscriptionId = idOf(session.subscription);
    if (!subscriptionId) return;
    await syncSubscription(stripe, admin, subscriptionId, stripeEvent.created, mode, {
      allowGrant,
      metadataUserId: userIdFromMetadata(session.metadata),
    });
    return;
  }

  if (stripeEvent.type.startsWith('customer.subscription.')) {
    const subscription = stripeEvent.data.object as Stripe.Subscription;
    await syncSubscription(stripe, admin, subscription.id, stripeEvent.created, mode, {
      allowGrant: true,
      metadataUserId: userIdFromMetadata(subscription.metadata),
    });
    return;
  }

  if (stripeEvent.type === 'invoice.paid' || stripeEvent.type === 'invoice.payment_failed') {
    const invoice = stripeEvent.data.object as Stripe.Invoice;
    const subscriptionId = subscriptionIdFromInvoice(invoice);
    if (!subscriptionId) return;
    await syncSubscription(stripe, admin, subscriptionId, stripeEvent.created, mode, { allowGrant: true });
    return;
  }

  if (stripeEvent.type === 'charge.dispute.created' || stripeEvent.type === 'radar.early_fraud_warning.created' || stripeEvent.type === 'charge.refunded') {
    const object = stripeEvent.data.object as { charge?: string | Stripe.Charge };
    const chargeId = stripeEvent.type === 'charge.refunded'
      ? (stripeEvent.data.object as Stripe.Charge).id
      : idOf(object.charge);
    if (!chargeId) return;
    const charge = stripeEvent.type === 'charge.refunded'
      ? stripeEvent.data.object as Stripe.Charge
      : await stripe.charges.retrieve(chargeId);
    const subscriptionId = await subscriptionIdForCharge(stripe, charge);
    if (!subscriptionId) return;
    let incoming: RiskHold = null;
    if (stripeEvent.type === 'charge.dispute.created') incoming = 'dispute';
    else if (stripeEvent.type === 'radar.early_fraud_warning.created') incoming = 'fraud_warning';
    else if (refundShouldSuspend(charge)) incoming = 'refund';
    await syncSubscription(stripe, admin, subscriptionId, stripeEvent.created, mode, { allowGrant: incoming == null, incomingHold: incoming });
  }
}

async function subscriptionIdForCharge(stripe: Stripe, charge: Stripe.Charge): Promise<string | null> {
  const paymentIntentId = paymentIntentIdFromCharge(charge);
  if (!paymentIntentId) return null;
  const payments = await stripe.invoicePayments.list({
    payment: { type: 'payment_intent', payment_intent: paymentIntentId },
    limit: 5,
  });
  for (const payment of payments.data) {
    const invoiceId = idOf(payment.invoice);
    if (!invoiceId) continue;
    const invoice = await stripe.invoices.retrieve(invoiceId);
    const subscriptionId = subscriptionIdFromInvoice(invoice);
    if (subscriptionId) return subscriptionId;
  }
  return null;
}

async function syncSubscription(
  stripe: Stripe,
  admin: NonNullable<ReturnType<typeof adminClient>>,
  subscriptionId: string,
  eventCreated: number,
  mode: 'live' | 'test',
  options: { allowGrant?: boolean; incomingHold?: RiskHold; metadataUserId?: string | null },
) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = idOf(subscription.customer);
  if (!customerId) return;
  const item = subscription.items?.data?.[0];
  const priceId = item && subscription.items.data.length === 1 && item.quantity === 1
    ? idOf(item.price)
    : null;
  let matched: PublicPlan | null = null;
  if (priceId) {
    const price = await stripe.prices.retrieve(priceId);
    matched = matchPlan(price, mode);
  }
  const customer = await stripe.customers.retrieve(customerId);
  if ('deleted' in customer && customer.deleted) return;
  const fromCustomer = userIdFromMetadata(customer.metadata);
  const fromSubscription = userIdFromMetadata(subscription.metadata);
  if (fromCustomer && fromSubscription && fromCustomer !== fromSubscription) return;
  const metadataUserId = options.metadataUserId ?? fromSubscription ?? fromCustomer;
  if (options.metadataUserId && fromCustomer && options.metadataUserId !== fromCustomer) return;
  if (options.metadataUserId && fromSubscription && options.metadataUserId !== fromSubscription) return;

  const row = await loadProfile(admin, customerId, metadataUserId ?? null);
  if (!row) return;
  const decision = decideSubscriptionSync(profileFromRow(row), factFromSubscription(subscription, matched, eventCreated), {
    allowGrant: options.allowGrant,
    incomingHold: options.incomingHold,
  });
  if (decision.action === 'ignore' && decision.reason === 'duplicate') {
    if (subscription.status !== 'canceled') {
      await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: true });
    }
    return;
  }
  if (decision.action === 'ignore') return;
  const applied = await applyDecision(admin, row.id, customerId, eventCreated, decision.billing);
  if (applied === 'duplicate' && subscription.status !== 'canceled') {
    await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: true });
  }
}

async function loadProfile(
  admin: NonNullable<ReturnType<typeof adminClient>>,
  customerId: string,
  metadataUserId: string | null,
): Promise<ProfileRow | null> {
  const byCustomer = await admin.from('profiles')
    .select('id, plan, billing_provider, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_plan_key, academy_seat_limit, billing_event_created, billing_hold')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (byCustomer.error) throw new Error('profile_read_failed');
  if (byCustomer.data) {
    const row = byCustomer.data as ProfileRow;
    if (metadataUserId && row.id !== metadataUserId) return null;
    return row;
  }
  if (!metadataUserId) return null;
  const byUser = await admin.from('profiles')
    .select('id, plan, billing_provider, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_plan_key, academy_seat_limit, billing_event_created, billing_hold')
    .eq('id', metadataUserId)
    .maybeSingle();
  if (byUser.error) throw new Error('profile_read_failed');
  if (!byUser.data) return null;
  const row = byUser.data as ProfileRow;
  if (row.stripe_customer_id && row.stripe_customer_id !== customerId) return null;
  return row;
}

async function applyDecision(
  admin: NonNullable<ReturnType<typeof adminClient>>,
  userId: string,
  customerId: string,
  eventCreated: number,
  billing: ApplyBilling,
): Promise<string> {
  const { data, error } = await admin.rpc('apply_stripe_billing', {
    uid: userId,
    event_created: eventCreated,
    next_plan: billing.plan,
    next_plan_key: billing.planKey,
    next_status: billing.status,
    next_subscription_id: billing.subscriptionId,
    next_customer_id: customerId,
    next_seats: billing.seats,
    next_period_end: billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd * 1000).toISOString() : null,
    next_cancel_at_period_end: billing.cancelAtPeriodEnd,
    next_hold: billing.hold,
    set_provider: billing.setProvider,
  });
  if (error) throw new Error('apply_failed');
  const code = typeof data === 'string' ? data : '';
  if (code !== 'ok' && code !== 'manual' && code !== 'stale' && code !== 'duplicate') {
    console.error('stripe billing apply refused', code || 'empty');
  }
  return code;
}
