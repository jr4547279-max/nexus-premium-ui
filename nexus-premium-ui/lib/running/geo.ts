// ─────────────────────────────────────────────────────────────────────────────
// Nexus Run Tracker — Geodesic Calculations
// ─────────────────────────────────────────────────────────────────────────────
// Pure functions — no side effects, no browser APIs, no I/O.
// Used by the live run tracker to compute distance, pace, and route progress.
// ─────────────────────────────────────────────────────────────────────────────

const EARTH_KM = 6371
const DEG = Math.PI / 180

// ── Haversine distance ────────────────────────────────────────────────────────

/**
 * Haversine distance in km between two lat/lng points.
 * Accurate to within 0.5% for typical GPS run distances.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLat = (lat2 - lat1) * DEG
  const dLng = (lng2 - lng1) * DEG
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLng / 2) ** 2
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Route progress ────────────────────────────────────────────────────────────

export interface NearestRoutePoint {
  /** km from the GPS point to the nearest point on the planned route */
  distanceToRouteKm: number
  /** fraction 0–1 of total route length at the nearest point (0 = start, 1 = finish) */
  progressFraction: number
  /** lat of nearest point on route */
  lat: number
  /** lng of nearest point on route */
  lng: number
}

/**
 * Projects (px, py) onto segment (ax,ay)→(bx,by).
 * All coordinates are in plain degrees — the projection is Cartesian and
 * adequate for the short segment lengths found in GPS routes.
 */
function projectPointOntoSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { t: number; lat: number; lng: number } {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return { t: 0, lat: ay, lng: ax }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return { t, lat: ay + t * dy, lng: ax + t * dx }
}

/**
 * Finds the nearest point on the planned route polyline to the given GPS position,
 * and returns the corresponding progress fraction.
 *
 * routeCoords: Array of [lng, lat] in GeoJSON order (same as OSRM output).
 * Do NOT pass [lat, lng] — swap before calling if necessary.
 */
export function nearestPointOnRoute(
  gpsLat: number,
  gpsLng: number,
  routeCoords: ReadonlyArray<[number, number]>,
): NearestRoutePoint {
  if (routeCoords.length === 0) {
    return { distanceToRouteKm: Infinity, progressFraction: 0, lat: gpsLat, lng: gpsLng }
  }
  if (routeCoords.length === 1) {
    const [lng, lat] = routeCoords[0]!
    return {
      distanceToRouteKm: haversineKm(gpsLat, gpsLng, lat!, lng!),
      progressFraction: 0,
      lat: lat!,
      lng: lng!,
    }
  }

  // Build cumulative distances along the planned route
  const cum: number[] = [0]
  for (let i = 1; i < routeCoords.length; i++) {
    const [lng1, lat1] = routeCoords[i - 1]!
    const [lng2, lat2] = routeCoords[i]!
    cum.push(cum[i - 1]! + haversineKm(lat1!, lng1!, lat2!, lng2!))
  }
  const totalKm = cum[cum.length - 1] ?? 0

  let bestDist = Infinity
  let bestProgress = 0
  let bestLat = gpsLat
  let bestLng = gpsLng

  for (let i = 0; i < routeCoords.length - 1; i++) {
    // routeCoords is [lng, lat] — pass as (px=lng, py=lat) for the 2-D projection
    const [ax, ay] = routeCoords[i]!      // ax=lng, ay=lat
    const [bx, by] = routeCoords[i + 1]!  // bx=lng, by=lat

    const proj = projectPointOntoSegment(gpsLng, gpsLat, ax!, ay!, bx!, by!)
    const dist  = haversineKm(gpsLat, gpsLng, proj.lat, proj.lng)

    if (dist < bestDist) {
      bestDist     = dist
      bestLat      = proj.lat
      bestLng      = proj.lng
      const segStart = cum[i]!
      const segEnd   = cum[i + 1]!
      bestProgress   = totalKm > 0
        ? (segStart + proj.t * (segEnd - segStart)) / totalKm
        : 0
    }
  }

  return {
    distanceToRouteKm: bestDist,
    progressFraction:  Math.min(1, Math.max(0, bestProgress)),
    lat: bestLat,
    lng: bestLng,
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Formats pace as "M:SS" or "--:--" when data is not yet available.
 * Input: seconds per km.
 */
export function formatPace(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) return '--:--'
  const mins = Math.floor(secPerKm / 60)
  const secs = Math.floor(secPerKm % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Formats elapsed seconds as "MM:SS" or "H:MM:SS".
 */
export function formatRunTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}
