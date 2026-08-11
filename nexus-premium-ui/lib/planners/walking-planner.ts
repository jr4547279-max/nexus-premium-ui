// ─────────────────────────────────────────────────────────────────────────────
// Walking Planner
// ─────────────────────────────────────────────────────────────────────────────
// Accepts a PlannerRequest and returns a PlannerResult with kind:'route'.
//
// Architecture mirrors the Jogging planner and shares route-utils.ts for:
//   • Preference-aware candidate scoring
//   • Quality label assignment
//   • Candidate → PlannerResult conversion (buildRoutePlannerResult)
//
// Walking-specific values:
//   • PACE_MIN_PER_KM = 15   (~15 min/km comfortable walking pace)
//   • Uses 'walking' route config  (radius 8 km, default 6 km, preferLoop:false)
//   • activityId: 'walking'
//   • emoji: '🚶'
//
// Honesty contract
// ─────────────────
// Route type (loop / out_and_back / linear) comes verbatim from OSRM geometry
// classification — never overridden. No mock routes. No fake data.
// If OSRM returns nothing, an honest error is thrown.
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

/** Comfortable walking pace used for waypoint arrival-time estimates. */
const PACE_MIN_PER_KM = 15

const WALKING_CONFIG: RouteResultConfig = {
  activityId:   'walking',
  paceMinPerKm: PACE_MIN_PER_KM,
  emoji:        '🚶',
  activityVerb: 'walking',
}

// ── Singleton provider ────────────────────────────────────────────────────────

const routeProvider = new OsrmRouteProvider()

// ── Public: convert any RouteCandidate → PlannerResult ───────────────────────

/**
 * Converts a RouteCandidate to a complete PlannerResult for Walking.
 *
 * Called by the route-selection UI when the user selects a route — no second
 * OSRM request is made. The result is passed directly to RunTracker.
 */
export function candidateToPlannerResultForWalking(
  candidate: RouteCandidate,
  context: {
    goldenWindow: GoldenWindowLike
    locationName?: string
  },
  prefs: RoutePreferences = DEFAULT_ROUTE_PREFERENCES,
): PlannerResult {
  return buildRoutePlannerResult(candidate, context, prefs, WALKING_CONFIG)
}

// ── Planner definition ────────────────────────────────────────────────────────

export const walkingPlanner: PlannerDefinition = {
  id:          'walking-planner',
  activityId:  'walking',
  kind:        'route',
  name:        'Walking Route Planner',
  description: 'Finds real walking routes near your planning location using OSRM and OpenStreetMap.',

  async plan(request: PlannerRequest): Promise<PlannerResult> {
    const {
      goldenWindow,
      groupLocation,
      locationName,
      routePreferences,
    } = request

    // Build route preferences, falling back to walking defaults
    const prefs: RoutePreferences = routePreferences ?? {
      ...DEFAULT_ROUTE_PREFERENCES,
      distanceKm: request.desiredDistanceKm ?? DEFAULT_ROUTE_PREFERENCES.distanceKm,
      routeTypePreference:
        request.preferLoop === true  ? 'loop' :
        request.preferLoop === false ? 'out_and_back' :
        DEFAULT_ROUTE_PREFERENCES.routeTypePreference,
    }

    // ── 1. Require a timing window ────────────────────────────────────────────
    // Either a Golden Window or a shared availability window derived by the UI.
    // The planner does not invent a start time.
    if (!goldenWindow) {
      throw new Error(
        'No availability window found. Add your availability so Nexus knows when you want to walk.',
      )
    }

    // ── 2. Require planning location ──────────────────────────────────────────
    if (!groupLocation) {
      throw new Error(
        'Set a planning location so Nexus can find walking routes nearby.',
      )
    }

    // ── 3. Fetch candidates from OSRM (foot profile) ──────────────────────────
    const config = getRouteConfigForActivity('walking')

    const rawCandidates = await routeProvider.getRoutes('walking', groupLocation, {
      radiusMetres:      groupLocation.radiusMetres ?? config?.defaultSearchRadiusMetres ?? 8_000,
      maxRoutes:         5,
      desiredDistanceKm: prefs.distanceKm,
      preferLoop:        prefs.routeTypePreference !== 'out_and_back',
    })

    if (rawCandidates.length === 0) {
      throw new Error(
        'No walking routes could be found near this location via OpenStreetMap. ' +
        'This may indicate limited road/path data in the area, or a temporary ' +
        'connectivity issue with the routing service. Try a different planning location.',
      )
    }

    // ── 4. Recalculate duration at walking pace ───────────────────────────────
    // The OSRM provider stores estimatedMinutes using running pace by default.
    // Overwrite with the correct walking pace before scoring/display.
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
    const result = buildRoutePlannerResult(best, { goldenWindow, locationName }, prefs, WALKING_CONFIG)

    // Attach all candidates for the multi-route selection UI
    result.allCandidates = rankedCandidates

    return result
  },
}
