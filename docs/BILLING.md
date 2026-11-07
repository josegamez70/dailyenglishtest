# Billing setup

Payments are **off**. Checkout returns an error, and the site shows an example plan picker that does not charge, until the flags and secrets below are set. Do not turn this on for `dailyenglishtest.es` until José María approves it. No webhook endpoint and no Customer Portal configuration were created in Stripe.

Verified by a read-only lookup on the live account `acct_1RjMnfD66URNCYcO` (7 Nov 2026). These ids are configuration, not secrets. The server still checks currency, amount, interval, product, lookup key, and capacity on the Price object. A client cannot send a price id.

| Plan | Price | Lookup key | Live price id | Live product |
| --- | --- | --- | --- | --- |
| Premium, one learner | 3 € / month | `det_premium_monthly` | `price_1UZAQeD66URNCYcOYdbZxyM1` | `prod_VaKlT63gAOYYpv` |
| Academy, up to 20 students | 30 € / month | `det_academy_20` | `price_1UZA8OD66URNCYcOPqLPrd6C` | `prod_VaKo9BcJRQ2Ecv` |
| Academy, up to 40 students | 45 € / month | `det_academy_40` | `price_1UZA8UD66URNCYcOcVm2hP5J` | `prod_VaKo9BcJRQ2Ecv` |
| Academy, up to 70 students | 60 € / month | `det_academy_70` | `price_1UZA8XD66URNCYcOcJGLVvoA` | `prod_VaKo9BcJRQ2Ecv` |
| Academy, up to 100 students | 80 € / month | `det_academy_100` | `price_1UZA8YD66URNCYcOTIepFerZ` | `prod_VaKo9BcJRQ2Ecv` |

Do **not** use the archived Premium price `price_1UZA5yD66URNCYcO98GAaLbD` (5 €, inactive, nickname “Premium mensual (antiguo 5 EUR)”). Old academy lookup keys `det_academy_8`, `det_academy_15`, and `det_academy_30` are rejected. Quantities are always 1. These are not per-student charges. There is no trial. The 3 free lessons stay lifetime lessons.

Academy prices share one Stripe product, so Checkout and invoices show one product name for every academy package. The site labels the seat tier before redirect, and the subscription description names the package. Splitting into four products would make the invoice line clearer. That was not changed.

## 21% VAT included

Every displayed total already includes 21% VAT for one learner and for academies. VAT is not added on top. The base is the total divided by 1.21, rounded to the nearest cent. VAT is the remainder, so the two parts add up to the total.

| Total | Base | VAT 21% |
| --- | --- | --- |
| 3 € | 2.48 € | 0.52 € |
| 30 € | 24.79 € | 5.21 € |
| 45 € | 37.19 € | 7.81 € |
| 60 € | 49.59 € | 10.41 € |
| 80 € | 66.12 € | 13.88 € |

The same split applies to every monthly invoice. Checkout does not use Stripe Tax (`automatic_tax` is not set). It attaches one manual tax rate, and only after the server has read that rate and checked that it is active, inclusive, and exactly 21%. An exclusive rate, a different percentage, an inactive rate, or a missing rate keeps Checkout off.

Read-only check on 7 Nov 2026:

- All five live prices have `tax_behavior: unspecified`. That is compatible with a manual inclusive tax rate. The rate’s `inclusive: true` flag keeps the customer total equal to the price. The prices do not need to be replaced for this path.
- `tax_behavior: exclusive` would put tax on top of the total. Checkout rejects that price.
- Changing `unspecified` to `inclusive` on a price is permanent. This change does not do that. Do it only if you later choose Stripe Tax and do not want to rely on the account default.
- Tax settings are `status: active`. The default tax behavior is `inferred_by_currency` (EUR would be inclusive if Stripe Tax were used). The preset tax code on the settings is `txcd_10000000`. No tax registrations are on the account, so Stripe Tax would collect nothing. Leave `automatic_tax` off. See [Tax rates](https://docs.stripe.com/tax/tax-rates) and [tax behavior](https://docs.stripe.com/tax/products-prices-tax-codes-tax-behavior).
- No 21% tax rate was created or attached by this change.

Create the rate in the Stripe Dashboard, test mode first: Tax rates → inclusive, 21%, display name `VAT`. Do not mark it exclusive. Copy its id into `STRIPE_TAX_RATE_IVA_21`. A test key must use a test-mode rate. A live key must use a live rate. The server checks that match.

Checkout sets that rate on the line item and as the subscription’s default tax rate, so the first invoice and later renewal invoices show the included VAT. Do not turn on tax ID collection. An exempt or reverse-charge customer would pay less than the published total, and this integration does not do that.

Before any charge, José María still has to confirm that invoices may show 21% VAT. The site does not state a VAT number, and it does not change the existing note that he is not registered as self-employed (autónomo). That confirmation is a blocker. This page is not tax advice.

## Environment names

Set these in Netlify (or the host), not in the repo. Prefer a [restricted API key](https://docs.stripe.com/keys.md) (`rk_`) with Customers write, Checkout Sessions write, Customer Portal write, Subscriptions read/write, Prices read, Products read, Tax Rates read, Invoices read, Charges read, and Disputes read. Use a separate key for test and live. Do not put the key in client code, logs, or this file.

| Name | Purpose |
| --- | --- |
| `STRIPE_BILLING_ENABLED` | Must be the exact text `true` or every charge path stays off. |
| `STRIPE_ALLOW_LIVE_CHARGES` | Must be the exact text `true` before a live key (`rk_live_` or `sk_live_`) can start Checkout. Leave unset. |
| `STRIPE_SECRET_KEY` | Restricted key. Test values use the test prefix. Live values also need the flag above. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from the webhook endpoint. Required before Checkout will start. |
| `APP_BASE_URL` | Site origin only, such as `https://dailyenglishtest.es`. The server builds the return URLs. The browser cannot choose them. |
| `SUPABASE_URL` | Already used by the lesson function. |
| `SUPABASE_SERVICE_ROLE_KEY` | Already used by the lesson function. Server only. |
| `STRIPE_PRICE_PREMIUM` | Price id for Premium. |
| `STRIPE_PRODUCT_PREMIUM` | Product id for Premium. |
| `STRIPE_PRICE_ACADEMY_20` | Price id for up to 20 students. |
| `STRIPE_PRODUCT_ACADEMY_20` | Product id for that price. |
| `STRIPE_PRICE_ACADEMY_40` | Price id for up to 40 students. |
| `STRIPE_PRODUCT_ACADEMY_40` | Product id for that price. |
| `STRIPE_PRICE_ACADEMY_70` | Price id for up to 70 students. |
| `STRIPE_PRODUCT_ACADEMY_70` | Product id for that price. |
| `STRIPE_PRICE_ACADEMY_100` | Price id for up to 100 students. |
| `STRIPE_PRODUCT_ACADEMY_100` | Product id for that price. |
| `STRIPE_TAX_RATE_IVA_21` | Id of the active inclusive 21% tax rate. Required before Checkout can start. |

For a live key, the price and product values must be the ids in the table above. A test key must use **different** test-mode price and product ids with the same amounts, currency (`eur`), monthly interval, lookup keys, and metadata (`plan=pro` on Premium, `max_students` of `20`, `40`, `70`, or `100` on academy prices). This repo does not create those test prices.

Leave both flags unset on production and on the Netlify deploy preview.

## Database

Run `supabase/migrations/20261107_billing.sql` in the Supabase SQL editor before enabling the flag. It adds billing columns, an event-id table, and `apply_stripe_billing`. Row level security and the existing profile trigger stop signed-in users from writing plan, seat count, or Stripe ids. Only the service role calls that function.

Existing `tester` and manual `academy` rows are left alone. Webhook updates do not delete students, results, or saved lessons. A lapsed academy stops new joins and stops unlimited lessons. The member list remains. Manual academies still default to 8 seats when they are created by hand. Stripe packages set 20, 40, 70, or 100.

## URLs

The server builds these from `APP_BASE_URL`. Do not accept them from the browser.

- Checkout success: `/profile?billing=success`
- Checkout cancel: `/profile?billing=cancel`
- Customer Portal return: `/profile`

The success page does not grant the plan. Access changes only in the webhook.

## Webhook

Create the endpoint in the Stripe Dashboard (test mode first). This code does not create it.

- Test endpoint: `https://<deploy-preview-host>/api/stripe-webhook` while you are testing, or the Stripe CLI forwarder to `http://localhost:8888/api/stripe-webhook`
- Production endpoint, only after approval: `https://dailyenglishtest.es/api/stripe-webhook`

Subscribe only to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `charge.dispute.created`
- `charge.refunded`
- `radar.early_fraud_warning.created`

The function verifies the raw body with the signing secret (300 second tolerance), stores the event id, and ignores older subscription snapshots. A second active subscription is cancelled with proration so the stored one remains. Disputes and early fraud warnings suspend Stripe-managed access without deleting data. A full refund suspends access. A later paid invoice restores a refund hold, not a dispute or fraud hold. Those two stay until you clear `billing_hold` in the database. `past_due` keeps access during Stripe’s retries. `canceled`, `unpaid`, and the end of a cancelled period return a Stripe-managed account to the free plan. The 3 used lessons stay counted.

If a live event arrives while `STRIPE_ALLOW_LIVE_CHARGES` is not `true`, it is acknowledged and not applied. Do not register the live endpoint before that flag is intentionally on, or a Dashboard payment could be charged without access being granted. Checkout itself will not create a live session before both flags are on.

## Customer Portal

In the Dashboard, test mode first: Settings → Billing → Customer portal. Allow payment-method updates, cancellation at period end, and switching among the five prices. The code only calls `billingPortal.sessions.create`. It does not change portal settings. If the portal is not configured, the button returns an error and does not charge.

Renewal retries are Stripe’s job. Smart Retries can be turned on under Billing → Revenue recovery. This change does not switch that on.

## Test checklist (no live charges)

1. Apply the migration.
2. In Stripe **test mode**, create prices that match the table (amounts, `eur`, month, lookup keys, metadata). Do not paste the live price ids into a test key. Create an inclusive 21% tax rate named VAT and set `STRIPE_TAX_RATE_IVA_21` to its test id. Do not enable automatic tax.
3. Set the env names with a test restricted key. Set `STRIPE_BILLING_ENABLED=true`. Leave `STRIPE_ALLOW_LIVE_CHARGES` unset.
4. Set `APP_BASE_URL` to the preview or local origin.
5. Register the test webhook and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
6. Sign in with a free test user. Choose Premium or an academy package. Complete Checkout with card `4242 4242 4242 4242`. The invoice total must equal the plan total, with 21% VAT included, not added on top. The next renewal invoice must show the same total and the same VAT split.
7. Confirm the profile stays on the free plan until the webhook runs, then shows Premium or Academy, and an academy’s `max_students` matches the package.
8. Open Manage billing and confirm the portal return lands on `/profile`.
9. Cancel at period end and confirm lessons still work. End the subscription with the test clock or by cancelling immediately in test mode and confirm the plan returns to free without deleting students.
10. Fail a renewal with card `4000 0000 0000 0341` and confirm access remains while the subscription is `past_due`, then ends when Stripe marks it unpaid or canceled.
11. Repeat with a `tester` account and a hand-set academy account. Checkout must refuse them.
12. Confirm production Netlify still has both flags unset.

## Still needed before any real charge

- Owner approval to set `STRIPE_ALLOW_LIVE_CHARGES` and `STRIPE_BILLING_ENABLED` on production only.
- A test-mode inclusive 21% tax rate in `STRIPE_TAX_RATE_IVA_21`. Checkout stays off without it.
- Confirmation that invoices may show 21% VAT. The legal pages still say José María is not registered as autónomo, and they do not state a VAT number. No tax registration is on the Stripe account. Stripe Tax stays off.
- Confirmation of the 14-day withdrawal wording for digital lessons.
- A test-mode catalog, webhook, and Customer Portal. None of these exist yet.
- A decision on whether academy packages should be separate Stripe products so invoices name the seat tier.
- The migration applied to the production Supabase project.
- A restricted live key stored only in the host’s secret settings.
