---
name: Real Venue Engine architecture
description: Provider abstraction, OSM Overpass integration, single-venue planner factory, group planning location — key constraints for future planner changes.
---

## What was built

A layered venue discovery + planning system with a group-level planning location.

### File structure

```
lib/
  types/planning-location.ts           — PlanningLocation type + PlanningLocationSource
  group-service.ts                      — Group now has planning_location_* fields;
                                          extractPlanningLocation(), saveGroupPlanningLocation(),
                                          clearGroupPlanningLocation()
  planners/
    types.ts                            — PlannerRequest.groupLocation?: {lat,lng}
    scoring.ts                          — universal scorer + format12h + helpers
    single-venue-planner.ts             — factory; OSM→mock fallback; THROWS if no location
    registry.ts                         — 10 planners registered
    providers/
      venue-provider.ts                 — VenueProvider re-export + ACTIVITY_OSM_TAGS
      openstreetmap-venue-provider.ts   — Overpass API, 15s timeout
      mock-venue-provider.ts            — multi-activity demo data
  dev/
    dev-harness.ts                      — runDevPlanner() accepts planningLocation?: {lat,lng}

supabase/
  group_planning_location.sql          — idempotent migration (5 columns on groups table)

components/nexus/
  group-location-section.tsx           — planning location card for group detail
  location-picker.tsx                  — extended with onSave/title/confirmLabel/hidePrivacyNote
  single-venue-plan.tsx                — single-venue plan card
  activity-plan-card.tsx               — router: pub-crawl → PubCrawlPlan, else → SingleVenuePlan
  dev-test-panel.tsx                   — 6 test locations, location picker for non-pub-crawl
```

## Key constraints

**No London fallback:** `single-venue-planner.ts` now throws when `groupLocation` is undefined. Error message: "Add a planning location so Nexus can find [activity] venues nearby." This surfaces in the existing plan error state in group-detail.tsx.

**Pub-crawl is exempt:** `pub-crawl-planner.ts` uses `MockVenueProvider` only and does not require a location (mock data is location-agnostic). No location error for pub-crawl.

**VenueProvider interface signature:**
```typescript
getVenues(activityId: string, location?: { lat: number; lng: number }): Promise<PlannerVenue[]>
```
MockVenueProvider must declare the optional second argument or TypeScript errors at call sites that use the concrete type.

**LocationPicker reuse:** The existing `LocationPicker` now accepts `onSave?: (result) => Promise<boolean>` to override the default profile save. `GroupLocationSection` uses this to write to the groups table instead of the user's profile. Also accepts `title`, `confirmLabel`, `hidePrivacyNote` props.

**Migration SQL:**
```sql
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS planning_location_lat     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS planning_location_lng     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS planning_location_name    TEXT,
  ADD COLUMN IF NOT EXISTS planning_location_address TEXT,
  ADD COLUMN IF NOT EXISTS planning_location_source  TEXT;
```
This is in `supabase/group_planning_location.sql`. Must be applied before planning location saves work.

**Group detail flow:**
- `GroupLocationSection` renders after group header, before Golden Window
- On load: `extractPlanningLocation(realGroup)` → `setPlanningLocation()`
- `handlePlanActivity` passes `groupLocation: { lat, lng }` from `planningLocation` state
- Location-needed hint shown in Plan CTA for non-pub-crawl activities with no location

**Dev test panel:** 6 preset test locations (Brighton, Manchester, Edinburgh, London Soho, Birmingham, None). Location picker only shown for non-pub-crawl activities. "None" tests the "location needed" error path.

**OSM Overpass:** Returns `[]` when no location given (unchanged — guard in single-venue-planner handles this now with an explicit error rather than London fallback).

## Why

**Why no London fallback:** Silent fallback showed London venues to users in Brighton/Edinburgh/etc. Honest error prompting location setup is better UX than silently wrong data.

**Why LocationPicker was extended (not duplicated):** The existing picker already has GPS + Google Places search + Leaflet map — all needed for group location too. Adding `onSave` prop makes it composable without duplicating 500 lines.

**Why planning location is on the group (not per-member):** "Where are we meeting?" is a group decision, not individual. Multi-member midpoint is a future feature (task proposed separately).
