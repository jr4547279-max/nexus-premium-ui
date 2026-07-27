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

## Required secrets

| Secret | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase operations |
| `GOOGLE_PLACES_API_KEY` | Google Places (New) + Maps Static API |

Enable in Google Cloud Console:
- **Places API (New)** — for venue search
- **Maps Static API** — for map tile in venue recommendations

## Project structure

```
nexus-premium-ui/
  app/
    nx/
      places/route.ts     — Google Places proxy (1h cache)
      places/map/route.ts — Maps Static API proxy
      places/photo/route.ts — Place Photos proxy
      weather/route.ts    — Open-Meteo proxy (30min cache)
    auth/callback/        — Supabase OAuth callback
    page.tsx              — Root entry (renders NexusApp)
  components/nexus/       — All Nexus UI components
  lib/
    activity-intelligence.ts  — Activity Intelligence Engine (service layer)
    golden-window.ts          — Sweep-line Golden Window algorithm
    weather-service.ts        — Weather × venue scoring helpers
    venue-service.ts          — Venue fetching and midpoint helpers
    availability-service.ts   — Supabase availability rows
    group-service.ts          — Supabase group CRUD
    auth-context.tsx          — Auth provider
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
