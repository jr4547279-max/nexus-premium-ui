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
 * Maximum simultaneous OSRM requests.
 * Diagnostic data (08-2026) shows routing.openstreetmap.de starts returning
 * HTTP 429 above ~5 concurrent requests per IP. 4 gives a comfortable margin
 * while still parallelising within each burst, and the early-exit strategy
 * means we rarely need to exhaust all 32 thunks anyway.
 */
const CONCURRENCY = 4

/**
 * Maximum 429 retries per individual request.
 * Backoff schedule: 1 s → 2 s → 4 s (exponential, base RETRY_BASE_MS).
 * Retried requests free their queue slot immediately (the wait happens inside
 * the thunk), so other thunks can run concurrently during the back-off window.
 */
const MAX_RETRIES = 3

/** Base delay (ms) for exponential backoff on 429 retries. */
const RETRY_BASE_MS = 1_000

/**
 * Hard ceiling (ms) on the entire getRoutes() call.
 * When fired, any pending thunks are discarded and whatever candidates have
 * already been collected are returned immediately.
 */
const MASTER_TIMEOUT_MS = 30_000

/**
 * Per-request timeout (ms). If OSRM takes longer the server is overloaded;
 * aborting early frees the queue slot. Timeouts do NOT trigger retries.
 */
const TIMEOUT_MS = 8_000

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
  sent:      number   // total HTTP requests dispatched (first attempts + retries)
  http200:   number   // 2xx responses (OSRM replied, even if code≠Ok)
  http429:   number   // rate-limited responses
  http5xx:   number   // server errors
  httpOther: number   // other non-2xx
  timeouts:  number   // AbortError — per-request timeout fired
  retries:   number   // retry attempts triggered by 429
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

// ── Deduplication pipeline (shared by runQueue early-exit and final return) ───

/**
 * Applies distance filter, direction-type deduplication, and near-identical
 * distance dedup to a set of raw candidates.  Returns them sorted best-first
 * (loops before out-and-back, higher composite score first).
 *
 * Called after every new result arrives so runQueue can exit as soon as
 * enough unique routes exist.
 */
function deduplicateCandidates(
  all:      RouteCandidate[],
  targetKm: number,
): RouteCandidate[] {
  // ① distance filter
  const lo       = targetKm * (1 - DIST_TOLERANCE)
  const hi       = targetKm * (1 + DIST_TOLERANCE)
  const filtered = all.filter(c => c.totalDistanceKm >= lo && c.totalDistanceKm <= hi)
  const pool     = filtered.length > 0 ? filtered : all   // fall back to all if none pass

  // ② keep best score per direction-type key
  //    Fix: use `-${bearing}-` pattern — `includes(String(bearing))` has a
  //    partial-match bug where bearing 0 wrongly matches ids for 90/180/270/…
  const bestByKey = new Map<string, RouteCandidate>()
  for (const c of pool) {
    const dirLabel = BEARINGS.find(b => c.id.includes(`-${b.bearing}-`))?.label ?? 'Unknown'
    const key      = `${dirLabel}-${c.routeType}`
    const existing = bestByKey.get(key)
    if (!existing || scoreCandiate(c, targetKm) > scoreCandiate(existing, targetKm)) {
      bestByKey.set(key, c)
    }
  }

  // ③ sort: loops first, then descending composite score
  const byScore = [...bestByKey.values()].sort((a, b) => {
    if (a.routeType === 'loop' && b.routeType !== 'loop') return -1
    if (b.routeType === 'loop' && a.routeType !== 'loop') return 1
    return scoreCandiate(b, targetKm) - scoreCandiate(a, targetKm)
  })

  // ④ remove near-identical distances of the same type (< 8% diff)
  const finalDeduped: RouteCandidate[] = []
  for (const c of byScore) {
    const isDup = finalDeduped.some(e =>
      e.routeType === c.routeType &&
      Math.abs(e.totalDistanceKm - c.totalDistanceKm) /
        Math.max(e.totalDistanceKm, 0.1) < 0.08,
    )
    if (!isDup) finalDeduped.push(c)
  }

  return finalDeduped
}

// ── Concurrency-limited queue with early exit ─────────────────────────────────

/**
 * Executes thunks with a maximum of `concurrency` running at any time.
 * Resolves as soon as `maxRoutes` unique candidates survive deduplication —
 * any remaining thunks in the queue are discarded without running.
 * If the AbortSignal fires, pending thunks are dropped and whatever has been
 * collected so far is returned immediately.
 */
async function runQueue(
  thunks:  Array<() => Promise<RouteCandidate | null>>,
  options: {
    concurrency: number
    maxRoutes:   number
    targetKm:    number
    signal:      AbortSignal
  },
): Promise<RouteCandidate[]> {
  const { concurrency, maxRoutes, targetKm, signal } = options
  const pending     = [...thunks]
  const accumulated: RouteCandidate[] = []
  let   activeCount = 0
  let   resolved    = false

  return new Promise<RouteCandidate[]>(resolve => {
    function finish(reason: string): void {
      if (resolved) return
      resolved = true
      const result = deduplicateCandidates(accumulated, targetKm).slice(0, maxRoutes)
      console.log(
        `[NEXUS:Route] ▶ done (${reason}) — `  +
        `${result.length} routes from ${accumulated.length} candidates, `  +
        `${pending.length} pending thunks discarded`,
      )
      resolve(result)
    }

    function onResult(candidate: RouteCandidate | null): void {
      activeCount--
      if (resolved) { pump(); return }
      if (candidate) {
        accumulated.push(candidate)
        const deduped = deduplicateCandidates(accumulated, targetKm)
        if (deduped.length >= maxRoutes) {
          finish(`${maxRoutes} unique routes found`)
          return
        }
      }
      pump()
    }

    function pump(): void {
      if (resolved) return
      if (signal.aborted) { finish('master timeout'); return }

      while (activeCount < concurrency && pending.length > 0 && !resolved) {
        const thunk = pending.shift()!
        activeCount++
        thunk().then(onResult, () => { activeCount--; if (!resolved) pump() })
      }

      if (activeCount === 0 && pending.length === 0 && !resolved) {
        finish('all thunks exhausted')
      }
    }

    pump()
  })
}

// ── Session cache ─────────────────────────────────────────────────────────────

/**
 * In-memory cache keyed by `${activityId}:${lat4dp}:${lng4dp}:${targetKm}`.
 * Lives for the duration of the browser session (cleared on full page reload).
 * Prevents redundant OSRM searches when the user revisits the same search.
 */
const routeSessionCache = new Map<string, RouteCandidate[]>()

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
  const coordStr = waypoints
    .map(({ lat, lng }) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
    .join(';')

  const base = osrmBaseForProfile(profile)
  const url  =
    `${base}/route/v1/${profile}/${coordStr}` +
    `?overview=full&geometries=geojson&steps=true&continue_straight=false`

  // Retry loop — only 429s trigger a retry; timeouts and other errors bail immediately.
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = RETRY_BASE_MS * (2 ** (attempt - 1))   // 1 s, 2 s, 4 s
      console.log(`[NEXUS:Route] ↻ ${candidateId} — retry ${attempt}/${MAX_RETRIES} in ${delayMs}ms`)
      stats.retries++
      await new Promise<void>(r => setTimeout(r, delayMs))
    }

    stats.sent++
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const t0         = performance.now()

    try {
      const res       = await fetch(url, {
        signal:  controller.signal,
        headers: { Accept: 'application/json' },
      })
      const elapsedMs = Math.round(performance.now() - t0)

      if (!res.ok) {
        if (res.status === 429) {
          stats.http429++
          const willRetry = attempt < MAX_RETRIES
          console.warn(
            `[NEXUS:Route] 429 — ${candidateId} (${elapsedMs}ms, attempt ${attempt + 1})` +
            (willRetry ? ` — retrying` : ` — giving up after ${MAX_RETRIES} retries`),
          )
          if (willRetry) continue   // back to top of for-loop → backoff → retry
          return null
        }
        if (res.status >= 500) {
          stats.http5xx++
          console.warn(`[NEXUS:Route] HTTP ${res.status} server error — ${candidateId} (${elapsedMs}ms)`)
        } else {
          stats.httpOther++
          console.warn(`[NEXUS:Route] HTTP ${res.status} — ${candidateId} (${elapsedMs}ms)`)
        }
        return null   // non-429 errors are not retried
      }

      stats.http200++

      const data = (await res.json()) as OsrmResponse
      if (data.code !== 'Ok' || !data.routes?.length) {
        console.warn(`[NEXUS:Route] NoRoute(${data.code}) — ${candidateId}`)
        return null
      }

      const route  = data.routes[0]!
      const coords = route.geometry.coordinates
      if (coords.length < 2) return null

      const distKm = Math.round((route.distance / 1000) * 100) / 100
      if (distKm < MIN_ROUTE_KM) return null

      const cumDist        = cumulativeDistances(coords)
      const allSteps       = route.legs.flatMap(leg => leg.steps ?? [])
      const retrace        = computeRetraceRatio(coords)
      const loopQ          = computeLoopQuality(coords, distKm)
      const routeType      = classifyRoute(coords, distKm, retrace, loopQ)
      const wpts           = buildWaypoints(coords, cumDist, allSteps, directionName, routeType)
      const name           = buildRouteName(distKm, directionName, routeType, targetKm)
      const surfaceProfile = inferSurfaceProfile(allSteps)

      const grade: RouteCandidate['grade'] =
        distKm < 3  ? 'easy'     :
        distKm < 8  ? 'moderate' :
        distKm < 15 ? 'hard'     : 'expert'

      const roadPct = Math.round(surfaceProfile.roadFraction * 100)
      const surfaceSummary =
        roadPct < 20 ? 'Mostly paths & trails'  :
        roadPct < 45 ? 'Mix of paths and roads'  :
        roadPct < 70 ? 'Mix of roads and paths'  :
        'Mostly roads'

      stats.generated++
      console.log(
        `[NEXUS:Route] ✓ ${candidateId} — ${distKm}km ${routeType} ` +
        `retrace=${retrace.toFixed(2)} lq=${loopQ.toFixed(2)} (${Math.round(performance.now() - t0)}ms)`,
      )

      return {
        id:               candidateId,
        name,
        waypoints:        wpts,
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
        console.warn(`[NEXUS:Route] ⏱ timeout (>${TIMEOUT_MS}ms) — ${candidateId}`)
      } else {
        // Network-level failure (ECONNREFUSED, ECONNRESET, DNS, etc.)
        // These happen when the server drops the TCP connection entirely —
        // common when a server-side IP block is in place.
        console.warn(`[NEXUS:Route] ✗ network error — ${candidateId}: ${(err as Error)?.message ?? err}`)
      }
      return null   // neither error type is retried (only 429s retry)
    } finally {
      clearTimeout(timer)
    }
  }

  return null   // exhausted MAX_RETRIES
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

    // ── Session cache ─────────────────────────────────────────────────────────
    const cacheKey = `${activityId}:${lat.toFixed(4)}:${lng.toFixed(4)}:${targetKm}`
    const cached   = routeSessionCache.get(cacheKey)
    if (cached) {
      console.log(`[NEXUS:Route] cache hit — ${cacheKey} (${cached.length} routes)`)
      return cached
    }

    const stats: DiagStats = {
      sent: 0, http200: 0, http429: 0, http5xx: 0, httpOther: 0,
      timeouts: 0, retries: 0, generated: 0,
    }
    const searchTimestamp = new Date().toISOString()
    const searchStart     = performance.now()

    // ── Build thunks ──────────────────────────────────────────────────────────
    // 8 compass bearings × 4 triangle configs (2 leg sizes × L/R turn) = 32.
    // Stored as thunks — nothing fires until runQueue dequeues them.
    const thunks: Array<() => Promise<RouteCandidate | null>> = []
    const LEG_SIZES = [0.22, 0.35]

    for (const { bearing, label } of BEARINGS) {
      for (const legFrac of LEG_SIZES) {
        const legKm = targetKm * legFrac
        const via1  = destinationPoint(lat, lng, legKm, bearing)

        const via2L = destinationPoint(via1.lat, via1.lng, legKm, bearing + 90)
        thunks.push(() =>
          queryOsrm(
            [{ lat, lng }, via1, via2L, { lat, lng }],
            `osrm-tri-${bearing}-L-${legFrac}`,
            label, targetKm, profile, stats,
          ),
        )

        const via2R = destinationPoint(via1.lat, via1.lng, legKm, bearing - 90)
        thunks.push(() =>
          queryOsrm(
            [{ lat, lng }, via1, via2R, { lat, lng }],
            `osrm-tri-${bearing}-R-${legFrac}`,
            label, targetKm, profile, stats,
          ),
        )
      }
    }

    // ── Run queue ─────────────────────────────────────────────────────────────
    const masterController = new AbortController()
    const masterTimer      = setTimeout(() => {
      console.warn(`[NEXUS:Route] ⏱ master timeout after ${MASTER_TIMEOUT_MS}ms`)
      masterController.abort()
    }, MASTER_TIMEOUT_MS)

    console.log(
      `[NEXUS:Route] search start — activity=${activityId} profile=${profile} ` +
      `target=${targetKm}km thunks=${thunks.length} concurrency=${CONCURRENCY} maxRoutes=${maxRoutes}`,
    )

    let finalResult: RouteCandidate[]
    try {
      finalResult = await runQueue(thunks, {
        concurrency: CONCURRENCY,
        maxRoutes,
        targetKm,
        signal: masterController.signal,
      })
    } finally {
      clearTimeout(masterTimer)
    }

    const totalElapsedMs = Math.round(performance.now() - searchStart)
    const lo = targetKm * (1 - DIST_TOLERANCE)
    const hi = targetKm * (1 + DIST_TOLERANCE)

    // ── [NEXUS DIAG] summary ──────────────────────────────────────────────────
    console.group(
      `%c[NEXUS DIAG] ${activityId.toUpperCase()} — ${searchTimestamp} (${totalElapsedMs}ms)`,
      'font-weight:bold;color:#f5a623',
    )
    console.log(`  Activity:        ${activityId}`)
    console.log(`  OSRM profile:    ${profile}`)
    console.log(`  Target:          ${targetKm} km (±${DIST_TOLERANCE * 100}% = ${lo.toFixed(1)}–${hi.toFixed(1)} km)`)
    console.log(`  Location:        ${lat.toFixed(5)}, ${lng.toFixed(5)}`)
    console.log(`  Concurrency:     ${CONCURRENCY}  Max retries: ${MAX_RETRIES}  Retry base: ${RETRY_BASE_MS}ms`)
    console.log('')
    console.log(`  ── HTTP ──`)
    console.log(`  Requests sent:   ${stats.sent}${stats.retries > 0 ? ` (incl. ${stats.retries} retries)` : ''}`)
    console.log(`  HTTP 200:        ${stats.http200}`)
    console.log(`  HTTP 429:        ${stats.http429}${stats.http429 > 0 ? '  ← rate-limited' : ''}`)
    console.log(`  HTTP 5xx:        ${stats.http5xx}`)
    console.log(`  HTTP other:      ${stats.httpOther}`)
    console.log(`  Timeouts:        ${stats.timeouts}`)
    console.log(`  Retries:         ${stats.retries}`)
    console.log(`  No-route/err:    ${stats.http200 - stats.generated}  (200 OK but OSRM returned no usable route)`)
    console.log('')
    console.log(`  ── Candidates ──`)
    console.log(`  Generated:       ${stats.generated}`)
    console.log(`  Accepted:        ${finalResult.length}`)
    console.log(`  Rejected:        ${stats.generated - finalResult.length}  (distance filter + dedup)`)
    if (finalResult.length > 0) {
      finalResult.forEach((c, i) =>
        console.log(`    [${i + 1}] ${c.name} — ${c.totalDistanceKm}km ${c.routeType}`),
      )
    } else {
      console.warn('  ← NO ROUTES — see HTTP section above for failure cause')
    }
    console.groupEnd()

    // ── Store to session cache ────────────────────────────────────────────────
    if (finalResult.length > 0) {
      routeSessionCache.set(cacheKey, finalResult)
      console.log(`[NEXUS:Route] cached — ${cacheKey}`)
    }

    return finalResult
  }
}
