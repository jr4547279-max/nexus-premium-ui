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
  /**
   * Planning radius in km — derived from groupLocation.radiusMetres.
   * Defaults to DEFAULT_RADIUS_METRES / 1000 = 1.5 km for backward compatibility.
   * Location Intelligence provides the adaptive value:
   *   urban-core → 0.8 km | suburban → 2 km | town → 3.5 km | rural → 8 km
   */
  planningRadiusKm: number = DEFAULT_RADIUS_METRES / 1000,
): PlannerScore {
  // Rating (0–20): linear scale against 5-star max
  const rating = Math.round((venue.rating / 5) * 20)

  // Distance (0–20): linear decay from 20 at 0 km to 0 at planningRadiusKm.
  // Venues beyond the planning radius score 0 (heavily penalised).
  // Adaptive to the group's area type — a 2 km pub in a town (3.5 km radius)
  // scores ~9, whereas a 2 km pub in an urban-core (0.8 km radius) scores 0.
  const distScore = Math.max(
    0,
    Math.round(
      ((planningRadiusKm - Math.min(venue.distanceFromCentre, planningRadiusKm)) /
        planningRadiusKm) *
        20,
    ),
  )

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

// ── Crawl arc roles ───────────────────────────────────────────────────────────

/**
 * Assign a crawl-arc role label based on stop position and total stop count.
 * Labels communicate where in the evening this pub sits — not invented data.
 *
 * 2 stops:   Opener → Finale
 * 3 stops:   Opener → Mid-crawl → Finale
 * 4 stops:   Opener → Building → Peak → Finale
 * 5+ stops:  Opener → Building → Peak × N → Finale
 */
function deriveCrawlRole(index: number, total: number): string {
  if (total <= 1) return ''
  if (index === 0) return 'Opener'
  if (index === total - 1) return 'Finale'
  if (total === 3) return 'Mid-crawl'
  const midPos = (index - 1) / (total - 2) // 0–1 through the middle stops
  return midPos < 0.5 ? 'Building' : 'Peak'
}

// ── Stop reasons ──────────────────────────────────────────────────────────────

/**
 * Derive an honest short reason for selecting a venue.
 *
 * For mock venues: uses rich atmosphere/feature data from the mock provider.
 * For real OSM venues: only states verifiable facts — distance from the start,
 * venue type from OSM amenity/leisure tags, and confirmed opening hours.
 * Never invents characteristics that OSM doesn't provide.
 */
function deriveStopReason(
  venue: PlannerVenue,
  index: number,
  dataSource: 'real' | 'mock',
): string {
  // Mock venues carry rich atmosphere and feature tags — use them honestly
  if (dataSource === 'mock') {
    if (venue.atmosphere.length > 0) {
      const atm = venue.atmosphere
        .slice(0, 2)
        .map(a => a.charAt(0).toUpperCase() + a.slice(1))
      return `${atm.join(' & ')} atmosphere`
    }
    if (venue.features.length > 0) {
      return `Known for ${venue.features[0].replace(/-/g, ' ')}`
    }
    return 'Highly rated for your group'
  }

  // Real OSM venues — only state what the data confirms
  const parts: string[] = []

  // Distance context
  if (index === 0) {
    parts.push(venue.distanceFromCentre < 0.25 ? 'Right at your start point' : 'Close to your start point')
  } else {
    parts.push(venue.distanceFromCentre < 0.5 ? 'Nearby' : 'On your route')
  }

  // Venue type from OSM amenity/leisure tags
  const typeTag = venue.tags.find(t => ['pub', 'bar', 'nightclub', 'biergarten'].includes(t))
  if (typeTag) {
    const typeLabel =
      typeTag === 'nightclub' ? 'nightclub' :
      typeTag === 'biergarten' ? 'beer garden' :
      typeTag === 'bar' ? 'bar' : 'pub'
    parts.push(typeLabel)
  }

  // Confirmed hours (only when OSM actually provided them)
  if (venue.openingHoursKnown) {
    parts.push('hours confirmed')
  }

  return parts.join(' · ')
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
  kind: 'venue',
  name: 'Pub Crawl Planner',
  description: 'Plans a group pub crawl using the Golden Window for timing.',

  async plan(request: PlannerRequest): Promise<PlannerResult> {
    const {
      goldenWindow,
      budgetPreference = DEFAULT_BUDGET,
      desiredStops = DEFAULT_STOPS,
      groupLocation,
      locationName,
    } = request

    // Derive planning radius for adaptive distance scoring.
    // Uses Location Intelligence radius when stored (urban-core 800m / suburban
    // 2km / town 3.5km / rural 8km). Falls back to DEFAULT_RADIUS_METRES (1500m)
    // so existing requests without radiusMetres continue to work unchanged.
    const planningRadiusKm = (groupLocation?.radiusMetres ?? DEFAULT_RADIUS_METRES) / 1000

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
      const score = scoreVenue(venue, budgetPreference, startTime, planningRadiusKm)

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

      const score = scoreVenue(venue, budgetPreference, startTime, planningRadiusKm)

      return {
        order: i + 1,
        venue,
        arrivalTime: arrival,
        departureTime: departure,
        walkingFromPrevious: walkMins,
        distanceFromPrevious: Math.round(distFromPrev * 100) / 100,
        score,
        role:   deriveCrawlRole(i, orderedVenues.length),
        reason: deriveStopReason(venue, i, dataSource),
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

    // Location-aware title — e.g. "Brighton Pub Crawl" instead of generic fallback
    const crawlTitle = locationName
      ? `🍺 ${locationName} Pub Crawl`
      : '🍺 Nexus Pub Crawl'

    // Crawl summary — specific about what was found and how the route was built
    const sourceLabel = dataSource === 'real'
      ? `real ${providerName} venues`
      : 'demo venues'
    const crawlExplanation =
      `Nexus selected ${stops.length} ${sourceLabel} for your crawl — ` +
      `scored by proximity, budget (${budgetPreference}), and opening hours. ` +
      `Route was optimised to minimise backtracking across ${totalDistanceKm} km total.`

    return {
      kind: 'venue',
      title: crawlTitle,
      subtitle: `${dayLabel(gw.day_of_week)} · ${format12h(gw.start_time)}`,
      activityId: 'pub-crawl',
      durationMinutes,
      estimatedCostLabel,
      totalDistanceKm,
      walkingMinutes: totalWalkingMinutes,
      stops,
      overallScore,
      explanation: crawlExplanation,
      warnings,
      generatedAt: new Date().toISOString(),
      goldenWindowQuality: matchQuality,
      groupMatchPercent,
      dataSource,
      providerName,
    }
  },
}

