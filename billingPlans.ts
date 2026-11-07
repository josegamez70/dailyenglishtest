/** Public plan catalog. Amounts are the owner-corrected monthly prices. No Stripe IDs here. */

export type PlanKey = 'premium' | 'academy_20' | 'academy_40' | 'academy_70' | 'academy_100';

export type PublicPlan = {
  key: PlanKey;
  name: string;
  amountCents: number;
  currency: 'eur';
  interval: 'month';
  seats: number | null;
  lookupKey: string;
  envPrice: string;
  envProduct: string;
  appPlan: 'pro' | 'academy';
  summary: string;
  checkoutDescription: string;
};

export const PUBLIC_PLANS: readonly PublicPlan[] = [
  {
    key: 'premium',
    name: 'Premium',
    amountCents: 300,
    currency: 'eur',
    interval: 'month',
    seats: null,
    lookupKey: 'det_premium_monthly',
    envPrice: 'STRIPE_PRICE_PREMIUM',
    envProduct: 'STRIPE_PRODUCT_PREMIUM',
    appPlan: 'pro',
    summary: 'Unlimited lessons for one learner.',
    checkoutDescription: 'Daily English Test Premium',
  },
  {
    key: 'academy_20',
    name: 'Academy · up to 20',
    amountCents: 3000,
    currency: 'eur',
    interval: 'month',
    seats: 20,
    lookupKey: 'det_academy_20',
    envPrice: 'STRIPE_PRICE_ACADEMY_20',
    envProduct: 'STRIPE_PRODUCT_ACADEMY_20',
    appPlan: 'academy',
    summary: 'One monthly price for up to 20 students.',
    checkoutDescription: 'Daily English Test Academy, up to 20 students',
  },
  {
    key: 'academy_40',
    name: 'Academy · up to 40',
    amountCents: 4500,
    currency: 'eur',
    interval: 'month',
    seats: 40,
    lookupKey: 'det_academy_40',
    envPrice: 'STRIPE_PRICE_ACADEMY_40',
    envProduct: 'STRIPE_PRODUCT_ACADEMY_40',
    appPlan: 'academy',
    summary: 'One monthly price for up to 40 students.',
    checkoutDescription: 'Daily English Test Academy, up to 40 students',
  },
  {
    key: 'academy_70',
    name: 'Academy · up to 70',
    amountCents: 6000,
    currency: 'eur',
    interval: 'month',
    seats: 70,
    lookupKey: 'det_academy_70',
    envPrice: 'STRIPE_PRICE_ACADEMY_70',
    envProduct: 'STRIPE_PRODUCT_ACADEMY_70',
    appPlan: 'academy',
    summary: 'One monthly price for up to 70 students.',
    checkoutDescription: 'Daily English Test Academy, up to 70 students',
  },
  {
    key: 'academy_100',
    name: 'Academy · up to 100',
    amountCents: 8000,
    currency: 'eur',
    interval: 'month',
    seats: 100,
    lookupKey: 'det_academy_100',
    envPrice: 'STRIPE_PRICE_ACADEMY_100',
    envProduct: 'STRIPE_PRODUCT_ACADEMY_100',
    appPlan: 'academy',
    summary: 'One monthly price for up to 100 students.',
    checkoutDescription: 'Daily English Test Academy, up to 100 students',
  },
];

export const BILLING_SUCCESS_PATH = '/profile?billing=success';
export const BILLING_CANCEL_PATH = '/profile?billing=cancel';
export const BILLING_PORTAL_RETURN_PATH = '/profile';

export function planByKey(key: string): PublicPlan | null {
  return PUBLIC_PLANS.find((plan) => plan.key === key) ?? null;
}

export function formatEuro(cents: number): string {
  const euros = cents / 100;
  return Number.isInteger(euros) ? `${euros} €` : `${euros.toFixed(2)} €`;
}

export function isHostedStripeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:'
      && (parsed.hostname === 'checkout.stripe.com' || parsed.hostname === 'billing.stripe.com');
  } catch {
    return false;
  }
}
