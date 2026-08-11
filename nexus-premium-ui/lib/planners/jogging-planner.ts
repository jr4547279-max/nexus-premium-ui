// ─────────────────────────────────────────────────────────────────────────────
// Jogging Planner
// ─────────────────────────────────────────────────────────────────────────────
// Accepts a PlannerRequest and returns a PlannerResult with kind:'route'.
//
// Data pipeline:
//   1. Require a Golden Window (determines WHEN the group runs).
//   2. Require a group location (determines WHERE routes are searched).
//   3. Call OsrmRouteProvider to fetch up to 5 real route candidates.
//   4. Score candidates with preference-aware weights.
//   5. Assign quality labels ("Best Match", "Best Loop", etc.).
//   6. Return the best candidate as the main plan + allCandidates for multi-route UI.
//
// Honesty contract
// ─────────────────
// Route type (loop / out_and_back / linear) comes from geometry measurement
// inside OsrmRouteProvider. This planner trusts that classification completely
// and surfaces it verbatim — it never overrides it.
//
// No mock routes. If OSRM returns nothing, an honest error is thrown.
// If a loop is requested but none exists, the honest best alternative is returned
// with a clear explanation — never a relabelled out-and-back.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PlannerDefinition,
  PlannerRequest,
  PlannerResult,
  PlannerStop,
  MatchQuality,
  RouteCandidate,
  RoutePreferences,
  GoldenWindowLike,
} from './types'
import { DEFAULT_ROUTE_PREFERENCES } from './types'
import { OsrmRouteProvider } from './providers/osrm-route-provider'
import { getRouteConfigForActivity } from './providers/route-provider'
import { addMinutesToTime, format12h } from './scoring'
import { normalizeRouteCoords } from '../running/geo'

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Running pace: 6 min/km — used to estimate arrival times at waypoints. */
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
      wp.waypointType === 'start' ? 'Start'
      : wp.waypointType === 'end' ? 'Finish'
      : wp.waypointType === 'poi' ? 'Turnaround'
      : 'Checkpoint'

    return {
      order:               i + 1,
      waypoint:            wp,
      arrivalTime,
      departureTime:       arrivalTime,
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

// ── Preference-aware scoring ──────────────────────────────────────────────────

/**
 * Scores a candidate given the user's route preferences.
 * Components:
 *   distanceFit:   1.0 at exact match, decreasing linearly with deviation.
 *   typeScore:     strong bonus for matching preferred type; penalty if mismatched.
 *   loopBonus:     geometry quality reward for genuine loops.
 *   retracePen:    penalty for high retracing (poor exploration).
 *   surfaceScore:  bonus/penalty based on road vs path fraction vs preference.
 *   diffScore:     small bonus when difficulty matches (distance proxy only).
 */
function scoreWithPreferences(
  candidate:  RouteCandidate,
  prefs:      RoutePreferences,
): number {
  const { distanceKm, routeTypePreference, surfacePreference } = prefs

  // Distance fit
  const distFit = Math.max(0, 1 - Math.abs(candidate.totalDistanceKm - distanceKm) / distanceKm)

  // Route type preference bonus / penalty
  let typeScore = 0
  if (routeTypePreference === 'loop') {
    typeScore = candidate.routeType === 'loop' ? 2.0 : -0.5
  } else if (routeTypePreference === 'out_and_back') {
    typeScore = candidate.routeType === 'out_and_back' ? 1.0 : 0
  }
  // 'any' → typeScore = 0 (neutral)

  // Loop geometry bonus (genuine circuit quality)
  const loopBonus  = candidate.routeType === 'loop' ? candidate.loopQuality * 0.5 : 0

  // Retrace penalty
  const retracePen = candidate.retraceRatio * 0.3

  // Surface preference
  let surfaceScore = 0
  const sp = candidate.surfaceProfile
  if (sp && surfacePreference !== 'mixed') {
    if (surfacePreference === 'paths') {
      surfaceScore = Math.max(-0.5, 0.5 - sp.roadFraction * 1.5)
    } else if (surfacePreference === 'roads') {
      surfaceScore = Math.max(-0.5, sp.roadFraction * 1.5 - 0.5)
    }
  }

  // Difficulty (distance proxy — OSRM has no elevation data)
  let diffScore = 0
  if (prefs.difficulty !== 'any') {
    const isEasy       = candidate.totalDistanceKm <= 4
    const isModerate   = candidate.totalDistanceKm <= 8
    const isChallenging = !isModerate
    const matches =
      (prefs.difficulty === 'easy'        &&  isEasy)       ||
      (prefs.difficulty === 'moderate'    &&  isModerate && !isEasy) ||
      (prefs.difficulty === 'challenging' &&  isChallenging)
    diffScore = matches ? 0.2 : -0.1
  }

  return distFit + typeScore + loopBonus - retracePen + surfaceScore + diffScore
}

/**
 * Assigns human-readable quality labels to scored candidates.
 * Labels are contextual — they reflect what this candidate does best
 * relative to the preference context. Only facts supported by the data
 * are claimed (no elevation labels, no "fastest" without timing data).
 */
function assignQualityLabels(
  scored: Array<{ candidate: RouteCandidate; score: number }>,
  prefs:  RoutePreferences,
): void {
  if (scored.length === 0) return

  const loopsExist = scored.some(s => s.candidate.routeType === 'loop')

  scored.forEach(({ candidate, score }, i) => {
    candidate.compositeScore = score

    if (i === 0) {
      // Best candidate — contextual label based on preference
      if (prefs.routeTypePreference === 'loop' && candidate.routeType === 'loop') {
        candidate.qualityLabel = 'Best Loop'
      } else if (prefs.routeTypePreference === 'out_and_back' && candidate.routeType === 'out_and_back') {
        candidate.qualityLabel = 'Best Out & Back'
      } else if (candidate.routeType === 'loop') {
        candidate.qualityLabel = 'Best Route'
      } else {
        candidate.qualityLabel = 'Best Match'
      }
    } else if (candidate.routeType === 'loop') {
      candidate.qualityLabel = loopsExist ? 'Loop Option' : 'Best Loop'
    } else {
      const sp = candidate.surfaceProfile
      if (sp && sp.roadFraction < 0.25) {
        candidate.qualityLabel = 'Most Paths'
      } else if (sp && sp.roadFraction > 0.70) {
        candidate.qualityLabel = 'Road Route'
      } else {
        const distDiff = Math.abs(candidate.totalDistanceKm - prefs.distanceKm)
        candidate.qualityLabel = distDiff < 0.5 ? 'Close Match' : 'Alternative'
      }
    }
  })
}

// ── Route type labels for explanation text ────────────────────────────────────

function routeTypeLabel(candidate: RouteCandidate): string {
  switch (candidate.routeType) {
    case 'loop':         return 'loop'
    case 'out_and_back': return 'out-and-back route'
    case 'linear':       return 'route'
  }
}

/**
 * Builds a factual explanation string.
 * Honestly discloses when a requested loop could not be found.
 */
function buildExplanation(
  candidate:     RouteCandidate,
  locationLabel: string,
  paceLabel:     string,
  prefs:         RoutePreferences,
): string {
  const distLabel = candidate.totalDistanceKm.toFixed(1)
  const typeLabel = routeTypeLabel(candidate)

  let base =
    `Nexus found a ${distLabel} km ${typeLabel}${locationLabel} using real ` +
    `OpenStreetMap road and path data, routed by OSRM. ` +
    `Estimated running time: ~${candidate.estimatedMinutes} min at ${paceLabel}. ` +
    `${candidate.surfaceSummary ?? ''}`

  if (prefs.routeTypePreference === 'loop' && candidate.routeType === 'out_and_back') {
    base +=
      ` No genuinely loop-shaped route was found at this distance near this location. ` +
      `This is the best available out-and-back route ` +
      `(${Math.round(candidate.retraceRatio * 100)}% of path retraced). ` +
      `Out-and-back routes are common in areas with limited path networks or natural barriers.`
  } else if (candidate.routeType === 'out_and_back') {
    base +=
      ` Note: this route retraces ${Math.round(candidate.retraceRatio * 100)}% of its path. ` +
      `Out-and-back routes are common in constrained urban areas.`
  }

  return base
}

// ── Public: convert any RouteCandidate → PlannerResult ───────────────────────

/**
 * Converts a RouteCandidate to a complete PlannerResult.
 *
 * Called by RunRoutePlanner when the user selects a different route from the
 * multi-route UI — avoids a second OSRM request since all candidate data is
 * already available. The resulting PlannerResult is passed to RunTracker.
 */
export function candidateToPlannerResult(
  candidate: RouteCandidate,
  context: {
    goldenWindow: GoldenWindowLike
    locationName?: string
  },
  prefs: RoutePreferences = DEFAULT_ROUTE_PREFERENCES,
): PlannerResult {
  const { goldenWindow, locationName } = context
  const startTime = goldenWindow.start_time
  const stops     = waypointsToStops(candidate, startTime)

  const matchQuality = (goldenWindow.match_quality ?? 'partial') as MatchQuality
  const groupMatchPercent =
    goldenWindow.available_member_count != null && goldenWindow.total_member_count
      ? Math.round((goldenWindow.available_member_count / goldenWindow.total_member_count) * 100)
      : undefined

  const locationLabel = locationName ? ` near ${locationName}` : ''
  const paceLabel     = `${PACE_MIN_PER_KM} min/km`
  const dayName       = dayLabel(goldenWindow.day_of_week)

  const warnings: string[] = [
    'Elevation data is not available via OSRM. Surface types are inferred from ' +
    'OpenStreetMap footway/path tags.',
  ]
  if (matchQuality === 'compromise') {
    warnings.unshift('This time is a best-effort compromise — not everyone is fully available.')
  }

  // resolvedLocation: record the exact coordinates and display name so the UI
  // can show the user where routes are being generated. Critical for place names
  // that exist in multiple countries (e.g. "Willingdon" — East Sussex UK and
  // Alberta Canada). The start waypoint lat/lng are ground truth; locationName
  // is the human-readable label stored by the group.
  const startWp = candidate.waypoints[0]
  const resolvedLocation = startWp
    ? {
        lat:         startWp.lat,
        lng:         startWp.lng,
        displayName: locationName ?? `${startWp.lat.toFixed(4)}, ${startWp.lng.toFixed(4)}`,
      }
    : undefined

  return {
    kind:               'route',
    title:              `🏃 ${candidate.name}`,
    subtitle:           `${dayName} · ${format12h(startTime)}`,
    activityId:         'jogging',
    durationMinutes:    candidate.estimatedMinutes,
    estimatedCostLabel: '',
    totalDistanceKm:    candidate.totalDistanceKm,
    walkingMinutes:     0,
    stops,
    overallScore:       80,
    explanation:        buildExplanation(candidate, locationLabel, paceLabel, prefs),
    warnings,
    generatedAt:        new Date().toISOString(),
    goldenWindowQuality: matchQuality,
    groupMatchPercent,
    dataSource:         'real',
    providerName:       candidate.providerName ?? 'OSRM · OpenStreetMap',
    surfaceSummary:     candidate.surfaceSummary,
    routeGrade:         candidate.grade,
    routeType:          candidate.routeType,
    isLoop:             candidate.routeType === 'loop',
    elevationGainMetres: undefined,
    resolvedLocation,
    // Explicitly validate and normalise coordinate order to [lng, lat] GeoJSON.
    // normalizeRouteCoords() uses the start waypoint's named lat/lng as a reference
    // and emits a loud console.error if a swap is detected, identifying the upstream bug.
    routeGeometry: (() => {
      const geom = candidate.geometry
      if (!geom?.length) return geom
      if (!startWp) return geom
      return normalizeRouteCoords(geom, startWp.lat, startWp.lng)
    })(),
  }
}

// ── Planner definition ────────────────────────────────────────────────────────

export const joggingPlanner: PlannerDefinition = {
  id:          'jogging-planner',
  activityId:  'jogging',
  kind:        'route',
  name:        'Jogging Route Planner',
  description: 'Finds real running routes near your group meeting point using OSRM and OpenStreetMap.',

  async plan(request: PlannerRequest): Promise<PlannerResult> {
    const {
      goldenWindow,
      groupLocation,
      locationName,
      routePreferences,
    } = request

    // Use explicit route preferences if provided, otherwise fall back to request hints
    const prefs: RoutePreferences = routePreferences ?? {
      ...DEFAULT_ROUTE_PREFERENCES,
      distanceKm: request.desiredDistanceKm ?? DEFAULT_ROUTE_PREFERENCES.distanceKm,
      routeTypePreference:
        request.preferLoop === true  ? 'loop' :
        request.preferLoop === false ? 'out_and_back' :
        DEFAULT_ROUTE_PREFERENCES.routeTypePreference,
    }

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

    // ── 3. Fetch candidates from OSRM ─────────────────────────────────────────
    const config = getRouteConfigForActivity('jogging')

    // Ask for 5 candidates so we have enough diversity after preference scoring
    const rawCandidates = await routeProvider.getRoutes('jogging', groupLocation, {
      radiusMetres:      groupLocation.radiusMetres ?? config?.defaultSearchRadiusMetres ?? 3_000,
      maxRoutes:         5,
      desiredDistanceKm: prefs.distanceKm,
      preferLoop:        prefs.routeTypePreference !== 'out_and_back',
    })

    if (rawCandidates.length === 0) {
      throw new Error(
        'No running routes could be found near this location via OpenStreetMap. ' +
        'This may indicate limited road/path data in the area, or a temporary ' +
        'connectivity issue with the routing service. Try a different planning location.',
      )
    }

    // ── 4. Score candidates with preference weights ───────────────────────────
    const scored = rawCandidates.map(candidate => ({
      candidate,
      score: scoreWithPreferences(candidate, prefs),
    }))

    // Sort by preference-aware score (descending)
    scored.sort((a, b) => b.score - a.score)

    // Assign quality labels based on relative ranking
    assignQualityLabels(scored, prefs)

    const rankedCandidates = scored.map(s => s.candidate)

    // ── 5. Select best candidate ──────────────────────────────────────────────
    const best = rankedCandidates[0]!

    // ── 6. Build the main PlannerResult from the best candidate ───────────────
    const result = candidateToPlannerResult(best, { goldenWindow, locationName }, prefs)

    // Attach all candidates for the multi-route UI
    result.allCandidates = rankedCandidates

    return result
  },
}
