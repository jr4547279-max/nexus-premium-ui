# Nexus Cloudflare API

This is an isolated, additive backend package for the recovered Nexus app. It
does not create Cloudflare resources and does not connect to NumerVault. The
configuration uses the local Wrangler emulator by default; the all-zero D1 ID
is a placeholder and cannot be used for a remote deployment.

## Components

- Worker REST API: passwordless email sign-in, profiles, Circles, invitations,
  member availability, Golden Window calculation, plans, RSVPs, venue votes,
  chat messages and notifications.
- D1: relational records with explicit foreign keys and membership checks in
  each request handler.
- R2: private upload objects. This initial API accepts image uploads through an
  authenticated endpoint and caps them at 10 MB.
- Durable Object: one `CircleRoom` per Circle for WebSocket broadcasts. D1
  remains the durable message store; the object only fans out committed events.
- Golden Window: imports the existing pure TypeScript sweep-line engine from
  `nexus-premium-ui/lib/golden-window.ts`.

## Local development

1. Install the workspace's declared package manager dependencies.
2. Copy `.dev.vars.example` to `.dev.vars` only for local development.
3. Apply the migration to Wrangler's local D1 and run `npm run dev` here.
4. Set `NEXT_PUBLIC_NEXUS_API_URL` to the local Worker origin in the Next app.

Email delivery is intentionally disabled until a provider URL and token are
configured outside source control. In local development, `ALLOW_DEV_AUTH=true`
allows the link URL to be returned by the request-link endpoint for testing;
it is false by default. Never enable that option in a deployed environment.

## Security model

- User identity comes from a random, opaque, HttpOnly session cookie whose hash
  is stored in D1. Logout revokes the session server-side.
- Email challenges are random, hashed, expire after 15 minutes, and can be
  consumed once. Sign-in requests and verification attempts are rate limited.
- The API checks Circle membership before reading or changing Circle data.
  It never relies on client claims, Supabase RLS policies, or a browser-supplied
  user ID.
- Browser mutations require the configured application origin. Responses are
  non-cacheable and JSON bodies are size limited.
- No Supabase credentials or private data are copied. OAuth, calendar access,
  realtime legacy subscriptions, venue-provider secrets and production email
  are not configured by this package.

## Routes

`GET /v1/health`, `POST /v1/auth/request-link`, `POST /v1/auth/verify`,
`POST /v1/auth/logout`, `GET /v1/auth/me`, `PATCH /v1/profile`,
`GET|POST /v1/circles`, `POST /v1/circles/:id/invitations`,
`POST /v1/invitations/accept`, `GET|PUT /v1/circles/:id/availability`,
`GET /v1/circles/:id/golden-window`, `GET|POST /v1/circles/:id/plans`,
`GET|POST /v1/circles/:id/messages`, `GET /v1/circles/:id/live`,
`GET /v1/circles/:id/venues?planId=...`, `GET|PUT /v1/plans/:id/rsvps`,
`POST /v1/plans/:id/votes`, `POST /v1/plans/:id/confirm`,
`GET /v1/notifications`, `POST /v1/notifications/:id/read`, and
`POST /v1/uploads`.

## Migration status

The existing app source remains intact on this branch. `nexus-premium-ui/lib/nexus-api.ts`
is the new browser boundary. Existing feature services still contain Supabase
calls and must be ported to this API before Supabase can be removed from the
frontend dependency graph. No Supabase rows were read or copied, no live user
data is included, and no remote D1, R2 or Worker was created.
