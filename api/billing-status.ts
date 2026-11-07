import { billingReadiness, checkoutEligibility, type CheckoutAccount } from '../billingPolicy.ts';
import {
  adminClient,
  bearerToken,
  json,
  jsonHeaders,
  PROFILE_BILLING_COLUMNS,
  requireUser,
  type HandlerEvent,
  type HandlerResponse,
} from './billingHttp.ts';

type ProfileRow = {
  plan?: string | null;
  billing_provider?: string | null;
  subscription_status?: string | null;
  subscription_plan_key?: string | null;
  cancel_at_period_end?: boolean | null;
};

function providerOf(value: string | null | undefined): CheckoutAccount['billingProvider'] {
  if (value === 'stripe' || value === 'manual') return value;
  return null;
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: jsonHeaders, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { enabled: false, preview: true, account: null });

  const readiness = billingReadiness(process.env);
  const preview = { enabled: false, preview: true, account: null };
  if (!readiness.checkout) return json(200, preview);

  const token = bearerToken(event);
  if (!token) return json(200, { enabled: true, preview: false, account: null });

  const admin = adminClient();
  if (!admin) return json(200, preview);
  const user = await requireUser(admin, token);
  if (!user) return json(200, { enabled: true, preview: false, account: null });

  const profile = await admin.from('profiles').select(PROFILE_BILLING_COLUMNS).eq('id', user.id).maybeSingle();
  if (profile.error || !profile.data) return json(200, preview);
  const row = profile.data as ProfileRow;
  const membership = await admin.from('academy_members').select('user_id').eq('user_id', user.id).maybeSingle();
  if (membership.error) return json(200, preview);

  const account: CheckoutAccount = {
    plan: row.plan ?? 'free',
    billingProvider: providerOf(row.billing_provider),
    subscriptionStatus: row.subscription_status ?? null,
    academyRole: membership.data ? 'student' : row.plan === 'academy' ? 'owner' : null,
  };
  const eligibility = checkoutEligibility(account);
  return json(200, {
    enabled: true,
    preview: false,
    account: {
      mode: eligibility.ok ? eligibility.mode : 'blocked',
      reason: eligibility.ok ? null : eligibility.reason,
      subscriptionStatus: row.subscription_status ?? null,
      cancelAtPeriodEnd: row.cancel_at_period_end === true,
      planKey: row.subscription_plan_key ?? null,
    },
  });
};
