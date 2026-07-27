# Nexus — Plans, Perfectly Aligned

A premium mobile-first social planning app built with Next.js 16, Supabase, and Tailwind CSS. Nexus finds the optimal time for groups to meet (the "Golden Window") using a sweep-line availability algorithm, then recommends nearby venues powered by the Activity Intelligence Engine.

## Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Styling**: Tailwind CSS v4 + Radix UI components
- **Auth**: Supabase Auth (Google OAuth + dev-login fallback)
- **Database**: Supabase PostgreSQL
- **Places**: Google Places API (New) — server-proxied at `/nx/places`
- **Weather**: Open-Meteo (free, no key needed) — proxied at `/nx/weather`
- **Maps**: Google Maps Static API — proxied at `/nx/places/map`

## Running the app

The app is configured to run on port 5000:

```bash
cd nexus-premium-ui && pnpm run dev
```

This starts Next.js with `next dev -H 0.0.0.0 -p 5000`.

## Publishing (production)

Build command: `cd nexus-premium-ui && pnpm install && pnpm run build`
Run command: `cd nexus-premium-ui && pnpm run start`

After publishing, the production URL will be at a `*.replit.app` domain. Once published:

1. Set `NEXT_PUBLIC_SITE_URL` env var to the production URL (e.g. `https://yourapp.replit.app`)
2. Configure Supabase (see below)

## Required secrets and env vars

| Key | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (**set**) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key (**set**) |
| `NEXT_PUBLIC_SITE_URL` | Production URL — pins OAuth callback to stable domain. Set after first publish. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase operations |
| `GOOGLE_PLACES_API_KEY` | Google Places (New) + Maps Static API |

Enable in Google Cloud Console:
- **Places API (New)** — for venue search
- **Maps Static API** — for map tile in venue recommendations

## Google OAuth configuration (Supabase dashboard)

This is the root cause of the "redirects to preview URLs" issue. Configure once, in order:

### 1. Enable Google provider in Supabase
Supabase dashboard → Authentication → Providers → Google → Enable
- Requires a Google Cloud OAuth 2.0 Client ID and Secret

### 2. Configure redirect URLs (Authentication → URL Configuration)

**Site URL** — set to the production domain:
```
https://yourapp.replit.app
```

**Redirect URLs** — add ALL of these wildcard patterns:
```
https://*.replit.app/**
https://*.replit.dev/**
http://localhost:5000/**
```

The wildcard patterns cover every preview URL Replit generates, so OAuth works
during development AND in production without needing to update Supabase every
time the dev container URL changes.

### 3. Set NEXT_PUBLIC_SITE_URL (after first publish)

After the app is published and you have a stable `*.replit.app` URL:
- Add `NEXT_PUBLIC_SITE_URL = https://yourapp.replit.app` as a shared env var
- This pins the OAuth `redirectTo` to the production domain so users always
  land back on the production app after Google sign-in, even if they initiated
  auth from a preview URL

### How the OAuth flow works

```
User clicks "Continue with Google"
  → redirectTo = NEXT_PUBLIC_SITE_URL + /auth/callback
  → Browser navigates to Google consent
  → Google redirects to Supabase OAuth endpoint
  → Supabase redirects to redirectTo (/auth/callback?code=XXX)
  → /auth/callback exchanges code for session (PKCE)
  → User is sent to / (dashboard)
```

`NEXT_PUBLIC_SITE_URL` must be in Supabase's Redirect URLs list. If it isn't,
Supabase ignores `redirectTo` and falls back to the Site URL instead.

## Project structure

```
nexus-premium-ui/
  app/
    nx/
      places/route.ts       — Google Places proxy (1h cache)
      places/map/route.ts   — Maps Static API proxy
      places/photo/route.ts — Place Photos proxy
      weather/route.ts      — Open-Meteo proxy (30min cache)
    auth/callback/page.tsx  — Supabase PKCE OAuth callback handler
    page.tsx                — Root entry (renders NexusApp)
  components/nexus/         — All Nexus UI components
  lib/
    auth-context.tsx        — Auth provider + signInWithGoogle (uses NEXT_PUBLIC_SITE_URL)
    activity-intelligence.ts  — Activity Intelligence Engine (service layer)
    golden-window.ts          — Sweep-line Golden Window algorithm
    weather-service.ts        — Weather × venue scoring helpers
    venue-service.ts          — Venue fetching and midpoint helpers
    availability-service.ts   — Supabase availability rows
    group-service.ts          — Supabase group CRUD
```

## Activity Intelligence Engine

`lib/activity-intelligence.ts` is the core AI service layer. It is UI-free and reusable:

- **`detectActivityIntent(ctx)`** — contextual reasoning from group name, user query, time-of-day, weather, and onboarding preferences to determine what activity the group intends (not simple keyword matching)
- **`rankVenues(venues, weather, intent)`** — multi-factor scoring: quality (40%), activity fit (30%), weather fit (15%), accessibility/opening hours (15%)
- **`scoreVenue(venue, weather, intent)`** — per-venue breakdown with natural-language explanation bullets
- **`suggestWeatherAlternatives(weather, intent)`** — when weather is unsuitable for the detected activity, surfaces indoor alternatives

## User preferences

- Do not redesign, refactor, or rebuild existing functionality
- Continue from existing implementation; do not duplicate completed work
- Keep Activity Intelligence Engine as a reusable service layer separate from UI
- Minimal changes — finish and polish before adding new features
