// ─────────────────────────────────────────────────────────────────────────────
// OSRM Route Provider — OpenStreetMap pedestrian routing, no API key required
// ─────────────────────────────────────────────────────────────────────────────
// Generates candidate jogging loops around a group planning location by:
//   1. Placing a via-waypoint at ~(targetKm / 2) distance in each of 8 compass
//      directions from the start point.
//   2. Requesting an OSRM foot route: start → via → start for each direction.
//   3. Filtering to routes within ±60 % of the target distance.
//   4. Returning the top N candidates sorted by closeness to target.
//
// Data source: OSRM public instance (router.project-osrm.org), foot profile.
// Data licence: OpenStreetMap contributors, ODbL.
// CORS: OSRM public API sends Access-Control-Allow-Origin: * — safe to call
//       directly from the browser without a server-side proxy.
//
// Limitations honestly documented:
//   - Elevation not provided by OSRM standard API (marked unavailable).
//   - Surface detail not exposed per-segment (marked "Mixed paths and roads").
//   - Routes may double back on same streets in low-connectivity areas.
//   - The public OSRM instance has a fair-use rate limit; for production use
//     a self-hosted instance.
// ─────────────────────────────────────────────────────────────────────────────

import type { RouteCandidate, RouteProvider, PlannerWaypoint } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const OSRM_BASE       = 'https://router.project-osrm.org'
const TIMEOUT_MS      = 15_000
const EARTH_KM        = 6371
const DEG             = Math.PI / 180
const RAD             = 180 / Math.PI

/** Conservative jogging pace (6 min/km ≈ 10 km/h) used for estimatedMinutes. */
const RUNNING_PACE_MIN_PER_KM = 6

/** Minimum route length — avoids trivial routes where OSRM can't navigate. */
const MIN_ROUTE_KM = 0.3

/**
 * Max number of sampled waypoints returned per route.
 * OSRM geometry can have thousands of points — we sample ~12 for the UI.
 */
const MAX_WAYPOINTS = 12

// ── Compass directions used to generate candidate via-waypoints ───────────────

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

/**
 * Returns the point at `distKm` from (lat, lng) in the given compass bearing.
 * Uses the spherical-earth forward-azimuth formula.
 */
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

// ── OSRM types ────────────────────────────────────────────────────────────────

interface OsrmRoute {
  distance: number   // metres
  duration: number   // seconds
  geometry: {
    type: 'LineString'
    coordinates: Array<[number, number]>  // [lng, lat] — GeoJSON convention
  }
}

interface OsrmResponse {
  code:    string
  routes?: OsrmRoute[]
  message?: string
}

// ── Cumulative distance along a coordinate path ───────────────────────────────

function cumulativeDistances(coords: Array<[number, number]>): number[] {
  const cum: number[] = [0]
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1]!
    const [lng2, lat2] = coords[i]!
    cum.push(cum[i - 1]! + haversineKm(lat1!, lng1!, lat2!, lng2!))
  }
  return cum
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class OsrmRouteProvider implements RouteProvider {
  /**
   * Fetch candidate jogging routes around `location`.
   *
   * @param activityId  Must be 'jogging' (or a compatible foot-pace activity).
   * @param location    Group planning lat/lng — used as the loop start/end.
   * @param options     desiredDistanceKm (default 5), maxRoutes (default 3).
   */
  async getRoutes(
    _activityId: string,
    location: { lat: number; lng: number },
    options: {
      radiusMetres?:       number
      maxRoutes?:          number
      desiredDistanceKm?:  number
      preferLoop?:         boolean
    } = {},
  ): Promise<RouteCandidate[]> {
    const { lat, lng } = location
    const targetKm  = options.desiredDistanceKm ?? 5
    const maxRoutes = options.maxRoutes ?? 3

    // Via-waypoint at half the target distance so the full loop ≈ target.
    const viaKm = targetKm / 2

    // Fire all 8 direction queries in parallel.
    // Promise.allSettled — a single OSRM failure doesn't cancel the rest.
    const settled = await Promise.allSettled(
      BEARINGS.map(({ bearing, label }) =>
        this.queryLoop(lat, lng, viaKm, bearing, label, targetKm),
      ),
    )

    const candidates: RouteCandidate[] = settled
      .filter((r): r is PromiseFulfilledResult<RouteCandidate | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((c): c is RouteCandidate => c !== null)

    if (candidates.length === 0) return []

    // Accept routes within ±60 % of target distance
    const toleranceLow  = targetKm * 0.4
    const toleranceHigh = targetKm * 1.6

    return candidates
      .filter(c => c.totalDistanceKm >= toleranceLow && c.totalDistanceKm <= toleranceHigh)
      .sort((a, b) =>
        Math.abs(a.totalDistanceKm - targetKm) - Math.abs(b.totalDistanceKm - targetKm),
      )
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

    // Three coordinates: start → via → start (creates a loop)
    // OSRM GeoJSON format: longitude,latitude
    const coordStr = [
      `${startLng.toFixed(6)},${startLat.toFixed(6)}`,
      `${via.lng.toFixed(6)},${via.lat.toFixed(6)}`,
      `${startLng.toFixed(6)},${startLat.toFixed(6)}`,
    ].join(';')

    const url =
      `${OSRM_BASE}/route/v1/foot/${coordStr}` +
      `?overview=full&geometries=geojson&continue_straight=false`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) return null

      const data = (await res.json()) as OsrmResponse
      if (data.code !== 'Ok' || !data.routes?.length) return null

      const route = data.routes[0]!
      const coords = route.geometry.coordinates   // [lng, lat][]

      if (coords.length < 2) return null

      const distKm = Math.round((route.distance / 1000) * 100) / 100
      if (distKm < MIN_ROUTE_KM) return null

      // Cumulative distances along the real route geometry
      const cumDist = cumulativeDistances(coords)

      // Sample coords to ≤ MAX_WAYPOINTS points (start + interior + end)
      const waypoints = this.sampleWaypoints(coords, cumDist, directionName)

      // Grade based on distance (no elevation data available from OSRM)
      const grade: RouteCandidate['grade'] =
        distKm < 3  ? 'easy'
        : distKm < 8  ? 'moderate'
        : distKm < 15 ? 'hard'
        : 'expert'

      // Route name: round to 1 dp + direction
      const distLabel = (Math.round(distKm * 10) / 10).toFixed(1)
      const nameSuffix = targetKm <= 3 ? 'Short Loop' : targetKm <= 8 ? 'Loop' : 'Long Run'

      return {
        id:              `osrm-${bearingDeg}`,
        name:            `${distLabel} km ${directionName} ${nameSuffix}`,
        waypoints,
        totalDistanceKm: distKm,
        estimatedMinutes: Math.round(distKm * RUNNING_PACE_MIN_PER_KM),
        surfaceSummary:  'Mixed paths and roads (OpenStreetMap)',
        grade,
        isLoop:          true,
        dataSource:      'real',
        providerName:    'OSRM · OpenStreetMap',
      }
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  // ── Waypoint sampler ──────────────────────────────────────────────────────

  /**
   * Converts a GeoJSON coordinate array into PlannerWaypoint[].
   * Always includes the first and last coordinate; samples interior points
   * evenly so the total stays within MAX_WAYPOINTS.
   */
  private sampleWaypoints(
    coords:        Array<[number, number]>,
    cumDist:       number[],
    directionName: string,
  ): PlannerWaypoint[] {
    const n = coords.length

    // Build index list: always include 0 and n-1; sample middle evenly
    const indices = new Set<number>([0, n - 1])
    const interiorCount = Math.min(MAX_WAYPOINTS - 2, n - 2)
    if (interiorCount > 0) {
      for (let i = 0; i < interiorCount; i++) {
        indices.add(1 + Math.round((i / (interiorCount - 1)) * (n - 2)))
      }
    }

    const sortedIndices = [...indices].sort((a, b) => a - b)
    const totalDist = cumDist[n - 1] ?? 0

    // Midpoint index — used for the turnaround label
    const midIdx = Math.round(n / 2)

    return sortedIndices.map((idx, slot): PlannerWaypoint => {
      const [lng, lat] = coords[idx]!
      const isStart    = idx === 0
      const isEnd      = idx === n - 1
      const isMid      = Math.abs(idx - midIdx) < Math.ceil(n / 10)

      return {
        id:              `osrm-wp-${idx}`,
        name:
          isStart ? 'Start / Finish'
          : isEnd ? 'Return'
          : isMid ? `${directionName} Turnaround`
          : `Checkpoint ${slot}`,
        lat:             lat!,
        lng:             lng!,
        waypointType:
          isStart ? 'start'
          : isEnd  ? 'end'
          : isMid  ? 'poi'
          : 'checkpoint',
        distanceFromStart: Math.round((cumDist[idx] ?? 0) * 100) / 100,
        description:
          isStart   ? `Loop start & finish · total ${(Math.round(totalDist * 10) / 10).toFixed(1)} km`
          : isMid   ? `~${((cumDist[idx] ?? 0)).toFixed(1)} km — ${directionName} turnaround`
          : undefined,
        isRealData: true,
      }
    })
  }
}
