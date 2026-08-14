// ─────────────────────────────────────────────────────────────────────────────
// Hiking Planner
// ─────────────────────────────────────────────────────────────────────────────
// Accepts a PlannerRequest and returns a PlannerResult with kind:'route'.
//
// Architecture mirrors the Jogging and Walking planners and shares route-utils.ts:
//   • Preference-aware candidate scoring
//   • Quality label assignment
//   • Candidate → PlannerResult conversion (buildRoutePlannerResult)
//
// Hiking-specific values:
//   • PACE_MIN_PER_KM = 25  (~25 min/km, accounting for elevation and terrain)
//   • Uses 'hiking' route config (radius 15 km, default 12 km, preferLoop:false)
//   • activityId: 'hiking'
//   • emoji: '🥾'
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
 * Comfortable hiking pace used for waypoint arrival-time estimates.
 * ~25 min/km accounts for typical trail terrain, elevation, and rest stops.
 */
const PACE_MIN_PER_KM = 25

const HIKING_CONFIG: RouteResultConfig = {
  activityId:   'hiking',
  paceMinPerKm: PACE_MIN_PER_KM,
  emoji:        '🥾',
  activityVerb: 'hiking',
}

// ── Singleton provider ────────────────────────────────────────────────────────

const routeProvider = new OsrmRouteProvider()

// ── Public: convert any RouteCandidate → PlannerResult ───────────────────────

/**
 * Converts a RouteCandidate to a complete PlannerResult for Hiking.
 *
 * Called by the route-selection UI when the user selects a trail — no second
 * OSRM request is made. The result is passed directly to RunTracker.
 */
export function candidateToPlannerResultForHiking(
  candidate: RouteCandidate,
  context: {
    goldenWindow: GoldenWindowLike
    locationName?: string
  },
  prefs: RoutePreferences = DEFAULT_ROUTE_PREFERENCES,
): PlannerResult {
  return buildRoutePlannerResult(candidate, context, prefs, HIKING_CONFIG)
}

// ── Planner definition ────────────────────────────────────────────────────────

export const hikingPlanner: PlannerDefinition = {
  id:          'hiking-planner',
  activityId:  'hiking',
  kind:        'route',
  name:        'Hiking Trail Planner',
  description: 'Finds real hiking trails near your planning location using OSRM and OpenStreetMap.',

  async plan(request: PlannerRequest): Promise<PlannerResult> {
    const {
      goldenWindow,
      groupLocation,
      locationName,
      routePreferences,
    } = request

    // Build route preferences, falling back to hiking defaults
    const hikingDefaults: RoutePreferences = {
      distanceKm:          request.desiredDistanceKm ?? 12,
      routeTypePreference: request.preferLoop === true  ? 'loop' :
                           request.preferLoop === false ? 'out_and_back' : 'any',
      surfacePreference:   'paths',
      difficulty:          'any',
    }

    const prefs: RoutePreferences = routePreferences ?? hikingDefaults

    // ── 1. Require a timing window ────────────────────────────────────────────
    if (!goldenWindow) {
      throw new Error(
        'No availability window found. Add your availability so Nexus knows when you want to hike.',
      )
    }

    // ── 2. Require planning location ──────────────────────────────────────────
    if (!groupLocation) {
      throw new Error(
        'Set a planning location so Nexus can find hiking trails nearby.',
      )
    }

    // ── 3. Fetch candidates from OSRM (foot profile, wider radius) ────────────
    const config = getRouteConfigForActivity('hiking')

    const rawCandidates = await routeProvider.getRoutes('hiking', groupLocation, {
      radiusMetres:      groupLocation.radiusMetres ?? config?.defaultSearchRadiusMetres ?? 15_000,
      maxRoutes:         5,
      desiredDistanceKm: prefs.distanceKm,
      preferLoop:        prefs.routeTypePreference !== 'out_and_back',
    })

    if (rawCandidates.length === 0) {
      throw new Error(
        'No hiking trails could be found near this location via OpenStreetMap. ' +
        'This may indicate limited trail data in the area, or a temporary ' +
        'connectivity issue with the routing service. Try a different planning location.',
      )
    }

    // ── 4. Recalculate duration at hiking pace ────────────────────────────────
    // OSRM stores estimatedMinutes using running pace by default.
    // Overwrite with a realistic hiking pace before scoring/display.
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
    const result = buildRoutePlannerResult(best, { goldenWindow, locationName }, prefs, HIKING_CONFIG)

    // Attach all candidates for the multi-route selection UI
    result.allCandidates = rankedCandidates

    return result
  },
}
