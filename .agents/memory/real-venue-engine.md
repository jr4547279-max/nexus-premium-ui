---
name: Real Venue Engine architecture
description: Provider abstraction, OSM Overpass integration, location intelligence, planning radius — key decisions for future planner work.
---

## Architecture overview

```
Group → Planning Location → Location Intelligence → Planning Radius
     → Golden Window → Activity → Real Venues (OSM/Overpass) → Planner → Plan
```

## Module map

```
lib/
  types/planning-location.ts           — PlanningLocation type (includes intelligence fields)
  location-intelligence/
    types.ts                            — AreaType, LocationIntelligence, AREA_TYPE_RADII,
                                          AREA_TYPE_LABELS, formatRadius (client+server safe)
    area-classifier.ts                  — classifyArea(), buildLocationIntelligence()
                                          (pure fns, no network, client+server safe)
    resolver.ts                         — resolveLocationIntelligence() SERVER ONLY
                                          calls Nominatim zoom=14, 1h in-process cache
    index.ts                            — barrel (types+classifier only; resolver not re-exported)
  group-service.ts                      — Group has 9 planning_ columns; extract/save/clear updated
  planners/
    types.ts                            — PlannerRequest.groupLocation has optional radiusMetres
    pub-crawl-planner.ts                — OSM-first/mock-fallback (fetchVenues helper)
    single-venue-planner.ts             — OSM-first/mock-fallback (unchanged)
    providers/
      openstreetmap-venue-provider.ts   — Overpass API (POI discovery; NOT Nominatim)
      mock-venue-provider.ts            — deterministic demo data

app/
  nx/location/resolve/route.ts          — POST {lat,lng} → LocationIntelligence (server-only)

components/nexus/
  group-location-section.tsx            — calls /nx/location/resolve after save; shows
                                          "Urban Core · 800 m radius" subtitle row

supabase/
  group_planning_location.sql           — 5 base columns (lat/lng/name/address/source)
  group_location_intelligence.sql       — 4 intelligence columns (radius/area_type/neighborhood/city)
```

## Key constraints

**Nominatim is for address/area resolution ONLY.**
Venue/POI discovery uses the Overpass API via `OpenStreetMapVenueProvider`.
Never use Nominatim as a POI search — it doesn't support bounding-box POI queries.

**Resolver is server-side only.**
`resolveLocationIntelligence` must only be called from API routes / server actions.
Clients call `POST /nx/location/resolve`. The barrel export intentionally omits the resolver.

**Nominatim User-Agent policy.**
Every Nominatim request includes `User-Agent: NexusApp/1.0 (contact@nexus.app)`.
Results are cached 1 hour in-process (keyed by ≈50 m grid).
On failure the resolver returns `{ areaType: 'suburban', planningRadiusMetres: 2000, ... }` — never throws.

**Planning radius by area type (AREA_TYPE_RADII):**
- urban-core → 800 m
- suburban   → 2000 m
- town       → 3500 m
- rural      → 8000 m

**Pub-crawl planner is now OSM-first.**
`fetchVenues()` helper tries `OpenStreetMapVenueProvider(radius)` first (Overpass API).
Falls back to `MockVenueProvider` when OSM returns < 2 results or throws.
Result carries `dataSource: 'real' | 'mock'` and `providerName`.

**Known scoring bug (Tech Debt #16):**
Both planners use a hardcoded `maxDist = 1.5 km` in `scoreVenue()`.
Rural radii (8 km) cause all OSM venues beyond 1.5 km to score 0 on distance.
Fix: scale `maxDist` to match the planning radius.

**No London fallback.**
`single-venue-planner.ts` throws when `groupLocation` is undefined.
Pub-crawl falls back to mock (no throw) when no location — pub crawl is still usable without one.

**PlannerRequest.groupLocation extended:**
```typescript
groupLocation?: { lat: number; lng: number; radiusMetres?: number }
```
Existing callers that omit `radiusMetres` still work (defaults to 1500 m in providers).

**DB migration — two SQL files to run in order:**
1. `supabase/group_planning_location.sql` (5 base columns — may already be applied)
2. `supabase/group_location_intelligence.sql` (4 new columns — must be applied for intelligence to persist)

**GlassCard never renders as `<button>`.**
Always renders `<div role="button" tabIndex={0} onKeyDown=...>` when clickable.
This prevents nested-button hydration errors when action buttons live inside clickable cards.
