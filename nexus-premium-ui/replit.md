# Nexus — Plans, perfectly aligned.

This repository contains the recovered Nexus social planning app and the Cloudflare Worker API migration. Preserve the approved near-black, ember-orange/red-orange visual identity and original Golden Window ring animation.

## Runtime

- Frontend: Next.js 16 and React 19 (`pnpm run dev`, port 3000).
- API: `workers/nexus-api` with Cloudflare Workers.
- Persistent data: Cloudflare D1 migrations in `workers/nexus-api/migrations`.
- Private media: R2 through authenticated Worker upload routes.
- Realtime: authenticated Circle and live-event Durable Object rooms; D1 remains the source of truth.
- Golden Window: `lib/golden-window.ts`, called by the Worker using saved availability rows.

The frontend talks to the API through `lib/nexus-api.ts`. Configure `NEXT_PUBLIC_NEXUS_API_URL` for the local Worker origin. Worker secrets belong in local `.dev.vars` or approved Cloudflare secret bindings and must never be committed. Email delivery must be explicitly configured; Google sign-in is not configured yet.

Supabase is removed from active frontend code and dependencies. The older setup guide and client are retained as historical references in `legacy/`; SQL files in the repository's original `supabase/` directory remain untouched as migration history.
