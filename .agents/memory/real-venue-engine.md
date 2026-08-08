---
name: Real Venue Engine architecture
description: Provider abstraction, OSM Overpass integration, single-venue planner factory — key constraints for future planner changes.
---

## What was built

A layered venue discovery + planning system on top of the existing pub-crawl planner.

### File structure

```
lib/planners/
  types.ts                  — extended PlannerVenue (mapsUrl, address, isRealData, ratingKnown,
                              priceLevelKnown, openingHoursKnown) + PlannerResult (dataSource, providerName, scoreReasons)
  scoring.ts                — universal scorer: scoreVenueForActivity(), isVenueOpenAt(), format12h(), addMinutesToTime()
  single-venue-planner.ts   — factory: createSingleVenuePlanner({ activityId, activityEmoji, activityLabel })
  registry.ts               — 10 planners registered: pub-crawl + 9 single-venue activities
  mock-venue-provider.ts    — re-export shim (canonical impl in providers/)
  providers/
    venue-provider.ts       — VenueProvider re-export + ACTIVITY_OSM_TAGS registry
    openstreetmap-venue-provider.ts — Overpass API, 15s timeout, POST to overpass-api.de
    mock-venue-provider.ts  — multi-activity mock data for all 9 non-pub-crawl activities
components/nexus/
  single-venue-plan.tsx     — single-venue plan card (non-pub-crawl activities)
  activity-plan-card.tsx    — router: pub-crawl → PubCrawlPlan, others → SingleVenuePlan
```

## Key constraints

**VenueProvider interface signature:**
```typescript
getVenues(activityId: string, location?: { lat: number; lng: number }): Promise<PlannerVenue[]>
```
MockVenueProvider must declare the optional second argument even if unused, or TypeScript errors at call sites that use the concrete type.

**OSM provider:** calls Overpass API as HTTP POST from the browser (client-side). No API key needed. Requires `location` — returns `[]` without one.

**Provider fallback:** single-venue planner tries OSM first; falls back to mock when OSM returns < 2 results or throws. Sets `dataSource: 'real' | 'mock'` and `providerName` on the result.

**Honesty about OSM data:** OSM does not provide ratings or prices. `ratingKnown: false` and `priceLevelKnown: false` signal this. UI must show "unavailable" instead of invented values.

**format12h location:** Canonical version in `lib/planners/scoring.ts`. pub-crawl-planner.ts has its own copy (still exported for backward compat with pub-crawl-plan.tsx).

**Group location:** group-detail.tsx passes `groupLocation: undefined` to runPlanner — planners fall back to London city centre internally. Real member coordinates would improve this in future.

**Dev test panel:** `runDevPlanner(scenario, goldenWindow, activityIdOverride?)` — third param lets the panel test any registered planner against any scenario.

## Why

**Why OSM instead of Google Places:** Zero cost, no API key, open data. Honest about what it doesn't provide (ratings, prices).

**Why single-venue planner factory:** All non-pub-crawl activities follow the same pattern (discover → score → pick best 1). Factory avoids duplicating the OSM/mock fallback logic 9 times.

**Why PlannerVenue fields are optional (not nullable required):** Backward compat — existing pub-crawl code creates PlannerVenue with all fields populated. New optional fields default to `undefined` without breaking the mock data.
