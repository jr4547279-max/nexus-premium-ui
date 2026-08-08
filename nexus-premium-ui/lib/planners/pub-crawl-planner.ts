// ─────────────────────────────────────────────────────────────────────────────
// Pub Crawl Planner
// ─────────────────────────────────────────────────────────────────────────────
// Accepts a PlannerRequest and returns a fully-formed PlannerResult.
//
// Venue discovery pipeline (OSM-first, mock fallback):
//   1.  Check requirements (Golden Window must exist)
//   2.  If groupLocation is set, try OpenStreetMapVenueProvider (Overpass API)
//       using the stored planningRadiusMetres (default 1 500 m).
//       Fall back to MockVenueProvider when OSM returns < MIN_OSM_RESULTS.
//   3.  Score, filter, select, and optimise route
//   4.  Return result with dataSource: 'real' | 'mock' and providerName
//
// Venue providers are modular — swap or add Google/Mapbox/etc. by implementing
// the VenueProvider interface without touching planner logic.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PlannerDefinition,
  PlannerRequest,
  PlannerResult,
  PlannerVenue,
  PlannerCandidate,
  PlannerScore,
  PlannerStop,
  BudgetPreference,
  MatchQuality,
} from './types'
import { MockVenueProvider } from './providers/mock-venue-provider'
import { OpenStreetMapVenueProvider } from './providers/openstreetmap-venue-provider'

// ── Constants ─────────────────────────────────────────────────────────────────

const MINUTES_PER_STOP           = 42          // average time spent at each pub
const WALKING_SPEED_KM_PER_MIN   = 0.083       // ~5 km/h
const DEFAULT_STOPS              = 4
const DEFAULT_BUDGET: BudgetPreference = 'medium'
const PRICE_SYMBOLS              = ['', '£', '££', '£££', '££££'] as const
/** Default search radius when no planning intelligence radius is stored */
const DEFAULT_RADIUS_METRES      = 1500
/** Minimum OSM results to prefer real data over mock fallback */
const MIN_OSM_RESULTS            = 2

// ── Singleton providers ───────────────────────────────────────────────────────
// MockVenueProvider is location-agnostic, so a single instance is fine.
// OSM provider is created per-request with the group's stored radius.

const mockProvider = new MockVenueProvider()

// ── Time utilities ────────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function addMinutes(time: string, mins: number): string {
  const total = timeToMinutes(time) + mins
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "HH:MM" 24-hr → "H:MM AM/PM" */
export function format12h(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

/** True if a venue is open at the given time (handles midnight-crossing) */
function isOpenAt(venue: PlannerVenue, time: string): boolean {
  const t = timeToMinutes(time)
  let open = timeToMinutes(venue.openingTime)
  let close = timeToMinutes(venue.closingTime)

  // Handle next-day close (e.g. 01:30)
  if (close < open) close += 24 * 60

  return t >= open && t <= close
}

// ── Haversine distance ────────────────────────────────────────────────────────

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Route optimisation ────────────────────────────────────────────────────────

function totalRouteDistance(venues: PlannerVenue[]): number {
  let total = 0
  for (let i = 1; i < venues.length; i++) {
    total += haversineKm(
      venues[i - 1].lat, venues[i - 1].lng,
      venues[i].lat, venues[i].lng,
    )
  }
  return total
}

/** Generate all permutations of an array (only used for ≤8 items). */
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  return arr.flatMap((item, i) =>
    permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map(rest => [
      item,
      ...rest,
    ]),
  )
}

/**
 * Find the ordering of `venues` that minimises total walking distance.
 * Uses full permutation search for ≤8 venues (fine for typical crawl sizes).
 * Falls back to nearest-neighbour greedy for larger sets.
 */
function optimiseRoute(venues: PlannerVenue[]): PlannerVenue[] {
  if (venues.length <= 1) return venues

  if (venues.length <= 8) {
    const perms = permutations(venues)
    let best = venues
    let bestDist = Infinity
    for (const perm of perms) {
      const dist = totalRouteDistance(perm)
      if (dist < bestDist) {
        bestDist = dist
        best = perm
      }
    }
    return best
  }

  // Nearest-neighbour greedy for larger sets (future-proof)
  const remaining = [...venues]
  const result: PlannerVenue[] = [remaining.shift()!]
  while (remaining.length > 0) {
    const last = result[result.length - 1]
    let nearestIdx = 0
    let nearestDist = Infinity
    remaining.forEach((v, i) => {
      const d = haversineKm(last.lat, last.lng, v.lat, v.lng)
      if (d < nearestDist) {
        nearestDist = d
        nearestIdx = i
      }
    })
    result.push(remaining.splice(nearestIdx, 1)[0])
  }
  return result
}

// ── Scoring ───────────────────────────────────────────────────────────────────

const BUDGET_PRICE_MAP: Record<BudgetPreference, number> = {
  low: 1,
  medium: 2,
  high: 3,
}

/** Pub-crawl-specific atmosphere quality signals */
const CRAWL_ATMOSPHERE_TAGS = new Set([
  'lively', 'social', 'vibrant', 'modern', 'classic', 'welcoming', 'eclectic',
])

function scoreVenue(
  venue: PlannerVenue,
  budget: BudgetPreference,
  startTime: string,
): PlannerScore {
  // Rating (0–20): linear scale against 5-star max
  const rating = Math.round((venue.rating / 5) * 20)

  // Distance (0–20): venues within 0.3 km score highest; cap at 1.5 km
  const maxDist = 1.5
  const distScore = Math.max(0, Math.round(((maxDist - Math.min(venue.distanceFromCentre, maxDist)) / maxDist) * 20))

  // Price match (0–15): exact match = 15, ±1 = 9, ±2 = 4, ±3 = 0
  const targetPrice = BUDGET_PRICE_MAP[budget]
  const priceDiff = Math.abs(venue.priceLevel - targetPrice)
  const priceScore = priceDiff === 0 ? 15 : priceDiff === 1 ? 9 : priceDiff === 2 ? 4 : 0

  // Atmosphere (0–17): count pub-crawl-friendly atmosphere descriptors
  const crawlTags = venue.atmosphere.filter(a => CRAWL_ATMOSPHERE_TAGS.has(a)).length
  const totalTags = Math.max(venue.atmosphere.length, 1)
  const atmosphereScore = Math.round((crawlTags / totalTags) * 17)

  // Opening hours (0–17): open at crawl start = 17; open within 30 min = 8; closed = 0
  let openingHoursScore = 0
  if (isOpenAt(venue, startTime)) {
    openingHoursScore = 17
  } else {
    // Check if it opens within 30 minutes of start
    const laterTime = addMinutes(startTime, 30)
    if (isOpenAt(venue, laterTime)) {
      openingHoursScore = 8
    }
  }

  // Capacity bonus (0–11): larger venues handle pub-crawl groups better
  const capacityScore = venue.capacity === 'large' ? 11 : venue.capacity === 'medium' ? 7 : 3

  const breakdown = {
    rating,
    distance: distScore,
    price: priceScore,
    atmosphere: atmosphereScore,
    openingHours: openingHoursScore,
    capacity: capacityScore,
  }
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0)

  return { total, breakdown }
}

// ── Cost label ────────────────────────────────────────────────────────────────

function deriveCostLabel(stops: PlannerVenue[]): string {
  if (stops.length === 0) return '££'
  const avg = stops.reduce((sum, v) => sum + v.priceLevel, 0) / stops.length
  const rounded = Math.round(avg)
  return PRICE_SYMBOLS[Math.max(1, Math.min(4, rounded))]
}

// ── Day label ─────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function dayLabel(dayOfWeek: number): string {
  return DAY_LABELS[dayOfWeek] ?? 'Unknown'
}

// ── Venue discovery (OSM-first, mock fallback) ────────────────────────────────

/**
 * Fetch venue candidates using real OSM data when a location is available.
 * Falls back to mock data transparently when:
 *   - No groupLocation is provided (dev mode / no location set)
 *   - OSM returns fewer than MIN_OSM_RESULTS venues
 *   - The Overpass API call fails for any reason
 *
 * Returns { venues, dataSource, providerName } so the result can carry
 * accurate metadata for the UI data-source badge.
 */
async function fetchVenues(
  groupLocation: { lat: number; lng: number; radiusMetres?: number } | undefined,
): Promise<{ venues: PlannerVenue[]; dataSource: 'real' | 'mock'; providerName: string }> {
  if (groupLocation) {
    const radius = groupLocation.radiusMetres ?? DEFAULT_RADIUS_METRES
    try {
      // Overpass API — the correct OSM POI/venue discovery endpoint.
      // Nominatim is NOT used here; it is only for address/area resolution.
      const osmProvider = new OpenStreetMapVenueProvider(radius)
      const osmVenues = await osmProvider.getVenues('pub-crawl', groupLocation)
      if (osmVenues.length >= MIN_OSM_RESULTS) {
        return { venues: osmVenues, dataSource: 'real', providerName: 'OpenStreetMap' }
      }
      console.warn(
        `[pub-crawl-planner] OSM returned ${osmVenues.length} result(s) (< ${MIN_OSM_RESULTS}), using mock fallback`,
      )
    } catch (err) {
      console.warn('[pub-crawl-planner] OSM/Overpass call failed, using mock fallback:', err)
    }
  }

  const mockVenues = await mockProvider.getVenues('pub-crawl', groupLocation)
  return { venues: mockVenues, dataSource: 'mock', providerName: 'Demo Venues' }
}

// ── Planner ───────────────────────────────────────────────────────────────────

export const pubCrawlPlanner: PlannerDefinition = {
  id: 'pub-crawl-planner',
  activityId: 'pub-crawl',
  name: 'Pub Crawl Planner',
  description: 'Plans a group pub crawl using the Golden Window for timing.',

  async plan(request: PlannerRequest): Promise<PlannerResult> {
    const {
      goldenWindow,
      budgetPreference = DEFAULT_BUDGET,
      desiredStops = DEFAULT_STOPS,
      groupLocation,
    } = request

    // ── 1. Requirement check ─────────────────────────────────────────────────
    if (!goldenWindow) {
      throw new Error(
        'No Golden Window has been created yet. Find a Golden Window before planning this pub crawl.',
      )
    }

    // ── 2. Fetch candidates (OSM-first, mock fallback) ───────────────────────
    const { venues: allVenues, dataSource, providerName } =
      await fetchVenues(groupLocation)

    // ── 3. Score and filter ──────────────────────────────────────────────────
    const startTime = goldenWindow.start_time

    const candidates: PlannerCandidate[] = allVenues.map(venue => {
      const score = scoreVenue(venue, budgetPreference, startTime)

      // Exclude venues that are definitely closed and don't open within 30 min
      const open = isOpenAt(venue, startTime)
      const opensSoon = isOpenAt(venue, addMinutes(startTime, 30))
      const included = open || opensSoon
      const exclusionReason = included ? undefined : `Closed at ${format12h(startTime)}`

      return { venue, score, included, exclusionReason }
    })

    const eligible = candidates.filter(c => c.included)

    if (eligible.length < 2) {
      throw new Error(
        `Not enough suitable venues were found for ${format12h(startTime)}. Try a different Golden Window time.`,
      )
    }

    // ── 4. Select top N ──────────────────────────────────────────────────────
    const topCount = Math.min(desiredStops, eligible.length)
    const selected = eligible
      .sort((a, b) => b.score.total - a.score.total)
      .slice(0, topCount)
      .map(c => c.venue)

    // ── 5. Optimise route ────────────────────────────────────────────────────
    const orderedVenues = optimiseRoute(selected)

    // ── 6. Build stops with times ────────────────────────────────────────────
    let currentTime = startTime
    const stops: PlannerStop[] = orderedVenues.map((venue, i) => {
      const prev = i > 0 ? orderedVenues[i - 1] : null
      const distFromPrev = prev
        ? haversineKm(prev.lat, prev.lng, venue.lat, venue.lng)
        : 0
      const walkMins = prev
        ? Math.round(distFromPrev / WALKING_SPEED_KM_PER_MIN)
        : 0

      if (i > 0) {
        currentTime = addMinutes(currentTime, walkMins)
      }

      const arrival = currentTime
      const departure = addMinutes(arrival, MINUTES_PER_STOP)
      currentTime = departure

      const score = scoreVenue(venue, budgetPreference, startTime)

      return {
        order: i + 1,
        venue,
        arrivalTime: arrival,
        departureTime: departure,
        walkingFromPrevious: walkMins,
        distanceFromPrevious: Math.round(distFromPrev * 100) / 100,
        score,
      }
    })

    // ── 7. Totals ────────────────────────────────────────────────────────────
    const totalWalkingMinutes = stops.reduce((s, stop) => s + stop.walkingFromPrevious, 0)
    const totalDistanceKm = Math.round(
      stops.reduce((s, stop) => s + stop.distanceFromPrevious, 0) * 10,
    ) / 10
    const durationMinutes =
      stops.length * MINUTES_PER_STOP + totalWalkingMinutes

    const overallScore = Math.round(
      stops.reduce((s, stop) => s + stop.score.total, 0) / stops.length,
    )

    const estimatedCostLabel = deriveCostLabel(orderedVenues)

    // ── 8. Golden Window metadata ────────────────────────────────────────────
    const gw = goldenWindow
    const matchQuality = (gw.match_quality ?? 'partial') as MatchQuality
    const groupMatchPercent =
      gw.available_member_count !== undefined && gw.total_member_count
        ? Math.round((gw.available_member_count / gw.total_member_count) * 100)
        : undefined

    const qualityLabel: Record<MatchQuality, string> = {
      perfect: 'PERFECT MATCH',
      strong: 'STRONG MATCH',
      partial: 'PARTIAL MATCH',
      compromise: 'BEST OPTION',
    }

    // ── 9. Assemble result ───────────────────────────────────────────────────
    const warnings: string[] = []
    const closedLate = candidates.filter(
      c => !isOpenAt(c.venue, startTime) && c.included,
    )
    if (closedLate.length > 0) {
      warnings.push(
        `${closedLate[0].venue.name} opens slightly after the start — arrive a few minutes late.`,
      )
    }
    if (matchQuality === 'compromise') {
      warnings.push(
        'This time is a compromise — not everyone is fully available. Consider finding a new Golden Window.',
      )
    }
    if (dataSource === 'mock') {
      warnings.push(
        'Using demo venue data. Set a planning location so Nexus can find real pubs nearby.',
      )
    }

    return {
      title: '🍺 Nexus Pub Crawl',
      subtitle: `${dayLabel(gw.day_of_week)} · ${format12h(gw.start_time)}`,
      activityId: 'pub-crawl',
      durationMinutes,
      estimatedCostLabel,
      totalDistanceKm,
      walkingMinutes: totalWalkingMinutes,
      stops,
      overallScore,
      explanation: `Nexus selected ${stops.length} pubs based on rating, proximity, ${budgetPreference} budget, and opening hours. Route was optimised to minimise walking.`,
      warnings,
      generatedAt: new Date().toISOString(),
      goldenWindowQuality: matchQuality,
      groupMatchPercent,
      dataSource,
      providerName,
    }
  },
}

