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

`wrangler.jsonc` is configured for the Nexus-only staging names, D1 and SQLite-backed Durable Objects. The frontend routes `/v1/*` and WebSocket traffic through its service binding, keeping Lax session cookies same-origin; the API's public `workers.dev` endpoint is disabled. The API intentionally has no R2 binding, keeps uploads disabled, uses production auth mode and contains a placeholder D1 ID that prevents accidental deployment. Before deployment, verify Cloudflare permissions and billing visibility, create the Nexus D1 database and replace its ID, configure `EMAIL_FROM` with a sender on a verified Nexus domain, and add a Nexus-only Resend sending key as the `EMAIL_API_TOKEN` Worker secret. No remote resource is provisioned by this repository state. Historical NumerVault resources and credentials are not referenced.
