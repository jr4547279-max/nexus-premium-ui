---
name: Nexus Social system
description: Architecture decisions for the Phase 1 social identity system (username, avatar, bio, activities, search).
---

# Nexus Social — Phase 1

## What was built
- `lib/social-service.ts` — username validation, profile CRUD, avatar upload (canvas crop → Supabase Storage), user search
- `components/nexus/social-screen.tsx` — self-contained screen with My Profile + Search views
- `supabase/social_migration.sql` — profiles table columns + storage bucket + RLS

## Key decisions

**Profile type extended in `lib/profile-service.ts`** — `username`, `avatar_url`, `bio`, `favourite_activities` added to the `Profile` interface so `useAuth()` carries all social fields automatically after a refresh.

**Why**: Avoids a second Supabase trip or a separate social context.

**Cache key for OSRM is `profile` not `activityId`** — walking (`foot`) and jogging (`foot`) share the same route cache entry; cycling (`bike`) gets its own. Recorded here because it was not obvious from the code.

**`favourite_activities` is `TEXT[]`** in Postgres, stored as `string[] | null` in TypeScript.

**Avatar upload flow**: client-side Canvas crop to 400×400 JPEG → upload to `avatars/{userId}/avatar.jpg` (upsert so overwrites previous) → cache-busted public URL stored in `profiles.avatar_url`.

**Navigation**: 6-tab bottom nav (home, groups, world, activity, social, profile). Icon size stays `w-4.5 h-4.5`, label `text-[9px]`, padding `p-1` to fit. All existing `onTabChange` handlers simplified to `if (tab !== '<currentTab>') onNavigate(tab)`.

## Setup required (one-time, per Supabase project)
Run `supabase/social_migration.sql` in the Supabase SQL Editor. Without this:
- `username`, `avatar_url`, `bio`, `favourite_activities` columns don't exist → profile saves fail silently.
- `avatars` storage bucket doesn't exist → avatar uploads 404.
- The broadened SELECT policy doesn't exist → user search returns empty (RLS blocks cross-user reads).
