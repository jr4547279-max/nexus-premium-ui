# Nexus Cloudflare API

Isolated backend package for the recovered Nexus app. It is configured for local development only; it creates no Cloudflare resources and has no connection to NumerVault.

## Components

- Workers REST API: email-link authentication, profiles, friends, Circles, invitations, availability, Golden Window results, saved venues, plans, RSVPs, venue votes, chat, notifications, live events, presence and private uploads.
- D1: persistent records and explicit membership checks in the Worker handlers.
- R2: authenticated private image storage for avatars and Circle chat attachments.
- Durable Objects: Circle- and event-scoped WebSocket fanout. D1 remains the source of truth.
- Golden Window: imports the existing pure TypeScript calculation engine in `nexus-premium-ui/lib/golden-window.ts`.

## Local development

1. Install workspace dependencies with the repository's declared pnpm version.
2. Copy `.dev.vars.example` to `.dev.vars` for local use only.
3. Apply D1 migrations with `pnpm db:local` and start Wrangler with `pnpm dev` from this directory.
4. Set `NEXT_PUBLIC_NEXUS_API_URL` in the Next app to the local Worker origin.

Email delivery is disabled until a provider is configured. For a local-only test harness, `ALLOW_DEV_AUTH=true` can return a one-time verification URL. Never enable it in any remotely accessible environment. Do not put provider tokens in source control.

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

`wrangler.jsonc` contains local-only placeholder D1 metadata and the Nexus-only bucket name `nexus-uploads-dev`. Before a future deployment, create and approve Nexus-specific Worker, D1, R2 and Durable Object bindings; configure a production app origin and a verified email provider; then replace the local placeholder IDs. No remote resource is provisioned by this repository state.
