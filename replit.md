# Nexus Premium UI

A premium dark navy & gold Next.js 16 dashboard UI built with v0, featuring Supabase auth, animated weather atmosphere backgrounds, and a full component library.

## Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui + Radix UI
- **Auth / Backend**: Supabase
- **Package Manager**: pnpm

## How to Run

```bash
cd nexus-premium-ui && pnpm run dev
```

The app runs on port 5000. The configured workflow (`Start application`) handles this automatically.

## Environment Variables

Auth features require Supabase credentials. Without them the app runs but auth is disabled:

- `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your Supabase anon/public key

## Key Routes

- `/` — Main Nexus app (dashboard)
- `/auth` — Authentication
- `/weather-demo` — Weather atmosphere animation demo
- `/nx/places`, `/nx/weather` — Sub-pages

## User Preferences
