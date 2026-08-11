// ─────────────────────────────────────────────────────────────────────────────
// Jogging Planner
// ─────────────────────────────────────────────────────────────────────────────
// Accepts a PlannerRequest and returns a PlannerResult with kind:'route'.
//
// Data pipeline:
//   1.  Require a Golden Window (determines WHEN the group runs).
//   2.  Require a group location (determines WHERE routes are searched).
//   3.  Call OsrmRouteProvider to find real routes via OSRM foot routing.
//   4.  Convert the best RouteCandidate into a PlannerResult.
//
// Honesty contract
// ─────────────────
// Route type (loop / out_and_back / linear) comes from geometry measurement
// inside OsrmRouteProvider. This planner trusts that classification completely
// and surfaces it verbatim in the result — it never overrides it.
//
// No mock routes. If OSRM returns nothing, an honest error is thrown.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PlannerDefinition,
  PlannerRequest,
  PlannerResult,
  PlannerStop,
  MatchQuality,
  RouteCandidate,
} from './types'
import { OsrmRouteProvider } from './providers/osrm-route-provider'
import { getRouteConfigForActivity } from './providers/route-provider'
import { addMinutesToTime, format12h } from './scoring'

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Running pace: 6 min/km. Used to estimate arrival times at each waypoint. */
const PACE_MIN_PER_KM = 6

// ── Singleton provider ────────────────────────────────────────────────────────

const routeProvider = new OsrmRouteProvider()

// ── Helpers ───────────────────────────────────────────────────────────────────

function dayLabel(dow: number): string {
  return DAY_LABELS[dow] ?? 'Unknown'
}

/**
 * Converts a RouteCandidate's waypoints into PlannerStop[].
 * Arrival times are estimated from cumulative distance and running pace.
 */
function waypointsToStops(
  candidate: RouteCandidate,
  startTime: string,
): PlannerStop[] {
  const totalKm  = candidate.totalDistanceKm
  const totalMin = totalKm * PACE_MIN_PER_KM

  return candidate.waypoints.map((wp, i) => {
    const fraction    = totalKm > 0 ? wp.distanceFromStart / totalKm : 0
    const elapsedMin  = Math.round(fraction * totalMin)
    const arrivalTime = addMinutesToTime(startTime, elapsedMin)

    const role =
      wp.waypointType === 'start'  ? 'Start'
      : wp.waypointType === 'end'  ? 'Finish'
      : wp.waypointType === 'poi'  ? 'Turnaround'
      : 'Checkpoint'

    return {
      order:              i + 1,
      waypoint:           wp,
      arrivalTime,
      departureTime:      arrivalTime,
      walkingFromPrevious: 0,
      distanceFromPrevious: i > 0
        ? Math.round(
            (wp.distanceFromStart - (candidate.waypoints[i - 1]?.distanceFromStart ?? 0)) * 100,
          ) / 100
        : 0,
      score: {
        total: 0,
        breakdown: { rating: 0, distance: 0, price: 0, atmosphere: 0, openingHours: 0, capacity: 0 },
      },
      role,
      reason: wp.description ?? undefined,
    }
  })
}

// ── Route type labels for UI text ─────────────────────────────────────────────

function routeTypeLabel(candidate: RouteCandidate): string {
  switch (candidate.routeType) {
    case 'loop':         return 'loop'
    case 'out_and_back': return 'out-and-back route'
    case 'linear':       return 'route'
  }
}

/**
 * Builds the explanation string, honestly describing what was found.
 * Does NOT claim a loop unless the geometry was classified as one.
 */
function buildExplanation(
  candidate: RouteCandidate,
  locationLabel: string,
  paceLabel: string,
): string {
  const distLabel = candidate.totalDistanceKm.toFixed(1)
  const typeLabel = routeTypeLabel(candidate)

  let base =
    `Nexus found a ${distLabel} km ${typeLabel}${locationLabel} using real ` +
    `OpenStreetMap road and path data, routed by OSRM. ` +
    `Estimated running time: ~${candidate.estimatedMinutes} min at ${paceLabel}. ` +
    `${candidate.surfaceSummary ?? ''}`

  // Be transparent when no loop was found
  if (candidate.routeType === 'out_and_back') {
    base +=
      ` No genuinely loop-shaped route was found at this distance near this location — ` +
      `this is the best available out-and-back route (${Math.round(candidate.retraceRatio * 100)}% of path retraced). ` +
      `Out-and-back routes are common in areas with limited path networks or natural barriers.`
  }

  return base
}

// ── Planner definition ────────────────────────────────────────────────────────

export const joggingPlanner: PlannerDefinition = {
  id:          'jogging-planner',
  activityId:  'jogging',
  kind:        'route',
  name:        'Jogging Route Planner',
  description: 'Finds real running routes near your group meeting point using OSRM and OpenStreetMap.',

  async plan(request: PlannerRequest): Promise<PlannerResult> {
    const { goldenWindow, groupLocation, locationName, desiredDistanceKm, preferLoop } = request

    // ── 1. Require Golden Window ──────────────────────────────────────────────
    if (!goldenWindow) {
      throw new Error(
        'Find a Golden Window first — the jogging planner needs to know when your group is free.',
      )
    }

    // ── 2. Require planning location ──────────────────────────────────────────
    if (!groupLocation) {
      throw new Error(
        'Set a planning location so Nexus can find jogging routes nearby.',
      )
    }

    // ── 3. Load route config and fetch candidates ─────────────────────────────
    const config   = getRouteConfigForActivity('jogging')
    const targetKm = desiredDistanceKm ?? config?.defaultDistanceKm ?? 5

    const candidates = await routeProvider.getRoutes('jogging', groupLocation, {
      radiusMetres:      groupLocation.radiusMetres ?? config?.defaultSearchRadiusMetres ?? 3_000,
      maxRoutes:         3,
      desiredDistanceKm: targetKm,
      preferLoop:        preferLoop ?? config?.defaultPreferLoop ?? true,
    })

    if (candidates.length === 0) {
      throw new Error(
        'No running routes could be found near this location via OpenStreetMap. ' +
        'This may indicate limited road/path data in the area, or a temporary ' +
        'connectivity issue with the routing service. Try a different planning location.',
      )
    }

    // ── 4. Select best route ──────────────────────────────────────────────────
    // Provider returns candidates already sorted: loops first, then by composite score.
    const best = candidates[0]!

    // ── 5. Build stops ────────────────────────────────────────────────────────
    const startTime = goldenWindow.start_time
    const stops     = waypointsToStops(best, startTime)

    // ── 6. Assemble result metadata ───────────────────────────────────────────
    const gw              = goldenWindow
    const matchQuality    = (gw.match_quality ?? 'partial') as MatchQuality
    const groupMatchPercent =
      gw.available_member_count != null && gw.total_member_count
        ? Math.round((gw.available_member_count / gw.total_member_count) * 100)
        : undefined

    const dayName       = dayLabel(gw.day_of_week)
    const locationLabel = locationName ? ` near ${locationName}` : ''
    const paceLabel     = `${PACE_MIN_PER_KM} min/km`

    const warnings: string[] = []
    if (matchQuality === 'compromise') {
      warnings.push(
        'This time is a best-effort compromise — not everyone is fully available.',
      )
    }
    warnings.push(
      'Elevation data is not available via OSRM. Surface types are inferred from ' +
      'OpenStreetMap footway/path tags but not shown per-segment.',
    )

    return {
      kind:               'route',
      title:              `🏃 ${best.name}`,
      subtitle:           `${dayName} · ${format12h(startTime)}`,
      activityId:         'jogging',
      durationMinutes:    best.estimatedMinutes,
      estimatedCostLabel: '',
      totalDistanceKm:    best.totalDistanceKm,
      walkingMinutes:     0,
      stops,
      overallScore:       80,
      explanation:        buildExplanation(best, locationLabel, paceLabel),
      warnings,
      generatedAt:        new Date().toISOString(),
      goldenWindowQuality: matchQuality,
      groupMatchPercent,
      dataSource:         'real',
      providerName:       best.providerName ?? 'OSRM · OpenStreetMap',
      surfaceSummary:     best.surfaceSummary,
      routeGrade:         best.grade,
      // ── Route classification — directly from geometry measurement ──────────
      routeType:          best.routeType,
      isLoop:             best.routeType === 'loop',
      elevationGainMetres: undefined,
      routeGeometry:      best.geometry,
    }
  },
}
