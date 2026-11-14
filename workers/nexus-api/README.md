# Nexus Cloudflare API

Isolated backend package for the recovered Nexus app. It is configured for local development only; it creates no Cloudflare resources and has no connection to NumerVault.

## Components

- Workers REST API: email-link authentication, profiles, friends, Circles, invitations, availability, Golden Window results, saved venues, plans, RSVPs, venue votes, chat, notifications, live events, presence and private uploads. Staging disables the direct `workers.dev` endpoint; the frontend Worker forwards `/v1/*` and WebSocket upgrades over a service binding so session cookies stay same-origin.
- D1: persistent records and explicit membership checks in the Worker handlers.
- R2: private upload implementation is retained in source, but has no staging binding; upload routes return `503 uploads_disabled` unless a binding and explicit enable flag are both configured.
- Durable Objects: Circle- and event-scoped WebSocket fanout. D1 remains the source of truth.
- Golden Window: imports the existing pure TypeScript calculation engine in `nexus-premium-ui/lib/golden-window.ts`.

## Local development

1. Install workspace dependencies with the repository's declared pnpm version.
2. Copy `.dev.vars.example` to `.dev.vars` for local use only.
3. Apply D1 migrations with `pnpm db:local` and start Wrangler with `pnpm dev` from this directory.
4. Set `NEXT_PUBLIC_NEXUS_API_URL` in the Next app to the local Worker origin.

Email delivery is disabled until a provider is configured. For a local-only test harness, `ALLOW_DEV_AUTH=true` can return a one-time verification URL. Never enable it in any remotely accessible environment. Do not put provider tokens in source control.

### API-connected local preview without Wrangler

When Wrangler cannot bind a local network interface, use the isolated harness instead. It invokes the same Worker request handler with SQLite, temporary local R2 storage and in-memory Durable Object adapters; it creates no Cloudflare resources.

1. In one terminal, run `pnpm preview:local` from `workers/nexus-api`.
2. In a second terminal, run `NEXT_PUBLIC_NEXUS_API_URL=http://127.0.0.1:39187 pnpm exec next dev -H 127.0.0.1 -p 37141` from `nexus-premium-ui`.
3. Open `http://127.0.0.1:37141`. Local email-link auth returns a development-only verification link in the UI; no email is sent.

The preview database is `/tmp/nexus-api-preview.sqlite` and contains local test data only. Venue discovery still depends on the configured venue provider; Nexus labels example community content separately from live venue results.

## Security

- Sessions use random opaque HttpOnly cookies; only token hashes are persisted.
- Email challenges are random, hashed, one-use and expire after 15 minutes. Authentication, invitations and sensitive writes have server-side rate limits.
- Circle membership is checked on each private data request. Event access is scoped to invited Circle members. Private location data is returned only during live events with sharing enabled.
- Browser mutations are same-origin checked. Request bodies are bounded and responses are non-cacheable.
- No client-supplied user ID is trusted for identity or authorization. Historical Supabase policies are not used by this API.

## Verification

- `pnpm run typecheck`
- `pnpm test` — includes a SQLite-backed Worker integration journey that exercises auth, invitation, membership, saved availability, server-side Golden Window scoring, venue voting, plan confirmation, RSVPs, chat and non-member denial.

The harness invokes the real Worker request handlers with local SQLite and in-memory R2/room adapters. It does not copy production data or contact Cloudflare.

## Deployment prerequisites

`wrangler.jsonc` is pinned to the user's Cloudflare account and the Nexus-only Worker/D1 names. The frontend routes `/v1/*` and WebSocket traffic through its service binding, keeping Lax session cookies same-origin; only the frontend is reachable at its `workers.dev` URL. The API's direct `workers.dev` endpoint is disabled. The API intentionally has no R2 binding, keeps uploads disabled, uses production auth mode, and contains a placeholder D1 ID that prevents accidental deployment. The deployment workflow is `workflow_dispatch` only and defaults to read-only preflight. It builds/tests both packages, dry-runs both Wrangler configs, checks Cloudflare billing and inventories, and refuses to provision unless every prerequisite passes. The deploy job is constrained to `nexus-web-dev`, `nexus-api-dev`, and `nexus-app-dev`; it has no R2 commands, routes, custom domains, or production trigger.

### Staging deployment prerequisites

- GitHub Actions secret `CLOUDFLARE_API_TOKEN`: D1 Read/Edit is needed to inspect/create the one D1 database. Current Cloudflare role docs require product-level Workers Admin to create new Worker scripts. For least privilege, create both Nexus Worker placeholders first, then scope Editor/Scripts Edit to only `nexus-web-dev` and `nexus-api-dev`; the existing Worker Scripts Edit token scope can then deploy them. The SQLite DO ships as a migration of `nexus-api-dev` and needs no separate Durable Objects permission. Billing Read is needed for billable usage, and Account Analytics Read is needed to inspect live Workers/D1/DO usage metrics. The short-lived token must be rotated before its expiry.
- GitHub Actions secret `NEXUS_RESEND_API_KEY`: a Nexus-only, send-only Resend API key restricted to the verified Nexus domain. Do not reuse NumerVault credentials.
- Repository variables `NEXUS_EMAIL_FROM`, `NEXUS_EMAIL_SENDER_VERIFIED=true`, `NEXUS_RESEND_OVERAGES_DISABLED=true`, either `NEXUS_WORKERS_ADMIN_CONFIRMED=true` (for missing Worker scripts) or `NEXUS_WORKERS_EDIT_CONFIRMED=true` (for both existing scripts), `NEXUS_BILLING_READ_CONFIRMED=true`, `NEXUS_FREE_PLAN_CONFIRMED=true`, and `NEXUS_RESOURCE_USAGE_REVIEWED=true`. Each confirmation is set only after checking the corresponding provider/account setting. The currently connected Cloudflare read integration cannot access billing usage or the resource inventory; add the read-only scopes above or check these values directly in the dashboard before setting the confirmation variables.
- Keep Resend on its free tier and paid overages disabled. The free tier currently lists 3,000 emails/month and 100/day. If the quota is exhausted, authentication email delivery should fail closed; do not enable overages for staging.

The workflow does not change the Cloudflare plan, turn on a paid product, create an R2 bucket, or touch any existing non-Nexus resource. Static asset requests are free; Worker, D1, and SQLite Durable Object usage stays subject to Free-plan hard limits. The repository's current checkout has not provisioned or deployed anything.

Never expose secret values in logs. The email API key is piped to Wrangler's secret command from a masked GitHub secret, and the sender address is stored as a Worker secret for deployment consistency. Development sign-in shortcuts remain disabled in the remote Wrangler config.
