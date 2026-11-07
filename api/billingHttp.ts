import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { keyMode } from '../billingPolicy.ts';

export type HandlerEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined> | null;
  isBase64Encoded?: boolean;
  rawBody?: string;
};

export type HandlerResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

export const jsonHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

export function json(status: number, body: unknown, headers = jsonHeaders): HandlerResponse {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

export function bearerToken(event: HandlerEvent): string | null {
  const headers = event.headers ?? {};
  const raw = headers.authorization || headers.Authorization || '';
  const match = String(raw).match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? null;
}

export function rawBody(event: HandlerEvent): string {
  if (typeof event.rawBody === 'string') return event.rawBody;
  if (!event.body) return '';
  if (event.isBase64Encoded) return Buffer.from(event.body, 'base64').toString('utf8');
  return event.body;
}

export function stripeSignature(event: HandlerEvent): string {
  const headers = event.headers ?? {};
  return headers['stripe-signature'] || headers['Stripe-Signature'] || '';
}

export function adminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  const mode = keyMode(key);
  if (!key || !mode) return null;
  return new Stripe(key, { apiVersion: '2026-09-30.endive', typescript: true });
}

export function stripeErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'stripe_error';
  const code = (error as { code?: unknown }).code;
  const type = (error as { type?: unknown }).type;
  return typeof code === 'string' ? code : typeof type === 'string' ? type : 'stripe_error';
}

export async function requireUser(admin: SupabaseClient, token: string) {
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export const PROFILE_BILLING_COLUMNS = 'id, plan, billing_provider, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_plan_key, academy_seat_limit, billing_event_created, billing_hold, cancel_at_period_end';
