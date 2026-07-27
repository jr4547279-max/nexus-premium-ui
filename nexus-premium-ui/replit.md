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

Configure once, in order:

### 1. Enable Google provider in Supabase
Supabase dashboard → Authentication → Providers → Google → Enable
- Requires a Google Cloud OAuth 2.0 Client ID and Secret

### 2. Configure redirect URLs (Authentication → URL Configuration)

**Site URL** — set to the production domain (update after first publish):
```
https://yourapp.replit.app
```

**Redirect URLs** — add ALL of these patterns:
```
https://*.replit.app/**
https://*.janeway.replit.dev/**
http://localhost:5000/**
```

> **Why `*.janeway.replit.dev/**` and not `*.replit.dev/**`?**
>
> Replit dev preview URLs are **two subdomain levels** below `replit.dev`:
>
>   `4162f3b0-xxx.janeway.replit.dev`
>
> Supabase's `*` wildcard is single-level — it matches one segment and does NOT
> cross dots. So `*.replit.dev/**` matches `janeway.replit.dev` (one level) but
> does NOT match `anything.janeway.replit.dev` (two levels). You need the
> cluster-level pattern `*.janeway.replit.dev/**` to cover every repl on this
> cluster.
>
> If Supabase does not recognise `redirect_to`, it silently falls back to Site URL
> and the user lands on the wrong page (Replit placeholder) instead of `/auth/callback`.

### 3. Set NEXT_PUBLIC_SITE_URL (after first publish)

After the app is published and you have a stable `*.replit.app` URL:
- Add `NEXT_PUBLIC_SITE_URL = https://yourapp.replit.app` as a shared env var
- Rebuild and redeploy so the value is baked into the client bundle
- This pins the OAuth `redirectTo` to the production domain so users always
  land back on the production app after Google sign-in, even when initiating
  auth from a dev preview URL

### How the OAuth flow works

```
User clicks "Continue with Google"
  → redirectTo = NEXT_PUBLIC_SITE_URL (if set) OR window.location.origin
                 + /auth/callback
  → supabase.auth.signInWithOAuth → GET /auth/v1/authorize?redirect_to=[URL]
  → Supabase does NOT validate redirect_to here — passes it to Google
  → Google redirects to https://[project].supabase.co/auth/v1/callback?code=XXX
  → Supabase NOW validates redirect_to against Redirect URLs list
      ✓ whitelisted → redirects to redirect_to?code=YYY → /auth/callback runs
      ✗ not whitelisted → falls back to Site URL → user lands on wrong page
  → /auth/callback exchanges code for session (PKCE)
  → User is sent to / (dashboard)
```

### Supabase validation happens at the CALLBACK step, not at authorize

A common misconception: Supabase does not reject an unwhitelisted `redirect_to`
when the OAuth flow starts — it passes any URL through to Google. The check
happens only when Supabase receives the Google callback. If `redirect_to` is not
in the allowed list at that point, Supabase silently uses Site URL instead.
This is why the flow appears to start correctly but the final redirect is wrong.

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
