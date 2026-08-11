// ─────────────────────────────────────────────────────────────────────────────
// Route Planner Utilities — shared across all route-based activities
// ─────────────────────────────────────────────────────────────────────────────
// Extracted from jogging-planner.ts so that Walking, Hiking, Cycling, etc.
// can reuse identical preference scoring, candidate ranking, and result
// construction without duplicating logic.
//
// Activity-specific callers supply:
//   paceMinPerKm   — governs waypoint arrival-time estimates
//   activityId     — stored on PlannerResult for downstream consumers
//   emoji          — prepended to the route title (🏃 | 🚶 | 🚴 …)
//   activityVerb   — "running" | "walking" | "cycling" — used in explanations
// ─────────────────────────────────────────────────────────────────────────────

import type {
  RouteCandidate,
  RoutePreferences,
  PlannerResult,
  PlannerStop,
  GoldenWindowLike,
  MatchQuality,
} from './types'
import { DEFAULT_ROUTE_PREFERENCES } from './types'
import { addMinutesToTime, format12h } from './scoring'
import { normalizeRouteCoords } from '../running/geo'

// ── Day-name helper ────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function dayName(dow: number): string {
  return DAY_LABELS[dow] ?? 'Unknown'
}

// ── Route-type text ────────────────────────────────────────────────────────────

export function routeTypeLabel(candidate: RouteCandidate): string {
  switch (candidate.routeType) {
    case 'loop':         return 'loop'
    case 'out_and_back': return 'out-and-back route'
    case 'linear':       return 'route'
  }
}

// ── Waypoint → stop conversion ────────────────────────────────────────────────

/**
 * Converts a RouteCandidate's waypoints into PlannerStop[].
 * Arrival times are estimated from cumulative distance and the activity pace.
 *
 * @param paceMinPerKm  Activity-specific pace (6 for jogging, 15 for walking …)
 */
export function waypointsToStops(
  candidate:    RouteCandidate,
  startTime:    string,
  paceMinPerKm: number,
): PlannerStop[] {
  const totalKm  = candidate.totalDistanceKm
  const totalMin = totalKm * paceMinPerKm

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

// ── Preference-aware scoring ───────────────────────────────────────────────────

/**
 * Scores a RouteCandidate against the user's preferences.
 * Purely generic — no activity-specific constants.
 */
export function scoreWithPreferences(
  candidate: RouteCandidate,
  prefs:     RoutePreferences,
): number {
  const { distanceKm, routeTypePreference, surfacePreference } = prefs

  const distFit = Math.max(0, 1 - Math.abs(candidate.totalDistanceKm - distanceKm) / distanceKm)

  let typeScore = 0
  if (routeTypePreference === 'loop') {
    typeScore = candidate.routeType === 'loop' ? 2.0 : -0.5
  } else if (routeTypePreference === 'out_and_back') {
    typeScore = candidate.routeType === 'out_and_back' ? 1.0 : 0
  }

  const loopBonus  = candidate.routeType === 'loop' ? candidate.loopQuality * 0.5 : 0
  const retracePen = candidate.retraceRatio * 0.3

  let surfaceScore = 0
  const sp = candidate.surfaceProfile
  if (sp && surfacePreference !== 'mixed') {
    if (surfacePreference === 'paths') {
      surfaceScore = Math.max(-0.5, 0.5 - sp.roadFraction * 1.5)
    } else if (surfacePreference === 'roads') {
      surfaceScore = Math.max(-0.5, sp.roadFraction * 1.5 - 0.5)
    }
  }

  let diffScore = 0
  if (prefs.difficulty !== 'any') {
    const isEasy        = candidate.totalDistanceKm <= 4
    const isModerate    = candidate.totalDistanceKm <= 8
    const isChallenging = !isModerate
    const matches =
      (prefs.difficulty === 'easy'        &&  isEasy)       ||
      (prefs.difficulty === 'moderate'    &&  isModerate && !isEasy) ||
      (prefs.difficulty === 'challenging' &&  isChallenging)
    diffScore = matches ? 0.2 : -0.1
  }

  return distFit + typeScore + loopBonus - retracePen + surfaceScore + diffScore
}

// ── Quality label assignment ───────────────────────────────────────────────────

/**
 * Assigns human-readable quality labels to scored candidates.
 * Mutates `candidate.qualityLabel` and `candidate.compositeScore` in place.
 */
export function assignQualityLabels(
  scored: Array<{ candidate: RouteCandidate; score: number }>,
  prefs:  RoutePreferences,
): void {
  if (scored.length === 0) return
  const loopsExist = scored.some(s => s.candidate.routeType === 'loop')

  scored.forEach(({ candidate, score }, i) => {
    candidate.compositeScore = score
    if (i === 0) {
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

// ── Explanation builder ────────────────────────────────────────────────────────

/**
 * Builds a factual explanation string.
 * @param activityVerb  e.g. "running" | "walking"
 */
export function buildExplanation(
  candidate:    RouteCandidate,
  locationLabel: string,
  paceLabel:    string,
  prefs:        RoutePreferences,
  activityVerb: string,
): string {
  const distLabel = candidate.totalDistanceKm.toFixed(1)
  const typeLabel = routeTypeLabel(candidate)

  let base =
    `Nexus found a ${distLabel} km ${typeLabel}${locationLabel} using real ` +
    `OpenStreetMap road and path data, routed by OSRM. ` +
    `Estimated ${activityVerb} time: ~${candidate.estimatedMinutes} min at ${paceLabel}. ` +
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

// ── Main shared converter ──────────────────────────────────────────────────────

export interface RouteResultConfig {
  /** Activity ID stored on the PlannerResult (e.g. 'jogging', 'walking') */
  activityId:   string
  /** Activity-specific pace for waypoint arrival-time labels */
  paceMinPerKm: number
  /** Emoji prepended to the route title */
  emoji:        string
  /** Gerund used in explanation text ('running', 'walking', 'cycling' …) */
  activityVerb: string
}

/**
 * Converts a RouteCandidate to a complete PlannerResult.
 *
 * Called by the route-selection UI when the user taps "Start" — no second OSRM
 * request is made. The resulting PlannerResult is passed directly to RunTracker.
 */
export function buildRoutePlannerResult(
  candidate: RouteCandidate,
  context: {
    goldenWindow: GoldenWindowLike
    locationName?: string
  },
  prefs:  RoutePreferences = DEFAULT_ROUTE_PREFERENCES,
  config: RouteResultConfig,
): PlannerResult {
  const { goldenWindow, locationName } = context
  const { activityId, paceMinPerKm, emoji, activityVerb } = config

  const startTime = goldenWindow.start_time
  const stops     = waypointsToStops(candidate, startTime, paceMinPerKm)

  const matchQuality = (goldenWindow.match_quality ?? 'partial') as MatchQuality
  const groupMatchPercent =
    goldenWindow.available_member_count != null && goldenWindow.total_member_count
      ? Math.round((goldenWindow.available_member_count / goldenWindow.total_member_count) * 100)
      : undefined

  const locationLabel = locationName ? ` near ${locationName}` : ''
  const paceLabel     = `${paceMinPerKm} min/km`

  const warnings: string[] = [
    'Elevation data is not available via OSRM. Surface types are inferred from ' +
    'OpenStreetMap footway/path tags.',
  ]
  if (matchQuality === 'compromise') {
    warnings.unshift('This time is a best-effort compromise — not everyone is fully available.')
  }

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
    title:              `${emoji} ${candidate.name}`,
    subtitle:           `${dayName(goldenWindow.day_of_week)} · ${format12h(startTime)}`,
    activityId,
    durationMinutes:    candidate.estimatedMinutes,
    estimatedCostLabel: '',
    totalDistanceKm:    candidate.totalDistanceKm,
    walkingMinutes:     0,
    stops,
    overallScore:       80,
    explanation:        buildExplanation(candidate, locationLabel, paceLabel, prefs, activityVerb),
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
    // Validate and normalise coordinate order to [lng, lat] GeoJSON.
    routeGeometry: (() => {
      const geom = candidate.geometry
      if (!geom?.length) return geom
      if (!startWp) return geom
      return normalizeRouteCoords(geom, startWp.lat, startWp.lng)
    })(),
  }
}
