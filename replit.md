# nexus-premium-ui

A premium Next.js 16 app ("Nexus — Plans, perfectly aligned") built with v0, Tailwind CSS v4, shadcn/Radix UI components, and Supabase for auth/data.

## How to run

The app is configured to run via the **"Start application"** workflow:

```
cd nexus-premium-ui && pnpm run dev
```

This starts Next.js on port 5000 (`-H 0.0.0.0 -p 5000`).

## Required environment variables

The app starts without these, but key features won't work:

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase auth & data (sign-in, sessions) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase auth & data (sign-in, sessions) |
| `GOOGLE_PLACES_API_KEY` | Places/map API routes (`/nx/places`, `/nx/places/map`, `/nx/places/photo`) |

## Stack

- **Framework**: Next.js 16 (Turbopack, App Router)
- **Styling**: Tailwind CSS v4 + tw-animate-css
- **UI**: shadcn/ui components (Radix UI primitives)
- **Auth/Data**: Supabase (`@supabase/supabase-js`)
- **Charts**: Recharts
- **Package manager**: pnpm (workspace)

## Notable routes

- `/` — Landing page
- `/auth/callback` — Supabase OAuth callback
- `/invite/[code]` — Invite flow
- `/dev-login` — Development login helper
- `/weather-demo` — Weather atmosphere component demo
- `/nx/weather` — Weather API route
- `/nx/places` — Places recommendation API route
- `/nx/places/map` — Static map image route
- `/nx/places/photo` — Place photo proxy route

## User preferences
