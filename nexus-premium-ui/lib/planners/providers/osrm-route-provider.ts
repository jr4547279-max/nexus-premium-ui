// ─────────────────────────────────────────────────────────────────────────────
// OSRM Route Provider — OpenStreetMap pedestrian routing, no API key required
// ─────────────────────────────────────────────────────────────────────────────
// Generates candidate jogging loops around a group planning location by:
//   1. Placing a via-waypoint at ~(targetKm / 2) distance in each of 8 compass
//      directions from the start point.
//   2. Requesting an OSRM foot route: start → via → start for each direction,
//      with steps=true to obtain real OSM road/path names per segment.
//   3. Computing a loop-quality score via shoelace polygon area — routes that
//      double back along the same path score near zero and are deprioritised
//      or labelled as linear routes rather than loops.
//   4. Filtering to routes within ±60% of the target distance.
//   5. Sorting by a composite score: distance match + loop quality.
//   6. Returning the top N candidates.
//
// Data source: OSRM public instance (router.project-osrm.org), foot profile.
// Data licence: OpenStreetMap contributors, ODbL.
// CORS: OSRM public API sends Access-Control-Allow-Origin: * — browser-safe.
//
// Limitations documented honestly:
//   - Elevation not provided by OSRM standard API (marked unavailable).
//   - Loop quality detection relies on geometry area heuristics; OSRM can
//     sometimes produce routes that look like loops but share path sections.
//   - Public OSRM instance has fair-use rate limits; self-host for production.
// ─────────────────────────────────────────────────────────────────────────────

import type { RouteCandidate, RouteProvider, PlannerWaypoint } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const OSRM_BASE            = 'https://router.project-osrm.org'
const TIMEOUT_MS           = 15_000
const EARTH_KM             = 6371
const DEG                  = Math.PI / 180
const RAD                  = 180 / Math.PI

/** Conservative jogging pace (6 min/km ≈ 10 km/h) used for estimatedMinutes. */
const RUNNING_PACE_MIN_PER_KM = 6

/** Minimum route length — avoids trivial routes where OSRM can't navigate. */
const MIN_ROUTE_KM = 0.3

/**
 * Target number of human-readable waypoints for the route card.
 * Includes start, a few interior named points, and finish.
 */
const TARGET_WAYPOINTS = 6

/**
 * Loop quality threshold.
 * Candidates below this score are labelled as routes (not loops).
 * Scale: 0 = perfect out-and-back, 1 = perfect circle.
 */
const LOOP_QUALITY_THRESHOLD = 0.12

// ── Compass directions ────────────────────────────────────────────────────────

const BEARINGS: Array<{ bearing: number; label: string }> = [
  { bearing: 0,   label: 'North'      },
  { bearing: 45,  label: 'North-East' },
  { bearing: 90,  label: 'East'       },
  { bearing: 135, label: 'South-East' },
  { bearing: 180, label: 'South'      },
  { bearing: 225, label: 'South-West' },
  { bearing: 270, label: 'West'       },
  { bearing: 315, label: 'North-West' },
]

// ── Geo utilities ─────────────────────────────────────────────────────────────

/** Haversine distance in km between two lat/lng points. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * DEG
  const dLng = (lng2 - lng1) * DEG
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLng / 2) ** 2
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Returns the point at `distKm` from (lat, lng) in the given compass bearing. */
function destinationPoint(
  lat: number, lng: number, distKm: number, bearingDeg: number,
): { lat: number; lng: number } {
  const latR = lat * DEG
  const lngR = lng * DEG
  const bearR = bearingDeg * DEG
  const angDist = distKm / EARTH_KM

  const lat2R = Math.asin(
    Math.sin(latR) * Math.cos(angDist) +
    Math.cos(latR) * Math.sin(angDist) * Math.cos(bearR),
  )
  const lng2R = lngR + Math.atan2(
    Math.sin(bearR) * Math.sin(angDist) * Math.cos(latR),
    Math.cos(angDist) - Math.sin(latR) * Math.sin(lat2R),
  )
  return { lat: lat2R * RAD, lng: lng2R * RAD }
}

/** Cumulative haversine distances along a [lng, lat] coordinate path. */
function cumulativeDistances(coords: Array<[number, number]>): number[] {
  const cum: number[] = [0]
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1]!
    const [lng2, lat2] = coords[i]!
    cum.push(cum[i - 1]! + haversineKm(lat1!, lng1!, lat2!, lng2!))
  }
  return cum
}

// ── Loop quality scoring ──────────────────────────────────────────────────────

/**
 * Computes a loop quality ratio for a route polygon using the shoelace formula.
 *
 * Returns a value in [0, 1]:
 *   0 = pure out-and-back (the polygon area is ~0 because forward and return
 *       paths cancel each other in the shoelace sum)
 *   1 = perfect circle (maximum area for the given perimeter)
 *
 * A value below LOOP_QUALITY_THRESHOLD means the route should NOT be labelled
 * as a "loop" regardless of whether start and end coordinates are the same.
 */
function computeLoopQuality(
  coords: Array<[number, number]>,
  totalDistKm: number,
): number {
  if (coords.length < 6 || totalDistKm < 0.3) return 0

  // Convert coords to local km offsets (flat-earth approximation, good for < 50 km)
  const [lng0, lat0] = coords[0]!
  const cosLat = Math.cos(lat0! * DEG)

  let area = 0  // shoelace accumulator (km²)
  for (let i = 0; i < coords.length; i++) {
    const [lngA, latA] = coords[i]!
    const [lngB, latB] = coords[(i + 1) % coords.length]!
    const xA = (lngA! - lng0!) * 111.32 * cosLat
    const yA = (latA! - lat0!) * 110.54
    const xB = (lngB! - lng0!) * 111.32 * cosLat
    const yB = (latB! - lat0!) * 110.54
    area += xA * yB - xB * yA
  }
  const polygonAreaKm2 = Math.abs(area) / 2

  // For a perfect circle: area = L² / (4π)
  const maxCircleArea = (totalDistKm * totalDistKm) / (4 * Math.PI)

  return Math.min(1, polygonAreaKm2 / maxCircleArea)
}

// ── OSRM type definitions ─────────────────────────────────────────────────────

interface OsrmStep {
  name:     string      // OSM road/path name (empty string if unnamed)
  distance: number      // metres
  duration: number      // seconds
  geometry: {
    type:        'LineString'
    coordinates: Array<[number, number]>
  }
  maneuver: {
    location:      [number, number]   // [lng, lat]
    type:          string
    bearing_after: number
  }
  mode: string          // "walking"
}

interface OsrmLeg {
  distance: number
  duration: number
  summary:  string
  steps:    OsrmStep[]
}

interface OsrmRoute {
  distance: number
  duration: number
  geometry: {
    type:        'LineString'
    coordinates: Array<[number, number]>  // [lng, lat] — GeoJSON
  }
  legs: OsrmLeg[]
}

interface OsrmResponse {
  code:    string
  routes?: OsrmRoute[]
  message?: string
}

// ── Named segment extraction ───────────────────────────────────────────────────

interface NamedSegment {
  /** OSM name for this road/path segment */
  name:         string
  /** Cumulative km at the start of this segment */
  startDistKm:  number
  /** Cumulative km at the end of this segment */
  endDistKm:    number
}

/**
 * Reduces a flat list of OSRM steps into a deduplicated list of named segments.
 * Consecutive steps with the same name are merged into one segment.
 * Unnamed steps (name === '') are skipped.
 * Very short named segments (< 50 m) are also skipped to avoid noise.
 */
function buildNamedSegments(steps: OsrmStep[]): NamedSegment[] {
  const segments: NamedSegment[] = []
  let cumKm = 0

  for (const step of steps) {
    const distKm = step.distance / 1000
    const name   = step.name.trim()

    if (name && distKm >= 0.05) {
      const last = segments[segments.length - 1]
      if (last && last.name === name) {
        // Extend the current segment — same road continues
        last.endDistKm = cumKm + distKm
      } else {
        segments.push({
          name,
          startDistKm: cumKm,
          endDistKm:   cumKm + distKm,
        })
      }
    }

    cumKm += distKm
  }

  return segments
}

/**
 * Returns the best OSM road name for a position at `cumDistKm` along the route.
 *
 * Search order:
 *   1. A named segment that directly covers this position.
 *   2. The nearest named segment within 300 m (route distance).
 *   3. A direction-based fallback.
 */
function nameAtDistance(
  cumDistKm:     number,
  totalDistKm:   number,
  segments:      NamedSegment[],
  directionName: string,
  isTurnaround:  boolean,
): string {
  // 1. Find covering segment
  for (const seg of segments) {
    if (cumDistKm >= seg.startDistKm - 0.01 && cumDistKm <= seg.endDistKm + 0.01) {
      return isTurnaround ? `${seg.name} — turnaround` : seg.name
    }
  }

  // 2. Nearest named segment within 300 m
  let best: NamedSegment | undefined
  let bestDist = Infinity
  for (const seg of segments) {
    const mid = (seg.startDistKm + seg.endDistKm) / 2
    const d   = Math.abs(cumDistKm - mid)
    if (d < bestDist) { bestDist = d; best = seg }
  }
  if (best && bestDist < 0.3) {
    return isTurnaround ? `${best.name} — turnaround` : best.name
  }

  // 3. Cardinal/fraction-based fallback
  const frac = totalDistKm > 0 ? cumDistKm / totalDistKm : 0
  if (isTurnaround)        return `${directionName} turnaround`
  if (frac < 0.25)         return `${directionName} outbound`
  if (frac < 0.5)          return `${directionName} section`
  if (frac < 0.75)         return 'Return section'
  return 'Final stretch'
}

// ── Waypoint builder ─────────────────────────────────────────────────────────

/**
 * Builds a human-readable list of PlannerWaypoints from the full OSRM geometry.
 *
 * Strategy:
 *   - Always include Start (idx 0) and Finish (idx N-1).
 *   - Sample (TARGET_WAYPOINTS - 2) evenly-spaced interior positions.
 *   - For each position, look up the OSM road name via buildNamedSegments.
 *   - The position nearest the route midpoint is labelled as the turnaround.
 */
function buildWaypoints(
  coords:        Array<[number, number]>,
  cumDist:       number[],
  steps:         OsrmStep[],
  directionName: string,
): PlannerWaypoint[] {
  const n         = coords.length
  const totalKm   = cumDist[n - 1] ?? 0
  const segments  = buildNamedSegments(steps)
  const midIdx    = Math.round(n / 2)

  // Build evenly-spaced index set: start + interior + end
  const indices = new Set<number>([0, n - 1])
  const interiorCount = Math.max(0, Math.min(TARGET_WAYPOINTS - 2, n - 2))
  if (interiorCount > 0) {
    for (let i = 0; i < interiorCount; i++) {
      // Distribute interior indices evenly
      indices.add(1 + Math.round(((i + 1) / (interiorCount + 1)) * (n - 2)))
    }
  }

  const sortedIndices = [...indices].sort((a, b) => a - b)

  return sortedIndices.map((idx, slot): PlannerWaypoint => {
    const [lng, lat]     = coords[idx]!
    const isStart        = idx === 0
    const isEnd          = idx === n - 1
    const cumDistHere    = cumDist[idx] ?? 0
    // The turnaround is the interior point closest to the route midpoint
    const isTurnaround   = !isStart && !isEnd && Math.abs(idx - midIdx) < Math.ceil(n / 8)

    const name =
      isStart ? 'Start / Finish'
      : isEnd  ? 'Return to start'
      : nameAtDistance(cumDistHere, totalKm, segments, directionName, isTurnaround)

    const waypointType: PlannerWaypoint['waypointType'] =
      isStart ? 'start'
      : isEnd  ? 'end'
      : isTurnaround ? 'poi'
      : 'checkpoint'

    return {
      id:              `osrm-wp-${idx}`,
      name,
      lat:             lat!,
      lng:             lng!,
      waypointType,
      distanceFromStart: Math.round(cumDistHere * 100) / 100,
      description:
        isStart
          ? `Loop start & finish · ${(Math.round(totalKm * 10) / 10).toFixed(1)} km total`
          : isTurnaround
          ? `~${cumDistHere.toFixed(1)} km — ${directionName} turnaround`
          : undefined,
      isRealData: true,
    }
  })
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class OsrmRouteProvider implements RouteProvider {
  /**
   * Fetch candidate jogging routes around `location`.
   *
   * @param _activityId  Must be 'jogging' (or a compatible foot-pace activity).
   * @param location     Group planning lat/lng — used as the loop start/end.
   * @param options      desiredDistanceKm (default 5), maxRoutes (default 3).
   */
  async getRoutes(
    _activityId: string,
    location:    { lat: number; lng: number },
    options: {
      radiusMetres?:      number
      maxRoutes?:         number
      desiredDistanceKm?: number
      preferLoop?:        boolean
    } = {},
  ): Promise<RouteCandidate[]> {
    const { lat, lng } = location
    const targetKm  = options.desiredDistanceKm ?? 5
    const maxRoutes = options.maxRoutes ?? 3

    // Via-waypoint at half the target distance so the full loop ≈ target.
    const viaKm = targetKm / 2

    // Fire all 8 direction queries in parallel.
    const settled = await Promise.allSettled(
      BEARINGS.map(({ bearing, label }) =>
        this.queryLoop(lat, lng, viaKm, bearing, label, targetKm),
      ),
    )

    const candidates: RouteCandidate[] = settled
      .filter((r): r is PromiseFulfilledResult<RouteCandidate | null> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter((c): c is RouteCandidate => c !== null)

    if (candidates.length === 0) return []

    // Accept routes within ±60 % of target distance
    const toleranceLow  = targetKm * 0.4
    const toleranceHigh = targetKm * 1.6

    const filtered = candidates.filter(
      c => c.totalDistanceKm >= toleranceLow && c.totalDistanceKm <= toleranceHigh,
    )
    if (filtered.length === 0) return []

    // Composite sort: distance match (primary) + loop quality bonus
    // loopQuality is 0–1; treat 0.5 bonus as equivalent to being 1 km closer to target.
    const score = (c: RouteCandidate) =>
      Math.abs(c.totalDistanceKm - targetKm) - ((c as RouteCandidate & { loopQuality?: number }).loopQuality ?? 0) * 2

    return filtered
      .sort((a, b) => score(a) - score(b))
      .slice(0, maxRoutes)
  }

  // ── Single direction query ─────────────────────────────────────────────────

  private async queryLoop(
    startLat:      number,
    startLng:      number,
    viaKm:         number,
    bearingDeg:    number,
    directionName: string,
    targetKm:      number,
  ): Promise<RouteCandidate | null> {
    const via = destinationPoint(startLat, startLng, viaKm, bearingDeg)

    const coordStr = [
      `${startLng.toFixed(6)},${startLat.toFixed(6)}`,
      `${via.lng.toFixed(6)},${via.lat.toFixed(6)}`,
      `${startLng.toFixed(6)},${startLat.toFixed(6)}`,
    ].join(';')

    // steps=true → OSRM returns road/path names per segment
    const url =
      `${OSRM_BASE}/route/v1/foot/${coordStr}` +
      `?overview=full&geometries=geojson&steps=true&continue_straight=false`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const res = await fetch(url, {
        signal:  controller.signal,
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) return null

      const data = (await res.json()) as OsrmResponse
      if (data.code !== 'Ok' || !data.routes?.length) return null

      const route  = data.routes[0]!
      const coords = route.geometry.coordinates   // [lng, lat][]
      if (coords.length < 2) return null

      const distKm = Math.round((route.distance / 1000) * 100) / 100
      if (distKm < MIN_ROUTE_KM) return null

      // Cumulative distances along the full route geometry
      const cumDist = cumulativeDistances(coords)

      // Extract all steps from both legs (start→via and via→start)
      const allSteps = route.legs.flatMap(leg => leg.steps ?? [])

      // Build named waypoints from real OSM step data
      const waypoints = buildWaypoints(coords, cumDist, allSteps, directionName)

      // Grade based on distance (no elevation data available from OSRM)
      const grade: RouteCandidate['grade'] =
        distKm < 3  ? 'easy'
        : distKm < 8  ? 'moderate'
        : distKm < 15 ? 'hard'
        : 'expert'

      // Loop quality score — determines whether we call this a "loop"
      const loopQuality = computeLoopQuality(coords, distKm)
      const isGenuineLoop = loopQuality >= LOOP_QUALITY_THRESHOLD

      const distLabel  = (Math.round(distKm * 10) / 10).toFixed(1)
      // Label honestly based on actual loop geometry
      const nameSuffix = isGenuineLoop
        ? (targetKm <= 3 ? 'Short Loop' : targetKm <= 8 ? 'Loop' : 'Long Run')
        : (targetKm <= 3 ? 'Short Route' : 'Route')

      // RouteCandidate is extended with loopQuality for composite sorting.
      // The extra field is dropped when consumers spread/assign to RouteCandidate.
      const candidate: RouteCandidate & { loopQuality: number } = {
        id:               `osrm-${bearingDeg}`,
        name:             `${distLabel} km ${directionName} ${nameSuffix}`,
        waypoints,
        totalDistanceKm:  distKm,
        estimatedMinutes: Math.round(distKm * RUNNING_PACE_MIN_PER_KM),
        surfaceSummary:   'Paths and roads (OpenStreetMap)',
        grade,
        isLoop:           isGenuineLoop,
        dataSource:       'real',
        providerName:     'OSRM · OpenStreetMap',
        geometry:         coords,
        loopQuality,
      }
      return candidate
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}
