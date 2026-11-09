# Daily English Test

Free English reading and listening practice.

## Analytics

`VITE_CF_ANALYTICS_TOKEN` turns on Cloudflare Web Analytics at build time. The beacon is cookieless and does not need a consent banner.

Set the token in the environment, then rebuild. On Netlify, add it under Site settings → Environment variables. If the variable is missing, the site does not load the analytics script.

## Billing

Payments are off. Plan buttons on the site are a preview and do not charge. Setup, environment names, and the test checklist are in [docs/BILLING.md](docs/BILLING.md).

Private academy pilot invitations are off until `PILOT_ADMIN_UIDS` is set. See [docs/ACADEMY_PILOT.md](docs/ACADEMY_PILOT.md). The migration is not applied by a deploy.
