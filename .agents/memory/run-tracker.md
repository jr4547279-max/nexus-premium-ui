---
name: Live Run Tracker architecture
description: GPS run tracking screen built on top of the OSRM jogging planner. Key decisions for future changes.
---

## What was built
- `lib/running/geo.ts` — pure geodesic functions (haversine, nearest-point-on-segment projection, pace/time formatting)
- `components/nexus/run-tracker.tsx` — full-screen GPS tracking component (idle → tracking → paused → finished)
- `lib/planners/types.ts` — `RouteCandidate.geometry` (full OSRM polyline) + `PlannerResult.routeGeometry`
- `lib/planners/providers/osrm-route-provider.ts` — populates `geometry` from OSRM GeoJSON response
- `lib/planners/jogging-planner.ts` — carries `routeGeometry: best.geometry` into PlannerResult
- `components/nexus/route-plan-card.tsx` — "Start Run" button (only for `dataSource === 'real'`)
- `components/nexus/activity-plan-card.tsx` — threads `onStartRun` prop
- `components/nexus/group-detail.tsx` — `onStartRun` prop, wires activePlan → callback
- `components/nexus/nexus-app.tsx` — `'run-tracker'` Screen, `activeRunPlan` state, `RunTracker` import

## Navigation flow
GroupDetail → (user taps "Start Run") → onStartRun(activePlan) → nexus-app sets activeRunPlan + navigates to 'run-tracker' → RunTracker receives plan + onBack → 'group-detail'

## Why full geometry is preserved (not just sampled waypoints)
The tracker needs the full polyline for: (a) accurate route progress projection, (b) smooth planned-route display on the map.
Solution: `RouteCandidate.geometry?: Array<[number,number]>` carrying the raw OSRM coords, copy to `PlannerResult.routeGeometry`.

## Coordinate system convention
OSRM and GeoJSON use [lng, lat] order. Leaflet uses [lat, lng].
- `routeGeometry` / `RouteCandidate.geometry` → stored as [lng, lat]
- Leaflet polylines → always convert: `routeCoords.map(([lng, lat]) => [lat, lng])`
- `nearestPointOnRoute(gpsLat, gpsLng, routeCoords)` → expects [lng, lat] coords (GeoJSON)

**Why:** Matching OSRM's output format avoids silent swap bugs; the conversion boundary is explicit in run-tracker.tsx only.

## GPS lifecycle (no leaks)
- `watchPosition` only started when user taps "Start Run" (never silently)
- `clearWatch(watchIdRef.current)` called in: handleFinish + useEffect cleanup (unmount)
- Timer interval cleaned up in: handlePause + handleFinish + useEffect cleanup
- `runStateRef` (ref, not state) used inside GPS callback to avoid stale-closure bugs

## Accuracy / glitch filtering
- Skip trail points when accuracy > 50 m (mark GPS as 'weak', still update position marker)
- Skip trail points when jump > 200 m between consecutive updates (GPS glitch)
- Auto-follow (map.setView) is also gated on `accuracy <= MAX_ACCURACY_M` — without this,
  desktop browsers with IP-based GPS (accuracy >> 50 m) pan the map far from the route,
  causing blank/black tiles at zoom 16. This was the primary "black map" root cause.
- Both thresholds are named constants at top of run-tracker.tsx

## Black map bug root causes (both fixed in Job 9)
1. **CSS class change on canvas div**: the map `<div>` used to switch class between idle (`h-72`) and
   active (`absolute inset-0`). Changing a Leaflet container's CSS class tells the browser to re-layout
   the element, but Leaflet's internal size is stale → tiles render in wrong positions → black map.
   Fix: canvas div is ALWAYS `absolute inset-0`; only the *parent wrapper* changes height.
   An explicit `invalidateSize()` is called via `useEffect([runState])` for safety.
2. **Auto-follow with no accuracy gate**: `map.setView()` was called unconditionally on every GPS update.
   Desktop browser IP-GPS accuracy is often 1000–5000 m; this panned to the wrong city. Fixed with
   `accuracy <= MAX_ACCURACY_M` guard before setView.

## framer-motion is NOT installed
When run-tracker.tsx was first written an import was added — build failed. Removed; use plain CSS.

## Off-route detection (Job 9 improvements)
- `isOffRoute` boolean + `offRouteDistM` number (metres) both tracked in state.
- Banner shows distance: "120 m off route" or "1.2 km off route".
- `backOnRoute` state: when isOffRoute transitions true→false, a 3 s "Back on route" emerald toast appears.
- Going off route never stops GPS, resets stats, or affects the map.

## OSRM provider — real road names (Job 9)
- `steps=true` added to OSRM URL — returns per-step OSM road/path names.
- `buildNamedSegments()` deduplicates consecutive steps with the same name.
- `nameAtDistance()` maps each waypoint position to the best covering OSM road name,
  falls back to nearest named segment within 300 m, then to cardinal direction description.
- Waypoints are built from evenly-spaced indices across the full geometry, not arbitrary samples.
- The interior point closest to the route midpoint is labelled as the turnaround.

## Loop quality detection (Job 9)
- Shoelace formula on [lng, lat] projected to local km offsets → polygon area in km².
- `loopQuality = polygonArea / maxCircleArea` — 0 = pure out-and-back, 1 = perfect circle.
- Threshold `LOOP_QUALITY_THRESHOLD = 0.12`: below this, `isLoop = false` and route is named
  "Route" not "Loop", regardless of whether start/end coords are the same.
- Loop quality also contributes to candidate sort score (bonus up to 2 km in distance-match terms).

## No DB writes (session-local)
GPS trail is kept in `trailRef.current` (React ref) only. No Supabase calls in RunTracker. Run history persistence is a future job.
