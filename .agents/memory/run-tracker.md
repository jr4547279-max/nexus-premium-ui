---
name: Live Run Tracker architecture
description: GPS run tracking screen built on top of the OSRM jogging planner. Key decisions for future changes.
---

## What was built
- `lib/running/geo.ts` — pure geodesic functions (haversine, nearest-point-on-segment projection, pace/time formatting)
- `components/nexus/run-tracker.tsx` — full-screen GPS tracking component (idle → tracking → paused → finished)
- `lib/planners/types.ts` — `RouteCandidate.geometry` (full OSRM polyline) + `PlannerResult.routeGeometry`
- `lib/planners/providers/osrm-route-provider.ts` — OSRM foot-profile provider with geometry-based classification
- `lib/planners/jogging-planner.ts` — carries routeType + routeGeometry into PlannerResult
- `components/nexus/route-plan-card.tsx` — displays routeType consistently (Loop/Out & Back/Linear)
- `components/nexus/route-plan-card.tsx` — "Start Run" button (only for `dataSource === 'real'`)
- `components/nexus/activity-plan-card.tsx` — threads `onStartRun` prop
- `components/nexus/group-detail.tsx` — `onStartRun` prop, wires activePlan → callback
- `components/nexus/nexus-app.tsx` — `'run-tracker'` Screen, `activeRunPlan` state, `RunTracker` import

## Navigation flow
GroupDetail → (user taps "Start Run") → onStartRun(activePlan) → nexus-app sets activeRunPlan + navigates to 'run-tracker' → RunTracker receives plan + onBack → 'group-detail'

## RouteType — single source of truth
`RouteType = 'loop' | 'out_and_back' | 'linear'` added to both RouteCandidate and PlannerResult.
Determined ONLY from geometry metrics — never from provider intent:
  LOOP = startFinish < 150m AND retraceRatio < 0.20 AND loopQuality > 0.08
  OUT_AND_BACK = startFinish < 150m AND (retraceRatio ≥ 0.20 OR loopQuality ≤ 0.08)
  LINEAR = startFinish ≥ 150m

**Why:** The original "loop" label was set by provider intent, not measured geometry.
Real-world OSRM routes frequently retrace in urban areas (40-99% retrace ratio for Oxford city centre).
Honest classification is more useful than a false "Loop" label.

## Candidate generation strategy (Job 10)
8 bearings × 5 configs = up to 40 parallel OSRM queries:
  Config 1: 2-leg (start → via(half dist) → start) — classic out-and-back baseline
  Config 2-3: Triangle small (legFrac=0.22): left/right 90° turn triangles
  Config 4-5: Triangle medium (legFrac=0.35): left/right 90° turn triangles

Triangles fire: start → via1(bearing, legKm) → via2(bearing±90° from via1, legKm) → start.
This forces OSRM to traverse different road segments on each leg.

After collection:
  - Filter by ±60% distance tolerance
  - Deduplicate by (direction label × routeType) keeping best score per group
  - Sort: loops first, then by composite score
  - Return top 3

## Oxford city centre finding (important for future work)
Live test confirmed: ALL candidates near Ewert Place (Banbury Road, Oxford) classify as OUT_AND_BACK.
Retrace ratio: 0.31-0.99 across all 40 configs. No genuine loops found.
Root cause: linear road corridor (Banbury Rd), River Cherwell/Thames barriers forcing same-path returns.
This is a real-world constraint, not a bug. The planner correctly returns the best out-and-back route
and labels it honestly. Out-and-back routes are common in constrained urban networks.

## Retrace metric (grid-cell approach)
Discretize [lng, lat] coords to 30m grid cells, count cells visited > once.
retraceRatio = duplicateCells / totalCells.
Test result: pure 2-leg out-and-back scores 0.92-0.99; best triangle gets ~0.31.
Thresholds: < 0.20 → eligible for loop classification.

## Why full geometry is preserved (not just sampled waypoints)
The tracker needs the full polyline for: (a) accurate route progress projection, (b) smooth planned-route display.
Solution: `RouteCandidate.geometry?: Array<[number,number]>` carrying raw OSRM coords → `PlannerResult.routeGeometry`.

## Coordinate system convention
OSRM and GeoJSON use [lng, lat] order. Leaflet uses [lat, lng].
- `routeGeometry` / `RouteCandidate.geometry` → stored as [lng, lat]
- Leaflet polylines → always convert: `routeCoords.map(([lng, lat]) => [lat, lng])`
- `nearestPointOnRoute(gpsLat, gpsLng, routeCoords)` → expects [lng, lat] coords (GeoJSON)

## GPS lifecycle (no leaks)
- `watchPosition` only started when user taps "Start Run" (never silently)
- `clearWatch(watchIdRef.current)` called in: handleFinish + useEffect cleanup (unmount)
- Timer interval cleaned up in: handlePause + handleFinish + useEffect cleanup
- `runStateRef` (ref, not state) used inside GPS callback to avoid stale-closure bugs

## Accuracy / glitch filtering + auto-follow guard
- Skip trail points when accuracy > 50 m (mark GPS as 'weak', still update position marker)
- Skip trail points when jump > 200 m between consecutive updates (GPS glitch)
- Auto-follow (map.setView) is ALSO gated on `accuracy <= MAX_ACCURACY_M`
  Without this, desktop IP-GPS (accuracy ~1-5km) pans map far from route → blank/black tiles.

## Black map bug root causes (both fixed in Job 9)
1. CSS class change on canvas div: always `absolute inset-0`; parent wrapper controls height.
   `invalidateSize()` called via `useEffect([runState])` on every state transition.
2. Auto-follow with no accuracy gate: fixed with `accuracy <= MAX_ACCURACY_M` guard.

## framer-motion is NOT installed
Importing it causes build failure. Use plain CSS for transitions.

## Off-route detection UX
- `isOffRoute` boolean + `offRouteDistM` number (metres)
- < 1km: "X m off route"
- 1-2km: "X.X km off route"
- ≥ 2km: "You're X km from the planned route" (prevents alarming "148 km off route" text)
- `backOnRoute` state: when isOffRoute transitions true→false, 3s emerald toast appears.
- Going off route never stops GPS, resets stats, or affects map tiles.

## OSRM provider — real road names
- `steps=true` → OSRM returns per-step OSM road/path names
- `buildNamedSegments()` deduplicates consecutive steps with the same name
- Waypoint label depends on routeType: LOOP uses "Loop start & finish", OUT_AND_BACK uses "Start"

## No DB writes (session-local)
GPS trail is kept in `trailRef.current` (React ref) only. No Supabase calls in RunTracker.
