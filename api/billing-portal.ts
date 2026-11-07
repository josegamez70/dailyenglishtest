import { isHostedStripeUrl } from '../billingPlans.ts';
import { billingReadiness, billingUrls, readEmptyBody } from '../billingPolicy.ts';
import {
  adminClient,
  bearerToken,
  json,
  rawBody,
  requireUser,
  stripeClient,
  stripeErrorCode,
  type HandlerEvent,
  type HandlerResponse,
} from './billingHttp.ts';

const SAFE_FAILURE = 'Billing management is not available. No charge was made.';

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: json(200, {}).headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: SAFE_FAILURE });
  if (!billingReadiness(process.env).checkout) {
    return json(503, { ok: false, code: 'billing_off', message: 'Billing is not active. No charge was made.' });
  }
  const urls = billingUrls(process.env);
  const stripe = stripeClient();
  const admin = adminClient();
  if (!urls || !stripe || !admin) return json(503, { ok: false, message: SAFE_FAILURE });

  const text = rawBody(event);
  if (text) {
    try {
      if (!readEmptyBody(JSON.parse(text))) return json(400, { ok: false, message: SAFE_FAILURE });
    } catch {
      return json(400, { ok: false, message: SAFE_FAILURE });
    }
  }

  const token = bearerToken(event);
  if (!token) return json(401, { ok: false, message: 'Sign in to manage billing.' });
  const user = await requireUser(admin, token);
  if (!user) return json(401, { ok: false, message: 'Sign in to manage billing.' });

  const profile = await admin.from('profiles').select('stripe_customer_id, billing_provider').eq('id', user.id).maybeSingle();
  const row = profile.data as { stripe_customer_id?: string | null; billing_provider?: string | null } | null;
  if (profile.error || !row?.stripe_customer_id || row.billing_provider !== 'stripe') {
    return json(409, { ok: false, message: SAFE_FAILURE });
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: urls.portalReturn,
    });
    if (!isHostedStripeUrl(portal.url)) return json(502, { ok: false, message: SAFE_FAILURE });
    return json(200, { ok: true, action: 'portal', url: portal.url });
  } catch (error) {
    console.error('billing portal failed', stripeErrorCode(error));
    return json(502, { ok: false, message: SAFE_FAILURE });
  }
};
