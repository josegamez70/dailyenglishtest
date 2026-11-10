# Private academy pilot

José María creates a small set of invitations and sends each code himself. The site does not email academies, start a Stripe trial, or take a card.

Each unused code activates exactly one academy for up to 20 students. The 20 days start when that academy owner activates the code, not when the invitation is created. After that, new lessons stop for the owner and for students. Saved lessons and progress stay. The 3 free lessons do not start again.

Billing stays off. `STRIPE_BILLING_ENABLED` and `STRIPE_ALLOW_LIVE_CHARGES` must stay unset.

## Bootstrap

Admin actions fail closed until the server knows the owner’s Supabase user id. Do not put that id in the repo.

1. Sign in once on the site.
2. In the Supabase dashboard, open Authentication → Users and copy only your own user id.
3. In Netlify, set `PILOT_ADMIN_UIDS` to that id. Several ids can be separated by commas. A bad value, an email address, or a missing value denies everyone.
4. Optional: `PILOT_COHORT_LIMIT` defaults to 14. Revoked invitations do not count. The maximum accepted value is 20.

The private page is `/admin/pilots`. It is not linked from the public menu. Anyone who is not in `PILOT_ADMIN_UIDS` sees “Not available”.

## What the owner does

Create a short label, copy the code or the link, and send it yourself. Revoke an invitation only before it is used. The link looks like `/pilot?code=...`.

The academy owner opens the link, signs in with the usual email link, and presses Activate. The code is stored on the device and included in the sign-in return link so the magic link does not drop it. Activating twice with the same account is safe and does not extend the 20 days. A second account cannot use the same code. One account cannot take a second pilot. Tester, Stripe, and hand-set academy accounts are left unchanged.

The owner then uses My academy as usual. The academy is created with 20 seats. Students who join are covered until the same end time. When it ends, new joins and new lessons stop. Existing rows stay.

An ended pilot can contact info@dailyenglishtest.es or look at plans. Academy up to 20 students is 30 € per month, 21% VAT included. The pilot page does not start a payment.

## Database

`supabase/migrations/20261107_pilot_invitations.sql` is additive and must be reviewed before anyone runs it. This change does not apply it. It runs after `20261107_billing.sql`, which is already applied on project `pvoxgilvqcnxfxmaixef`.

Invitation rows are readable only by the service role. Signed-in users cannot update plan, pilot expiry, or the blocked-free flag. `redeem_pilot_invitation` locks the invitation and the profile, so two redemptions cannot both succeed.

## Lesson gate

`lesson_block_reason` decides before a lesson is counted:

- Stripe, tester, and hand-set academy or Premium accounts stay unlimited. A null `pilot_expires_at` is never treated as expired.
- An active pilot owner or student can create lessons.
- An ended pilot, including a student who leaves, cannot create lessons and does not fall back to the 3 free lessons.
- Saved lessons and progress are ordinary profile data and are not deleted.
