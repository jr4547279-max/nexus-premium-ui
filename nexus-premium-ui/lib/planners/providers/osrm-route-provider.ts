// ─────────────────────────────────────────────────────────────────────────────
// OSRM Route Provider — OpenStreetMap pedestrian routing
// ─────────────────────────────────────────────────────────────────────────────
// Generates candidate running routes around a group planning location.
//
// CANDIDATE GENERATION STRATEGY
// ──────────────────────────────
// For each of 8 compass directions we generate 5 candidate configurations:
//
//   1. 2-leg (single via): start → via(bearing, half-dist) → start
//      Almost always returns OUT_AND_BACK on urban road networks.
//
//   2-5. Triangle L/R (two via-points at a 90° turn):
//      start → via1(bearing, legKm) → via2(bearing±90°, legKm) → start
//      Two different leg sizes for better coverage.
//
// 8 bearings × 5 configs = up to 40 OSRM queries, all fired in parallel.
//
// CLASSIFICATION
// ──────────────
// Route type is derived PURELY from the returned geometry:
//
//   RETRACE RATIO: fraction of 30m grid cells visited more than once.
//     > 0.20 → route retraces significantly → not a genuine loop.
//
//   LOOP QUALITY: shoelace polygon area vs ideal circle for this distance.
//     < 0.08 → route is too narrow/linear to be a useful loop.
//
//   START-FINISH GAP: distance between first and last coord.
//     > 150m → route is LINEAR (doesn't return to start).
//
//   LOOP = startFinish < 150m AND retraceRatio < 0.20 AND loopQuality > 0.08
//   OUT_AND_BACK = startFinish < 150m AND (retraceRatio ≥ 0.20 OR loopQuality ≤ 0.08)
//   LINEAR = startFinish ≥ 150m
//
// HONESTY RULE
// ────────────
// If no genuinely good loop is found, we return the best real route and
// classify it correctly. We never call an out-and-back route a "loop".
//
// Data source: OSRM public instance (router.project-osrm.org), foot profile.
// Data licence: OpenStreetMap contributors, ODbL.
// CORS: OSRM public API sends Access-Control-Allow-Origin: * — browser-safe.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  RouteCandidate,
  RouteProvider,
  PlannerWaypoint,
  RouteType,
} from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Returns the correct OSRM base URL for a given routing profile.
 *
 * Background: router.project-osrm.org is a single-profile demo instance — it
 * does not honour the profile segment of the URL path (foot/bike/driving all
 * produce car-biased routes). For genuine per-profile routing we use the
 * OpenStreetMap Deutschland multi-profile server which runs separate OSRM
 * instances per transport mode:
 *
 *   foot  → https://routing.openstreetmap.de/routed-foot
 *   bike  → https://routing.openstreetmap.de/routed-bike
 *   car   → https://routing.openstreetmap.de/routed-car
 *
 * Each instance exposes the standard OSRM v1 route API, so the URL structure
 * is otherwise identical: {base}/route/v1/{profile}/{coords}?…
 */
function osrmBaseForProfile(profile: string): string {
  switch (profile) {
    case 'bike': return 'https://routing.openstreetmap.de/routed-bike'
    case 'car':  return 'https://routing.openstreetmap.de/routed-car'
    default:     return 'https://routing.openstreetmap.de/routed-foot'
  }
}

// TIMEOUT_MS is defined below with the other tuneable constants.
const EARTH_KM    = 6371
const DEG         = Math.PI / 180
const RAD         = 180 / Math.PI

/** Conservative jogging pace: 6 min/km */
const RUNNING_PACE_MIN_PER_KM = 6

/** Minimum route length before we filter it out */
const MIN_ROUTE_KM = 0.3

/** Grid cell size (metres) for the retrace ratio computation */
const RETRACE_GRID_M = 30

/** Routes with retraceRatio above this are classified as OUT_AND_BACK, not LOOP */
const LOOP_MAX_RETRACE = 0.20

/** Routes with loopQuality below this are not genuine loops */
const LOOP_MIN_QUALITY = 0.08

/** Start-finish distance must be below this (km) for LOOP or OUT_AND_BACK */
const STARTFINISH_KM = 0.15

/** Accept routes within this fraction of the target distance (±60%) */
const DIST_TOLERANCE = 0.60

/** Number of interior waypoints to include between start and finish */
const INTERIOR_WAYPOINTS = 4

/**
 * Maximum concurrent OSRM requests per batch.
 * routing.openstreetmap.de enforces per-IP concurrency limits and returns
 * HTTP 429 when too many requests arrive simultaneously. 8 concurrent requests
 * sits comfortably below the observed throttle threshold (~10).
 */
const BATCH_CONCURRENCY = 8

/** Milliseconds to pause between successive batches of OSRM requests. */
const BATCH_DELAY_MS = 500

/**
 * Hard ceiling (ms) on the entire getRoutes() search.
 * When this fires, runBatched() stops launching new batches and returns
 * whatever partial results have already settled.  Guards against browser
 * setTimeout throttling in backgrounded tabs causing per-request timeouts
 * to fire many seconds later than their nominal TIMEOUT_MS value.
 */
const MASTER_TIMEOUT_MS = 15_000

/**
 * Per-request timeout (ms). Reduced from 15 s to 10 s — if OSRM takes longer
 * than 10 s to respond the server is overloaded and a retry on the next search
 * is better than blocking the entire batch.
 */
const TIMEOUT_MS = 10_000

// ── Compass bearings ──────────────────────────────────────────────────────────

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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * DEG
  const dLng = (lng2 - lng1) * DEG
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLng / 2) ** 2
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function destinationPoint(
  lat: number, lng: number, distKm: number, bearingDeg: number,
): { lat: number; lng: number } {
  const latR  = lat * DEG
  const lngR  = lng * DEG
  const bearR = bearingDeg * DEG
  const d     = distKm / EARTH_KM
  const lat2R = Math.asin(
    Math.sin(latR) * Math.cos(d) +
    Math.cos(latR) * Math.sin(d) * Math.cos(bearR),
  )
  const lng2R = lngR + Math.atan2(
    Math.sin(bearR) * Math.sin(d) * Math.cos(latR),
    Math.cos(d) - Math.sin(latR) * Math.sin(lat2R),
  )
  return { lat: lat2R * RAD, lng: lng2R * RAD }
}

function cumulativeDistances(coords: Array<[number, number]>): number[] {
  const cum: number[] = [0]
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1]!
    const [lng2, lat2] = coords[i]!
    cum.push(cum[i - 1]! + haversineKm(lat1!, lng1!, lat2!, lng2!))
  }
  return cum
}

// ── Route quality metrics ─────────────────────────────────────────────────────

/**
 * Computes the retrace ratio — the fraction of 30m grid cells visited more
 * than once by non-consecutive coordinate pairs. Values near 0 mean the route
 * explores fresh ground on every segment. Values near 1 mean the return
 * journey almost entirely overlaps the outbound journey (classic
 * out-and-back behaviour).
 *
 * IMPORTANT: consecutive identical-cell visits are skipped before counting.
 * OSRM overview=full geometry contains multiple coordinates per 30m cell on
 * curved roads (avg 1.4–2.4 per cell). Without this dedup, a single forward
 * pass through a curve registers as "retracing" and inflates the ratio by
 * 0.20–0.35 for perfectly valid loop-shaped routes — causing them to be
 * wrongly classified as out-and-back. True retracing (going out and coming
 * back on the same road) always produces non-consecutive revisits and is
 * unaffected by this dedup.
 */
function computeRetraceRatio(coords: Array<[number, number]>): number {
  if (coords.length < 4) return 0

  const [lng0, lat0] = coords[0]!
  const cosLat = Math.cos(lat0! * DEG)
  const cells   = new Map<string, number>()
  let   prevKey = ''

  for (const [lng, lat] of coords) {
    const cx  = Math.round((lng - lng0!) * 111_320 * cosLat / RETRACE_GRID_M)
    const cy  = Math.round((lat - lat0!) * 110_540 / RETRACE_GRID_M)
    const key = `${cx},${cy}`
    // Skip consecutive identical cells: dense OSRM coords on curves produce
    // many coords per 30m cell in a single forward pass — not actual retracing.
    if (key === prevKey) continue
    prevKey = key
    cells.set(key, (cells.get(key) ?? 0) + 1)
  }

  const total = cells.size
  const dup   = [...cells.values()].filter(v => v > 1).length
  return total > 0 ? dup / total : 0
}

/**
 * Shoelace loop quality: ratio of polygon area to maximum possible area for a
 * circle with the same perimeter.
 *
 * 0 = perfectly out-and-back (zero enclosed area)
 * 1 = perfect circle
 */
function computeLoopQuality(
  coords: Array<[number, number]>,
  totalDistKm: number,
): number {
  if (coords.length < 6 || totalDistKm < MIN_ROUTE_KM) return 0

  const [lng0, lat0] = coords[0]!
  const cosLat = Math.cos(lat0! * DEG)
  let area = 0

  for (let i = 0; i < coords.length; i++) {
    const [lngA, latA] = coords[i]!
    const [lngB, latB] = coords[(i + 1) % coords.length]!
    const xA = (lngA! - lng0!) * 111_320 * cosLat
    const yA = (latA! - lat0!) * 110_540
    const xB = (lngB! - lng0!) * 111_320 * cosLat
    const yB = (latB! - lat0!) * 110_540
    area += xA * yB - xB * yA
  }

  const polyAreaKm2  = Math.abs(area) / 2 / 1e6
  const maxCircleKm2 = (totalDistKm ** 2) / (4 * Math.PI)
  return maxCircleKm2 > 0 ? Math.min(1, polyAreaKm2 / maxCircleKm2) : 0
}

/**
 * Classifies the route geometry into loop / out_and_back / linear.
 * This is the single source of truth — never inferred from provider intent.
 */
function classifyRoute(
  coords:       Array<[number, number]>,
  totalDistKm:  number,
  retraceRatio: number,
  loopQuality:  number,
): RouteType {
  const [lng0, lat0] = coords[0]!
  const [lngN, latN] = coords[coords.length - 1]!
  const sfKm = haversineKm(lat0!, lng0!, latN!, lngN!)

  // Does not return to start → linear
  if (sfKm >= STARTFINISH_KM) return 'linear'

  // Returns to start: check for genuine loop geometry
  if (retraceRatio < LOOP_MAX_RETRACE && loopQuality > LOOP_MIN_QUALITY) {
    return 'loop'
  }

  // Returns to start but retraces heavily or is geometrically narrow
  return 'out_and_back'
}

// ── Composite scoring (higher = better) ──────────────────────────────────────

/**
 * Scores a candidate for ranking. Genuine loops are rewarded; heavy
 * retracing is penalised. Distance match is the primary component.
 */
function scoreCandiate(
  candidate: RouteCandidate,
  targetKm:  number,
): number {
  const distFit     = Math.max(0, 1 - Math.abs(candidate.totalDistanceKm - targetKm) / targetKm)
  const loopBonus   = candidate.routeType === 'loop' ? candidate.loopQuality * 0.5 : 0
  const retracePen  = candidate.retraceRatio * 0.5
  return distFit + loopBonus - retracePen
}

// ── OSRM types ────────────────────────────────────────────────────────────────

interface OsrmStep {
  name:     string
  distance: number   // metres
  duration: number   // seconds
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> }
  maneuver: { location: [number, number]; type: string }
}

interface OsrmRoute {
  distance: number
  duration: number
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> }
  legs: Array<{ steps: OsrmStep[] }>
}

interface OsrmResponse {
  code:    string
  routes?: OsrmRoute[]
}

// ── Diagnostic counters (one object per getRoutes() call) ─────────────────────

interface DiagStats {
  sent:      number   // total thunks invoked (= queries.length)
  http200:   number   // 2xx responses (OSRM replied, even if code≠Ok)
  http429:   number   // rate-limited by server
  http5xx:   number   // server errors
  httpOther: number   // other non-2xx (e.g. 403, 503 that isn't 5xx pattern)
  timeouts:  number   // AbortError — per-request timeout fired
  generated: number   // queryOsrm returned a non-null RouteCandidate
}

// ── Surface inference ─────────────────────────────────────────────────────────

/**
 * Infers surface composition from OSM step names using heuristic patterns.
 *
 * Road suffixes → tarmac/asphalt surface.
 * Path/green-space keywords → off-road surface.
 * Unnamed segments → footpaths / unmapped tracks (counted as path).
 *
 * The result is an estimate only — OSRM does not return OSM surface= tags.
 * The surfaceSummary label in the UI makes this clear.
 */
function inferSurfaceProfile(
  steps: OsrmStep[],
): { roadFraction: number; pathFraction: number } {
  const ROAD_RE = /\b(road|street|avenue|boulevard|crescent|drive|rise|close|court|terrace|gardens|grove|lane|circus|square|row|hill|bridge|way)\b/i
  const PATH_RE = /\b(path|track|trail|footway|footpath|bridleway|steps|passage|alley|meadow|common|green|walk|park|cycle|towpath|riverside|field)\b/i

  let roadKm    = 0
  let pathKm    = 0
  let unknownKm = 0

  for (const step of steps) {
    const km   = step.distance / 1000
    const name = step.name.trim()
    if (!name) {
      pathKm += km   // unnamed segments are typically footpaths / unmapped tracks
    } else if (ROAD_RE.test(name)) {
      roadKm += km
    } else if (PATH_RE.test(name)) {
      pathKm += km
    } else {
      unknownKm += km   // labelled but not matched — split 40/60 road/path
    }
  }

  const total = roadKm + pathKm + unknownKm
  if (total === 0) return { roadFraction: 0.5, pathFraction: 0.5 }

  const effectiveRoad = roadKm + unknownKm * 0.4
  const roadFraction  = Math.min(1, Math.max(0, effectiveRoad / total))
  return { roadFraction, pathFraction: 1 - roadFraction }
}

// ── Named segment extraction ───────────────────────────────────────────────────

interface NamedSegment {
  name:        string
  startDistKm: number
  endDistKm:   number
}

function buildNamedSegments(steps: OsrmStep[]): NamedSegment[] {
  const segments: NamedSegment[] = []
  let cumKm = 0

  for (const step of steps) {
    const distKm = step.distance / 1000
    const name   = step.name.trim()

    if (name && distKm >= 0.05) {
      const last = segments[segments.length - 1]
      if (last && last.name === name) {
        last.endDistKm = cumKm + distKm
      } else {
        segments.push({ name, startDistKm: cumKm, endDistKm: cumKm + distKm })
      }
    }
    cumKm += distKm
  }

  return segments
}

function bestNameAtDistance(
  cumDistKm:     number,
  segments:      NamedSegment[],
  directionName: string,
  routeType:     RouteType,
  totalKm:       number,
  isTurnaround:  boolean,
): string {
  // Find covering segment
  for (const seg of segments) {
    if (cumDistKm >= seg.startDistKm - 0.01 && cumDistKm <= seg.endDistKm + 0.01) {
      if (isTurnaround && routeType === 'out_and_back') return `${seg.name} — turnaround`
      return seg.name
    }
  }

  // Nearest named segment within 300 m
  let best: NamedSegment | undefined
  let bestD = Infinity
  for (const seg of segments) {
    const mid = (seg.startDistKm + seg.endDistKm) / 2
    const d   = Math.abs(cumDistKm - mid)
    if (d < bestD) { bestD = d; best = seg }
  }
  if (best && bestD < 0.3) {
    if (isTurnaround && routeType === 'out_and_back') return `${best.name} — turnaround`
    return best.name
  }

  // Cardinal fallback
  const frac = totalKm > 0 ? cumDistKm / totalKm : 0
  if (isTurnaround) return `${directionName} turnaround`
  if (frac < 0.25)  return `${directionName} outbound`
  if (frac < 0.50)  return `${directionName} halfway`
  if (frac < 0.75)  return 'Return section'
  return 'Final stretch'
}

// ── Waypoint builder ─────────────────────────────────────────────────────────

function buildWaypoints(
  coords:        Array<[number, number]>,
  cumDist:       number[],
  steps:         OsrmStep[],
  directionName: string,
  routeType:     RouteType,
): PlannerWaypoint[] {
  const n        = coords.length
  const totalKm  = cumDist[n - 1] ?? 0
  const segments = buildNamedSegments(steps)

  // Index set: start + evenly-spaced interior points + end
  const indices = new Set<number>([0, n - 1])
  const innerCount = Math.min(INTERIOR_WAYPOINTS, n - 2)
  for (let i = 0; i < innerCount; i++) {
    indices.add(1 + Math.round(((i + 1) / (innerCount + 1)) * (n - 2)))
  }

  const sorted = [...indices].sort((a, b) => a - b)
  const midIdx = Math.round(n / 2)

  return sorted.map((idx): PlannerWaypoint => {
    const [lng, lat]   = coords[idx]!
    const isStart      = idx === 0
    const isEnd        = idx === n - 1
    const cumDistHere  = cumDist[idx] ?? 0

    // For out-and-back: mark the interior point closest to the midpoint as turnaround
    const isTurnaround =
      !isStart && !isEnd && routeType === 'out_and_back' &&
      Math.abs(idx - midIdx) < Math.ceil(n / 8)

    let name: string
    let waypointType: PlannerWaypoint['waypointType']

    if (isStart) {
      name = routeType === 'loop' ? 'Loop start & finish' : 'Start'
      waypointType = 'start'
    } else if (isEnd) {
      name = routeType === 'linear' ? 'Finish' : 'Return to start'
      waypointType = 'end'
    } else if (isTurnaround) {
      name = bestNameAtDistance(cumDistHere, segments, directionName, routeType, totalKm, true)
      waypointType = 'poi'
    } else {
      name = bestNameAtDistance(cumDistHere, segments, directionName, routeType, totalKm, false)
      waypointType = 'checkpoint'
    }

    const distLabel = `${cumDistHere.toFixed(1)} km`
    const desc =
      isStart
        ? `${routeType === 'loop' ? 'Loop' : routeType === 'out_and_back' ? 'Out & Back' : 'Linear'} · ${(Math.round(totalKm * 10) / 10).toFixed(1)} km total`
        : isTurnaround
        ? `~${distLabel} from start — turn around here`
        : undefined

    return {
      id:                `osrm-wp-${idx}`,
      name,
      lat:               lat!,
      lng:               lng!,
      waypointType,
      distanceFromStart: Math.round(cumDistHere * 100) / 100,
      description:       desc,
      isRealData:        true,
    }
  })
}

// ── Route name builder ────────────────────────────────────────────────────────

function buildRouteName(
  distKm:        number,
  directionName: string,
  routeType:     RouteType,
  targetKm:      number,
): string {
  const distLabel = (Math.round(distKm * 10) / 10).toFixed(1)

  switch (routeType) {
    case 'loop':
      return `${distLabel} km ${directionName} Loop`
    case 'out_and_back':
      return `${distLabel} km ${directionName} Out & Back`
    case 'linear':
      return `${distLabel} km ${directionName} Route`
  }
}

// ── Batched parallel runner ───────────────────────────────────────────────────

/**
 * Runs an array of async thunks in controlled parallel batches.
 *
 * Why this exists:
 *   routing.openstreetmap.de enforces a per-IP concurrent-request limit and
 *   returns HTTP 429 when more than ~10 requests arrive simultaneously.
 *   Firing all 40 OSRM queries at once reliably triggers that limit — the
 *   first search may scrape through but every subsequent search within the
 *   same browser session gets 0 routes.
 *
 *   By capping concurrency at BATCH_CONCURRENCY (8) with a BATCH_DELAY_MS
 *   (500 ms) gap between batches we stay within the server's tolerance while
 *   still parallelising within each batch.
 */
/**
 * @param signal  Optional AbortSignal — when fired, no further batches are
 *                started and the function returns the partial results gathered
 *                so far.  Individual in-flight requests within the current
 *                batch are NOT cancelled; they continue until their own
 *                per-request timeout fires.  This gives us partial results
 *                ("whatever came back in 15 s") rather than nothing.
 */
async function runBatched<T>(
  fns:         Array<() => Promise<T>>,
  concurrency: number,
  delayMs:     number,
  signal?:     AbortSignal,
): Promise<Array<PromiseSettledResult<T>>> {
  const results: Array<PromiseSettledResult<T>> = []
  for (let i = 0; i < fns.length; i += concurrency) {
    if (signal?.aborted) {
      // [NEXUS DEBUG]
      console.warn(`[NEXUS:OSRM] master timeout — stopping at batch ${Math.floor(i / concurrency) + 1}, returning ${results.length} partial results`)
      break
    }
    const batch       = fns.slice(i, i + concurrency)
    const batchNumber = Math.floor(i / concurrency) + 1
    const totalBatch  = Math.ceil(fns.length / concurrency)
    // [NEXUS DEBUG] Remove this log once intermittent-failure investigation is complete
    console.log(`[NEXUS:OSRM] batch ${batchNumber}/${totalBatch} — firing ${batch.length} requests`)
    const batchResults = await Promise.allSettled(batch.map(fn => fn()))
    results.push(...batchResults)
    if (i + concurrency < fns.length && !signal?.aborted) {
      await new Promise<void>(r => setTimeout(r, delayMs))
    }
  }
  return results
}

// ── OSRM query ────────────────────────────────────────────────────────────────

/**
 * Queries OSRM for a route through the given waypoints.
 * Returns a scored RouteCandidate, or null on failure.
 *
 * @param profile  OSRM routing profile: 'foot' (default) | 'bike' | 'car'
 */
async function queryOsrm(
  waypoints:     Array<{ lat: number; lng: number }>,
  candidateId:   string,
  directionName: string,
  targetKm:      number,
  profile:       string = 'foot',
  stats:         DiagStats,
): Promise<RouteCandidate | null> {
  stats.sent++

  const coordStr = waypoints
    .map(({ lat, lng }) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
    .join(';')

  const base = osrmBaseForProfile(profile)
  const url =
    `${base}/route/v1/${profile}/${coordStr}` +
    `?overview=full&geometries=geojson&steps=true&continue_straight=false`

  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)
  // [NEXUS DEBUG] Remove timing instrumentation once investigation is complete
  const t0         = performance.now()

  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { Accept: 'application/json' },
    })
    const elapsedMs = Math.round(performance.now() - t0)

    if (!res.ok) {
      if (res.status === 429) {
        stats.http429++
        // [NEXUS DEBUG]
        console.warn(`[NEXUS:OSRM] 429 rate-limited — ${candidateId} (${elapsedMs}ms) — reduce BATCH_CONCURRENCY or increase BATCH_DELAY_MS`)
      } else if (res.status >= 500) {
        stats.http5xx++
        // [NEXUS DEBUG]
        console.warn(`[NEXUS:OSRM] HTTP ${res.status} server error — ${candidateId} (${elapsedMs}ms)`)
      } else {
        stats.httpOther++
        // [NEXUS DEBUG]
        console.warn(`[NEXUS:OSRM] HTTP ${res.status} — ${candidateId} (${elapsedMs}ms)`)
      }
      return null
    }

    stats.http200++

    const data = (await res.json()) as OsrmResponse
    if (data.code !== 'Ok' || !data.routes?.length) {
      // [NEXUS DEBUG]
      console.warn(`[NEXUS:OSRM] OSRM code=${data.code} (no usable route) — ${candidateId}`)
      return null
    }

    const route  = data.routes[0]!
    const coords = route.geometry.coordinates
    if (coords.length < 2) return null

    const distKm = Math.round((route.distance / 1000) * 100) / 100
    if (distKm < MIN_ROUTE_KM) return null

    const cumDist       = cumulativeDistances(coords)
    const allSteps      = route.legs.flatMap(leg => leg.steps ?? [])
    const retrace       = computeRetraceRatio(coords)
    const loopQ         = computeLoopQuality(coords, distKm)
    const routeType     = classifyRoute(coords, distKm, retrace, loopQ)
    const waypoints     = buildWaypoints(coords, cumDist, allSteps, directionName, routeType)
    const name          = buildRouteName(distKm, directionName, routeType, targetKm)
    const surfaceProfile = inferSurfaceProfile(allSteps)

    const grade: RouteCandidate['grade'] =
      distKm < 3  ? 'easy' :
      distKm < 8  ? 'moderate' :
      distKm < 15 ? 'hard' : 'expert'

    const roadPct = Math.round(surfaceProfile.roadFraction * 100)
    const surfaceSummary =
      roadPct < 20 ? 'Mostly paths & trails' :
      roadPct < 45 ? 'Mix of paths and roads' :
      roadPct < 70 ? 'Mix of roads and paths' :
      'Mostly roads'

    // [NEXUS DEBUG] Remove once investigation is complete
    const elapsedFull = Math.round(performance.now() - t0)
    console.log(`[NEXUS:OSRM] ✓ ${candidateId} — ${distKm} km ${routeType} retrace=${retrace.toFixed(2)} lq=${loopQ.toFixed(2)} (${elapsedFull}ms)`)

    stats.generated++

    return {
      id:               candidateId,
      name,
      waypoints,
      totalDistanceKm:  distKm,
      estimatedMinutes: Math.round(distKm * RUNNING_PACE_MIN_PER_KM),
      surfaceSummary:   `${surfaceSummary} · OpenStreetMap`,
      grade,
      routeType,
      isLoop:           routeType === 'loop',
      retraceRatio:     retrace,
      loopQuality:      loopQ,
      dataSource:       'real',
      providerName:     'OSRM · OpenStreetMap',
      geometry:         coords,
      surfaceProfile,
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      stats.timeouts++
      // [NEXUS DEBUG]
      console.warn(`[NEXUS:OSRM] ⏱ timeout (>${TIMEOUT_MS}ms) — ${candidateId}`)
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class OsrmRouteProvider implements RouteProvider {
  /** OSRM routing profile: 'foot' (default) | 'bike' | 'car' */
  private readonly profile: string

  constructor(options: { profile?: string } = {}) {
    this.profile = options.profile ?? 'foot'
  }

  async getRoutes(
    activityId: string,
    location:   { lat: number; lng: number },
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
    const profile   = this.profile

    // ── Diagnostic counters — one object shared across all queries ───────────
    const stats: DiagStats = {
      sent: 0, http200: 0, http429: 0, http5xx: 0, httpOther: 0,
      timeouts: 0, generated: 0,
    }
    const searchTimestamp = new Date().toISOString()

    // ── Build all candidate queries ──────────────────────────────────────────
    //
    // For each of 8 compass directions we fire 4 triangle configurations:
    //
    //   #1-2  Triangle small (legKm = targetKm × 0.22):
    //         Left turn  → start → via1 → via2(bearing+90°) → start
    //         Right turn → start → via1 → via2(bearing-90°) → start
    //
    //   #3-4  Triangle larger (legKm = targetKm × 0.35):
    //         Left turn  (same pattern, larger legs)
    //         Right turn (same pattern, larger legs)
    //
    // Why no 2-leg queries:
    //   The former 2-leg (start → mid → start) queries were removed to cut
    //   the total from 40 to 32 and reduce rate-limit pressure.  They almost
    //   exclusively produced OUT_AND_BACK routes that the triangles already
    //   cover — removing them does not reduce route variety.
    //
    // The triangle configs force OSRM to traverse different road segments on
    // each leg, which can produce genuine loops where the road network allows.
    // Where it doesn't (e.g., linear corridor towns), OSRM still finds real
    // routes but our retrace metric will correctly classify them as OUT_AND_BACK.
    //
    // Total: up to 8 × 4 = 32 queries, executed in batches via runBatched()
    // to avoid HTTP 429 rate limiting from routing.openstreetmap.de.
    // Queries are stored as thunks so they only start when their batch fires —
    // NOT immediately on push (which was the original source of the 429 flood).

    const queries: Array<() => Promise<RouteCandidate | null>> = []

    const LEG_SIZES = [0.22, 0.35]  // fractions of targetKm per triangle leg

    for (const { bearing, label } of BEARINGS) {
      // 4 triangle configs per bearing (2 leg sizes × 2 turn directions)
      for (const legFrac of LEG_SIZES) {
        const legKm = targetKm * legFrac
        const via1  = destinationPoint(lat, lng, legKm, bearing)

        // Left turn (bearing + 90°)
        const via2L = destinationPoint(via1.lat, via1.lng, legKm, bearing + 90)
        queries.push(() =>
          queryOsrm(
            [{ lat, lng }, via1, via2L, { lat, lng }],
            `osrm-tri-${bearing}-L-${legFrac}`,
            label,
            targetKm,
            profile,
            stats,
          ),
        )

        // Right turn (bearing - 90°)
        const via2R = destinationPoint(via1.lat, via1.lng, legKm, bearing - 90)
        queries.push(() =>
          queryOsrm(
            [{ lat, lng }, via1, via2R, { lat, lng }],
            `osrm-tri-${bearing}-R-${legFrac}`,
            label,
            targetKm,
            profile,
            stats,
          ),
        )
      }
    }

    // ── Collect results (batched to avoid 429 rate limiting) ─────────────────
    //
    // A master AbortController caps the entire search at MASTER_TIMEOUT_MS.
    // When it fires, runBatched() stops launching new batches and returns
    // whatever partial results have already settled — so the user gets routes
    // from the first N batches instead of waiting indefinitely for the last
    // few timed-out requests.
    //
    // This closes the "hangs indefinitely" failure mode: in a backgrounded
    // browser tab setTimeout can be throttled, causing individual per-request
    // AbortControllers to fire much later than their nominal 10 s.  The master
    // controller fires on wall-clock time from the planner layer and is not
    // subject to that throttling.

    // [NEXUS DEBUG] Remove timing instrumentation once investigation is complete
    const searchStart      = performance.now()
    const masterController = new AbortController()
    const masterTimer      = setTimeout(
      () => masterController.abort(),
      MASTER_TIMEOUT_MS,
    )
    console.log(`[NEXUS:OSRM] starting ${queries.length} queries — profile=${profile} ${BATCH_CONCURRENCY} concurrent, ${BATCH_DELAY_MS}ms inter-batch delay, master timeout ${MASTER_TIMEOUT_MS}ms`)

    let settled: Array<PromiseSettledResult<RouteCandidate | null>>
    try {
      settled = await runBatched(queries, BATCH_CONCURRENCY, BATCH_DELAY_MS, masterController.signal)
    } finally {
      clearTimeout(masterTimer)
    }

    const totalElapsedMs = Math.round(performance.now() - searchStart)

    const all: RouteCandidate[] = settled
      .filter((r): r is PromiseFulfilledResult<RouteCandidate | null> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter((c): c is RouteCandidate => c !== null)

    // ── Distance filter ───────────────────────────────────────────────────────
    const lo = targetKm * (1 - DIST_TOLERANCE)
    const hi = targetKm * (1 + DIST_TOLERANCE)
    const filtered = all.filter(c => c.totalDistanceKm >= lo && c.totalDistanceKm <= hi)
    const distFilterRejected = all.length - filtered.length
    const pool     = filtered.length > 0 ? filtered : all

    // ── Deduplicate by direction (keep best per direction-type key) ───────────
    // This prevents returning 5 identical Banbury Road out-and-backs.
    const bestByKey = new Map<string, RouteCandidate>()
    for (const c of pool) {
      // Key on direction label + routeType
      const dirLabel = BEARINGS.find(b => c.id.includes(String(b.bearing)))?.label ?? 'Unknown'
      const key      = `${dirLabel}-${c.routeType}`
      const existing = bestByKey.get(key)
      if (!existing || scoreCandiate(c, targetKm) > scoreCandiate(existing, targetKm)) {
        bestByKey.set(key, c)
      }
    }

    // ── Sort: loops first, then by composite score ────────────────────────────
    const byScore = [...bestByKey.values()].sort((a, b) => {
      if (a.routeType === 'loop' && b.routeType !== 'loop') return -1
      if (b.routeType === 'loop' && a.routeType !== 'loop') return 1
      return scoreCandiate(b, targetKm) - scoreCandiate(a, targetKm)
    })

    // ── Second dedup pass: remove near-identical distances of the same type ──
    // Prevents "4.8 km Out & Back", "4.9 km Out & Back", "5.0 km Out & Back"
    // from all appearing as separate routes.
    const finalDeduped: RouteCandidate[] = []
    for (const c of byScore) {
      const isDup = finalDeduped.some(e =>
        e.routeType === c.routeType &&
        Math.abs(e.totalDistanceKm - c.totalDistanceKm) /
          Math.max(e.totalDistanceKm, 0.1) < 0.08,
      )
      if (!isDup) finalDeduped.push(c)
    }

    const finalResult = finalDeduped.slice(0, maxRoutes)
    const dedupRejected = pool.length - finalDeduped.length

    // ── [NEXUS DIAG] Full diagnostic summary ──────────────────────────────────
    // Look for this group in DevTools Console to diagnose route failures.
    // Search: [NEXUS DIAG]
    const label = activityId.toUpperCase()
    console.group(
      `%c[NEXUS DIAG] ${label} — ${searchTimestamp} (${totalElapsedMs}ms)`,
      'font-weight:bold;color:#f5a623',
    )
    console.log(`  Activity:          ${activityId}`)
    console.log(`  OSRM profile:      ${profile}`)
    console.log(`  Target distance:   ${targetKm} km (±${DIST_TOLERANCE * 100}% = ${lo.toFixed(1)}–${hi.toFixed(1)} km)`)
    console.log(`  Location:          ${lat.toFixed(5)}, ${lng.toFixed(5)}`)
    console.log('')
    console.log(`  ── HTTP ──`)
    console.log(`  Requests sent:     ${stats.sent}`)
    console.log(`  HTTP 200:          ${stats.http200}`)
    console.log(`  HTTP 429:          ${stats.http429}${stats.http429 > 0 ? '  ← rate-limited (IP temporarily throttled)' : ''}`)
    console.log(`  HTTP 5xx:          ${stats.http5xx}`)
    console.log(`  HTTP other:        ${stats.httpOther}`)
    console.log(`  Timeouts:          ${stats.timeouts}`)
    console.log(`  No-route / error:  ${stats.http200 - stats.generated}  (200 OK but OSRM returned no usable route)`)
    console.log('')
    console.log(`  ── Candidates ──`)
    console.log(`  Generated:         ${stats.generated}  (valid RouteCandidate objects returned by OSRM)`)
    console.log(`  Dist filter −:     ${distFilterRejected}  (outside ${lo.toFixed(1)}–${hi.toFixed(1)} km; pool fell back to all=${filtered.length === 0})`)
    console.log(`  Dedup −:           ${dedupRejected}  (direction-type + near-identical-distance passes)`)
    console.log(`  Final returned:    ${finalResult.length}${finalResult.length === 0 ? '  ← NO ROUTES — see failure point above' : ''}`)
    if (finalResult.length > 0) {
      finalResult.forEach((c, i) =>
        console.log(`    [${i + 1}] ${c.name} — ${c.totalDistanceKm} km ${c.routeType} retrace=${c.retraceRatio.toFixed(2)} lq=${c.loopQuality.toFixed(2)}`),
      )
    }
    console.groupEnd()
    // ─────────────────────────────────────────────────────────────────────────

    return finalResult
  }
}
