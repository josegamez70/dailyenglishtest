import React, { useEffect, useState } from 'react';
import { accessToken } from '../auth';
import { formatEuro, isHostedStripeUrl, PUBLIC_PLANS, type PlanKey } from '../billingPlans';

type PanelVariant = 'landing' | 'profile' | 'paywall';
type ExampleState = 'paywall' | 'active' | null;

type BillingAccount = {
  mode: 'checkout' | 'portal' | 'blocked';
  reason: string | null;
  cancelAtPeriodEnd: boolean;
  planKey: string | null;
};

const BLOCKED: Record<string, string> = {
  tester: 'This tester account is managed by the site owner. Checkout is not used.',
  manual_academy: 'This academy was set up by the site owner, not by Stripe.',
  manual_paid: 'This paid plan was set up by the site owner, not by Stripe.',
  academy_student: 'Your academy covers your lessons. You do not need a personal subscription.',
};

function exampleFromLocation(): ExampleState {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('example');
  if (value === 'paywall' || value === 'active') return value;
  return null;
}

function returnNote(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('billing');
  if (value === 'success') {
    return 'Stripe sent you back here. Your plan changes only after the signed webhook. This page does not unlock lessons by itself.';
  }
  if (value === 'cancel') return 'Checkout was cancelled. No charge was made.';
  return null;
}

export function PricingPanel({
  signedIn,
  plan,
  academyRole,
  variant,
  onSignIn,
}: {
  signedIn: boolean;
  plan: string | null;
  academyRole: 'owner' | 'student' | null;
  variant: PanelVariant;
  onSignIn?: () => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [academyKey, setAcademyKey] = useState<PlanKey>('academy_20');
  const [note, setNote] = useState<string | null>(returnNote);
  const [busy, setBusy] = useState(false);
  const example = exampleFromLocation();
  const showExample = !enabled;
  const premium = PUBLIC_PLANS[0];
  const academies = PUBLIC_PLANS.filter((item) => item.seats != null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const token = await accessToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch('/api/billing-status', { headers, signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json() as { enabled?: boolean; account?: BillingAccount | null };
        if (controller.signal.aborted) return;
        setEnabled(body.enabled === true);
        setAccount(body.account ?? null);
      } catch {
        if (!controller.signal.aborted) setEnabled(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [signedIn]);

  const start = async (planKey: PlanKey) => {
    if (busy) return;
    if (!enabled) {
      setNote('Billing is not active. No charge was made.');
      return;
    }
    if (academyRole === 'student') {
      setNote(BLOCKED.academy_student);
      return;
    }
    if (!signedIn) {
      onSignIn?.();
      return;
    }
    if (account?.mode === 'blocked') {
      setNote(BLOCKED[account.reason ?? ''] ?? 'This account is not billed through Stripe.');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const token = await accessToken();
      const portal = account?.mode === 'portal';
      const response = await fetch(portal ? '/api/billing-portal' : '/api/billing-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: portal ? '{}' : JSON.stringify({ planKey }),
      });
      const body = await response.json() as { url?: string; message?: string };
      if (body.url && isHostedStripeUrl(body.url)) {
        window.location.assign(body.url);
        return;
      }
      setNote(body.message || 'Billing could not be started. No charge was made.');
    } catch {
      setNote('Billing could not be started. No charge was made.');
    } finally {
      setBusy(false);
    }
  };

  const buttonLabel = (kind: 'premium' | 'academy') => {
    if (showExample && example === 'active') return 'Manage billing — preview only';
    if (showExample) return kind === 'premium' ? 'Upgrade — preview only' : 'Choose academy — preview only';
    if (!signedIn) return 'Sign in to subscribe';
    if (account?.mode === 'portal') return 'Manage billing';
    return kind === 'premium' ? 'Continue to secure checkout' : 'Continue to secure checkout';
  };

  return (
    <section id="plans" aria-labelledby="plans-heading" className="mx-auto mt-8 w-full max-w-3xl text-left">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="plans-heading" className="text-2xl font-bold text-[#172033] dark:text-white">Plans</h2>
        {showExample && (
          <span className="inline-flex rounded-full border border-teal-700 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-teal-800 dark:border-teal-300 dark:text-teal-200">
            Example
          </span>
        )}
      </div>
      {showExample && (
        <p className="mt-2 text-sm font-semibold text-teal-800 dark:text-teal-200" role="status">
          Example — billing is not active. Choosing a plan does not charge you.
        </p>
      )}
      {(variant === 'paywall' || (showExample && example === 'paywall')) && (
        <p className="mt-3 rounded-xl border border-teal-700/40 bg-white px-4 py-3 text-base text-slate-800 dark:border-teal-300/40 dark:bg-[#22304a] dark:text-slate-100">
          {showExample && example === 'paywall' ? 'Example state: the 3 free lessons are used up. ' : ''}
          You have used your 3 free lessons. They do not reset. Premium is {formatEuro(premium.amountCents)} per month when billing is on.
        </p>
      )}
      {showExample && example === 'active' && (
        <p className="mt-3 rounded-xl border border-teal-700/40 bg-white px-4 py-3 text-base dark:border-teal-300/40 dark:bg-[#22304a]">
          Example state: Premium is active. Manage billing does not open Stripe and does not charge.
        </p>
      )}
      <p className="mt-3 text-base text-slate-700 dark:text-slate-200">
        3 free lessons stay on every account. They do not expire, and they are not a free trial. You do not enter a card to get them.
      </p>
      {account?.cancelAtPeriodEnd && (
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">Your subscription is set to end at the close of this period. Lessons stay available until then.</p>
      )}
      {academyRole === 'student' && (
        <p className="mt-2 text-base">{BLOCKED.academy_student}</p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-teal-700/40 bg-white p-5 dark:border-teal-300/40 dark:bg-[#22304a]">
          <h3 className="text-lg font-bold">{premium.name}</h3>
          <p className="mt-1 text-2xl font-bold text-teal-800 dark:text-teal-200">{formatEuro(premium.amountCents)} <span className="text-base font-semibold">/ month</span></p>
          <p className="mt-2 text-base text-slate-700 dark:text-slate-200">{premium.summary}</p>
          <button
            type="button"
            onClick={() => { void start('premium'); }}
            disabled={busy}
            aria-busy={busy}
            className="mt-4 w-full rounded-lg bg-teal-700 px-4 py-3 text-base font-bold text-white hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
          >
            {busy ? 'Please wait…' : buttonLabel('premium')}
          </button>
        </article>

        <article className="rounded-2xl border border-teal-700/40 bg-white p-5 dark:border-teal-300/40 dark:bg-[#22304a]">
          <h3 className="text-lg font-bold">Academy</h3>
          <p className="mt-2 text-base text-slate-700 dark:text-slate-200">A fixed monthly price for the whole academy. Not a charge per student.</p>
          <fieldset className="mt-3 space-y-2">
            <legend className="text-sm font-semibold">Package</legend>
            {academies.map((item) => (
              <label key={item.key} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 ${academyKey === item.key ? 'border-teal-700 bg-teal-50 dark:border-teal-300 dark:bg-teal-400/10' : 'border-slate-300 dark:border-slate-500'}`}>
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="academy-package"
                    value={item.key}
                    checked={academyKey === item.key}
                    onChange={() => setAcademyKey(item.key)}
                  />
                  <span>Up to {item.seats} students</span>
                </span>
                <span className="font-bold">{formatEuro(item.amountCents)} / month</span>
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            onClick={() => { void start(academyKey); }}
            disabled={busy}
            aria-busy={busy}
            className="mt-4 w-full rounded-lg bg-teal-700 px-4 py-3 text-base font-bold text-white hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
          >
            {busy ? 'Please wait…' : buttonLabel('academy')}
          </button>
        </article>
      </div>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        Prices are in euro per month. Tax is not added in checkout. {plan === 'pro' ? 'Premium is on this account.' : ''}
        {' '}Card details stay on Stripe’s page. The plan updates only after Stripe notifies the server.
      </p>
      {note && <p className="mt-3 text-base font-semibold" role="status">{note}</p>}
    </section>
  );
}
