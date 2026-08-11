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
OsrmRouteProvider.sampleWaypoints() reduces thousands of OSRM coordinates to ≤12 waypoints for the UI card.
The tracker needs the full polyline for: (a) accurate route progress projection, (b) smooth planned-route display on the map.
Solution: add `RouteCandidate.geometry?: Array<[number,number]>` carrying the raw OSRM coords, copy to `PlannerResult.routeGeometry`.

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
- Both thresholds are named constants at top of run-tracker.tsx

## framer-motion is NOT installed
When I first wrote run-tracker.tsx I imported framer-motion — build failed. Removed it; use plain CSS for transitions.

## Off-route detection
Nearest-segment projection in `nearestPointOnRoute` → if `distanceToRouteKm > 0.05` (50 m) → show "You're off route" banner.
No automatic rerouting — detection only.

## No DB writes (session-local)
GPS trail is kept in `trailRef.current` (React ref) only. No Supabase calls in RunTracker. Run history persistence is a future job.
