# Nexus

Nexus is a mobile-first social planning application. Its signature is the cinematic ember-orange Golden Window ring, white NEXUS wordmark and the line “Plans, perfectly aligned.”

## Current architecture

- Next.js 16, React 19, Tailwind CSS and the recovered Nexus component system.
- Cloudflare Worker API under `workers/nexus-api`.
- D1 for accounts, Circles, invitations, availability, plans, voting, chat, notifications and social data.
- Private R2 uploads; Durable Objects fan out authenticated Circle and live-event updates.
- The original pure TypeScript Golden Window scoring engine remains in `nexus-premium-ui/lib/golden-window.ts`; the Worker calls it using member-submitted availability.
- Venue discovery remains behind the existing server proxy. Provider results and sample content must be labelled accurately.

Supabase is no longer an application dependency. Historical Supabase migrations and source references are retained under the original `supabase/` history and `nexus-premium-ui/legacy/` archive; they are not used by the new backend.

## Local development

Start the Next.js app from the repository root with `pnpm dev`. Start the Worker from `workers/nexus-api` with `pnpm dev`, apply its migrations locally with `pnpm db:local`, and set `NEXT_PUBLIC_NEXUS_API_URL` in the app environment to the local Worker origin. Use `.dev.vars.example` only for local development. Never set `ALLOW_DEV_AUTH=true` in a deployed environment.

The current restricted development container may reject Wrangler's local listener while enumerating host interfaces. The isolated SQLite-backed integration suite runs the Worker request handlers directly and does not require a listener.

## Verification

- App type check: `cd nexus-premium-ui && pnpm exec tsc --noEmit`
- App production build: `cd nexus-premium-ui && pnpm run build`
- Worker type check and tests: `cd workers/nexus-api && pnpm run typecheck && pnpm test`

No Cloudflare resources are deployed or changed by these commands. The Wrangler D1 ID in `wrangler.jsonc` is a local placeholder; deployment requires approved, Nexus-specific resources.
