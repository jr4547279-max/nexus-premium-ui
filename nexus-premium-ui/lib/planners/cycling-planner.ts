// ─────────────────────────────────────────────────────────────────────────────
// Cycling Planner
// ─────────────────────────────────────────────────────────────────────────────
// Accepts a PlannerRequest and returns a PlannerResult with kind:'route'.
//
// Architecture mirrors the Jogging and Walking planners and shares route-utils.ts:
//   • Preference-aware candidate scoring
//   • Quality label assignment
//   • Candidate → PlannerResult conversion (buildRoutePlannerResult)
//
// Cycling-specific values:
//   • PACE_MIN_PER_KM = 4   (~15 km/h average cycling speed = 4 min/km)
//   • Uses 'cycling' route config (radius 25 km, default 20 km, preferLoop:true)
//   • OSRM 'bike' profile for bicycle-appropriate routing
//   • activityId: 'cycling'
//   • emoji: '🚴'
//
// Honesty contract
// ─────────────────
// Route type comes verbatim from OSRM geometry classification — never overridden.
// No mock routes. If OSRM returns nothing, an honest error is thrown.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PlannerDefinition,
  PlannerRequest,
  PlannerResult,
  RouteCandidate,
  RoutePreferences,
  GoldenWindowLike,
} from './types'
import { DEFAULT_ROUTE_PREFERENCES } from './types'
import { OsrmRouteProvider } from './providers/osrm-route-provider'
import { getRouteConfigForActivity } from './providers/route-provider'
import {
  scoreWithPreferences,
  assignQualityLabels,
  buildRoutePlannerResult,
  type RouteResultConfig,
} from './route-utils'

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Average cycling pace used for waypoint arrival-time estimates.
 * ~4 min/km = ~15 km/h — a comfortable group cycling speed.
 */
const PACE_MIN_PER_KM = 4

const CYCLING_CONFIG: RouteResultConfig = {
  activityId:   'cycling',
  paceMinPerKm: PACE_MIN_PER_KM,
  emoji:        '🚴',
  activityVerb: 'cycling',
}

// ── Singleton provider ────────────────────────────────────────────────────────

// Cycling uses the OSRM 'bike' profile for bicycle-appropriate routing
const routeProvider = new OsrmRouteProvider({ profile: 'bike' })

// ── Public: convert any RouteCandidate → PlannerResult ───────────────────────

/**
 * Converts a RouteCandidate to a complete PlannerResult for Cycling.
 *
 * Called by the route-selection UI when the user selects a route — no second
 * OSRM request is made. The result is passed directly to RunTracker.
 */
export function candidateToPlannerResultForCycling(
  candidate: RouteCandidate,
  context: {
    goldenWindow: GoldenWindowLike
    locationName?: string
  },
  prefs: RoutePreferences = DEFAULT_ROUTE_PREFERENCES,
): PlannerResult {
  return buildRoutePlannerResult(candidate, context, prefs, CYCLING_CONFIG)
}

// ── Planner definition ────────────────────────────────────────────────────────

export const cyclingPlanner: PlannerDefinition = {
  id:          'cycling-planner',
  activityId:  'cycling',
  kind:        'route',
  name:        'Cycling Route Planner',
  description: 'Finds real cycling routes near your planning location using OSRM and OpenStreetMap.',

  async plan(request: PlannerRequest): Promise<PlannerResult> {
    const {
      goldenWindow,
      groupLocation,
      locationName,
      routePreferences,
    } = request

    // Build route preferences, falling back to cycling defaults
    const cyclingDefaults: RoutePreferences = {
      distanceKm:          request.desiredDistanceKm ?? 20,
      routeTypePreference: request.preferLoop === true  ? 'loop' :
                           request.preferLoop === false ? 'out_and_back' : 'loop',
      surfacePreference:   'roads',
      difficulty:          'any',
    }

    const prefs: RoutePreferences = routePreferences ?? cyclingDefaults

    // ── 1. Require a timing window ────────────────────────────────────────────
    if (!goldenWindow) {
      throw new Error(
        'No availability window found. Add your availability so Nexus knows when you want to cycle.',
      )
    }

    // ── 2. Require planning location ──────────────────────────────────────────
    if (!groupLocation) {
      throw new Error(
        'Set a planning location so Nexus can find cycling routes nearby.',
      )
    }

    // ── 3. Fetch candidates from OSRM (bike profile, larger radius) ───────────
    const config = getRouteConfigForActivity('cycling')

    const rawCandidates = await routeProvider.getRoutes('cycling', groupLocation, {
      radiusMetres:      groupLocation.radiusMetres ?? config?.defaultSearchRadiusMetres ?? 25_000,
      maxRoutes:         5,
      desiredDistanceKm: prefs.distanceKm,
      preferLoop:        prefs.routeTypePreference !== 'out_and_back',
    })

    if (rawCandidates.length === 0) {
      throw new Error(
        'No cycling routes could be found near this location via OpenStreetMap. ' +
        'This may indicate limited cycling path data in the area, or a temporary ' +
        'connectivity issue with the routing service. Try a different planning location.',
      )
    }

    // ── 4. Recalculate duration at cycling pace ───────────────────────────────
    // OSRM stores estimatedMinutes using running pace by default.
    // Overwrite with the correct cycling pace before scoring/display.
    rawCandidates.forEach(c => {
      c.estimatedMinutes = Math.round(c.totalDistanceKm * PACE_MIN_PER_KM)
    })

    // ── 5. Score candidates with preference weights ───────────────────────────
    const scored = rawCandidates.map(candidate => ({
      candidate,
      score: scoreWithPreferences(candidate, prefs),
    }))
    scored.sort((a, b) => b.score - a.score)
    assignQualityLabels(scored, prefs)

    const rankedCandidates = scored.map(s => s.candidate)

    // ── 6. Build PlannerResult from the best candidate ────────────────────────
    const best   = rankedCandidates[0]!
    const result = buildRoutePlannerResult(best, { goldenWindow, locationName }, prefs, CYCLING_CONFIG)

    // Attach all candidates for the multi-route selection UI
    result.allCandidates = rankedCandidates

    return result
  },
}
