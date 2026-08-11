---
name: Live Run Tracker + Route Planner architecture
description: GPS run tracking screen and multi-route planner built on OSRM jogging planner. Key decisions for future changes.
---

## What was built (Jobs 9–11)
- `lib/running/geo.ts` — pure geodesic functions (haversine, nearest-point-on-segment, pace/time)
- `components/nexus/run-tracker.tsx` — full-screen GPS tracking (idle → tracking → paused → finished)
- `components/nexus/run-route-planner.tsx` — multi-route preferences UI (prefs → searching → results → error)
- `lib/planners/types.ts` — RoutePreferences, RouteCandidate.surfaceProfile/qualityLabel/compositeScore, PlannerResult.allCandidates
- `lib/planners/providers/osrm-route-provider.ts` — OSRM with surface inference + 2-pass dedup
- `lib/planners/jogging-planner.ts` — preference scoring, quality labels, candidateToPlannerResult() export
- `components/nexus/route-plan-card.tsx` — routeType-consistent display (no contradictions)

## Navigation flow
GroupDetail → (user is in jogging group) → RunRoutePlanner component (self-managed state)
→ user sets prefs + taps "Find Routes"
→ runPlanner({..., routePreferences}) → allCandidates returned
→ user selects route
→ "Start Run" → candidateToPlannerResult(candidate, {goldenWindow, locationName}) → onStartRun(plan)
→ nexus-app sets activeRunPlan + navigates to 'run-tracker' → RunTracker receives plan + onBack

## Route preferences (RoutePreferences type)
- `distanceKm: number` — 1–30 km, defaults 5
- `routeTypePreference: 'loop' | 'out_and_back' | 'any'` — default 'any'
- `surfacePreference: 'paths' | 'roads' | 'mixed'` — default 'mixed'
- `difficulty: 'easy' | 'moderate' | 'challenging' | 'any'` — default 'any'
- Stored in PlannerRequest.routePreferences; ignored by venue planners

## Multi-route results (allCandidates)
- Provider returns up to 5 candidates (maxRoutes:5 now)
- Planner scores each with preference-aware weights → ranked
- Quality labels assigned: "Best Match", "Best Loop", "Most Paths", "Alternative", etc.
- PlannerResult.allCandidates carries all ranked candidates for the UI
- RunRoutePlanner shows up to 3 compact cards with SVG route previews
- Selection → candidateToPlannerResult() → no extra OSRM call

## Preference-aware scoring (scoreWithPreferences)
distFit + typeScore + loopBonus - retracePen + surfaceScore + diffScore
- Loop preferred: loops get +2.0, non-loops get -0.5
- Out&back preferred: out-and-back gets +1.0
- Surface paths: penalty for road-heavy routes (roadFraction > 0.5)
- Surface roads: bonus for road-heavy routes
- Difficulty: small ±0.2 based on distance proxy (no elevation from OSRM)

## Surface inference (inferSurfaceProfile in osrm-route-provider)
Analyzes OSRM step names with regex patterns:
- ROAD_RE: road, street, avenue, boulevard, crescent, drive, lane, etc.
- PATH_RE: path, track, trail, footway, meadow, common, green, walk, park, towpath, etc.
- Unnamed segments → path (footpath/unmapped)
- Returns { roadFraction, pathFraction } on each RouteCandidate.surfaceProfile

## RouteType — single source of truth
`RouteType = 'loop' | 'out_and_back' | 'linear'` determined ONLY from geometry:
  LOOP = startFinish < 150m AND retraceRatio < 0.20 AND loopQuality > 0.08
  OUT_AND_BACK = startFinish < 150m AND (retraceRatio ≥ 0.20 OR loopQuality ≤ 0.08)
  LINEAR = startFinish ≥ 150m

**Why:** Original "loop" label was provider intent. Geometry measurement is honest.
Real-world Oxford routes: ALL classify as OUT_AND_BACK (retrace 48–98%) near Ewert Place.

## Honest failure — loop requested but none found
RunRoutePlanner shows amber notice:
"No genuine loop found near this location — showing best available alternatives."
NEVER relabels an out-and-back as a loop.

## Deduplication (2 passes)
Pass 1: per (direction label × routeType) — keeps best score per direction+type key
Pass 2: removes near-identical distances — same routeType AND within 8% distance → keep better score

## Candidate generation (40 parallel OSRM queries)
8 bearings × 5 configs:
  Config 1: 2-leg (start → via(half dist) → start)
  Configs 2-5: Triangles (start → via1(bearing, legKm) → via2(bearing±90°, legKm) → start), two leg sizes

## SVG route preview (RouteSvgPreview in run-route-planner.tsx)
- Samples geometry to max ~120 points
- Normalizes [lng,lat] coords to 100×100 SVG viewport
- Y-flip: lat increases upward → flip for screen coords
- Zero Leaflet overhead — pure SVG polyline
- Gold color for selected card, muted for others
- Start dot + end dot (hidden for loops where start ≈ finish)

## candidateToPlannerResult() — exported utility
Converts RouteCandidate → PlannerResult without a network call.
Called when user selects a different route from the multi-route UI.
Takes {goldenWindow, locationName}, uses waypointsToStops() internally.
The resulting PlannerResult carries full routeGeometry for GPS tracker.
Applies normalizeRouteCoords() against candidate.waypoints[0].lat/lng to
detect and correct any [lat,lng] inversion before storing routeGeometry.
Also populates resolvedLocation: {lat, lng, displayName} from start waypoint named fields.

## normalizeRouteCoords() — defensive coordinate validator (geo.ts)
HARMLESS HYGIENE ONLY — the original "6790 km bug" was NOT a coordinate swap.
It was a real geographic distance (device in Canada, route in UK). See below.
Still kept: it correctly self-heals if coords ever genuinely arrive inverted.
Decision rule: if coords[0][0] is closer to refLat than refLng → swap.
Only reliable when |refLat - refLng| > 0.5°. Logs console.error if swap occurs.
Applied at TWO layers: candidateToPlannerResult() + run-tracker.tsx routeCoords useMemo.

## run-tracker.tsx — routeCoords is now useMemo + ref-backed
routeCoords is computed via useMemo (calls normalizeRouteCoords with startWp as reference).
Mirrored into routeCoordsRef so the GPS watchPosition callback ([] deps) always reads
the canonical validated array, not a stale closure capture.
handlePosition reads routeCoordsRef.current for the off-route calculation.

## ⚠️  Root cause of "6790 km off-route" — LOCATION DISAMBIGUATION, NOT COORDINATE ORDER
Device was physically in Willingdon, ALBERTA, CANADA (~53.83°N, 111°W).
Route was planned for Willingdon, EAST SUSSEX, UK (~50.83°N, 0.26°E).
The ~6755 km distance was real and correctly reported by the tracker.
Root cause: Google Places autocomplete had no locationBias → ambiguous "Willingdon"
resolved to globally prominent East Sussex instead of nearby Alberta.

## Location disambiguation fix (implemented)
1. /nx/places/autocomplete now accepts lat/lng params → adds Google Places
   locationBias.circle (150 km radius) centred on device GPS.
2. LocationPicker silently calls navigator.geolocation on Search tab open (low accuracy,
   5s timeout, 60s maxAge) → stores in gpsRef → passes &lat=&lng= on autocomplete calls.
   GPS tab success also stores to gpsRef.
3. PlannerResult.resolvedLocation: {lat, lng, displayName} populated from start waypoint
   named fields (unambiguous lat/lng), not from the locationName string.
4. RunRoutePlanner results header now shows "Routes near [name] lat°, lng°" so users
   can confirm the correct country before starting a run.

## GPS lifecycle (no leaks)
- `watchPosition` only started when user taps "Start Run"
- `clearWatch(watchIdRef.current)` called in: handleFinish + useEffect cleanup
- `runStateRef` (ref not state) inside GPS callback to avoid stale closures
- Accuracy gate: only add trail points when accuracy ≤ 50m

## Off-route detection UX
- < 1km: "X m off route"
- 1-2km: "X.X km off route"
- ≥ 2km: "You're X km from the planned route" (avoids alarming "148 km off route")
- Going off route never stops GPS or resets stats

## Coordinate conventions
OSRM/GeoJSON: [lng, lat]. Leaflet: [lat, lng].
- routeGeometry / RouteCandidate.geometry → [lng, lat]
- Leaflet polylines → convert: coords.map(([lng, lat]) => [lat, lng])
- nearestPointOnRoute(gpsLat, gpsLng, routeCoords) → expects [lng, lat]

## Black map fix (Job 9)
1. CSS: always `absolute inset-0` on canvas div; parent controls height
2. `invalidateSize()` called on every runState transition
3. Auto-follow gated on `accuracy <= MAX_ACCURACY_M` (IP GPS = 1-5km → no auto-pan)

## framer-motion NOT installed
Importing it causes build failure. Use plain CSS transitions.

## In-session route cache (RunRoutePlanner)
useRef(new Map<string, RouteCandidate[]>()). Key: `${lat4},{lng4},{distKm},{typePreference},{surfacePreference}`. Avoids re-querying OSRM when user re-opens the same prefs.

## group-detail.tsx — route vs venue dispatch
Route planners (kind:'route') now render RunRoutePlanner (self-managed state).
Venue planners (kind:'venue') still use planPhase/activePlan/handlePlanActivity.
Detection: `getPlannerFor(rawActivityId)?.kind === 'route'`
