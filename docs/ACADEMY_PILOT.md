# Private academy pilot

José María creates a small set of invitations and sends each code himself. The site does not email academies, start a Stripe trial, or take a card.

Each unused code activates exactly one academy. It does not end after a set number of days, and it does not stop at a set number of students. Saved lessons and progress stay.

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

The academy owner opens the link, signs in with the usual email link, and presses Activate. The code is stored on the device and included in the sign-in return link so the magic link does not drop it. Activating twice with the same account does not start a second academy. A second account cannot use the same code. One account cannot take a second pilot. Tester, Stripe, and hand-set academy accounts are left unchanged.

The owner then uses My academy as usual. Students who join are covered by the academy. The pilot page does not start a payment. Paid academy prices stay in the Terms and are not a pilot cap.

## Database

`supabase/migrations/20261107_pilot_invitations.sql` is additive and must be reviewed before anyone runs it. This change does not apply it. It runs after `20261107_billing.sql`, which is already applied on project `pvoxgilvqcnxfxmaixef`.

Invitation rows are readable only by the service role. Signed-in users cannot update plan, pilot expiry, or the blocked-free flag. `redeem_pilot_invitation` locks the invitation and the profile, so two redemptions cannot both succeed.

## Lesson gate

`lesson_block_reason` decides before a lesson is counted:

- Stripe, tester, and hand-set academy or Premium accounts stay unlimited. A null `pilot_expires_at` is never treated as expired.
- A pilot owner or a student still in that academy can create lessons. A stored end date is not a limit.
- A student who leaves does not fall back to the free lesson count.
- `supabase/migrations/20261206_pilot_no_seat_or_day_cap.sql` is the database half of this rule. A deploy does not apply it.
- Saved lessons and progress are ordinary profile data and are not deleted.
