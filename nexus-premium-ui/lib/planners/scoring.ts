// ─────────────────────────────────────────────────────────────────────────────
// Nexus Universal Scoring — activity-agnostic venue scorer
// ─────────────────────────────────────────────────────────────────────────────
// Weights: rating(20) + distance(20) + openingHours(17) + activityMatch(17)
//          + price(15) + capacity(11) = 100

import type { PlannerVenue, PlannerScore, PlannerScoreBreakdown, BudgetPreference } from './types'

// ── Utility ───────────────────────────────────────────────────────────────────

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function addMinutesToTime(t: string, mins: number): string {
  const total = timeToMinutes(t) + mins
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function format12h(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr ?? '0', 10)
  const m = parseInt(mStr ?? '0', 10)
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

// ── Opening-hours check ───────────────────────────────────────────────────────

export function isVenueOpenAt(venue: PlannerVenue, time: string): boolean {
  // Unknown hours → assume open (optimistic)
  if (!venue.openingHoursKnown) return true
  const t = timeToMinutes(time)
  const open = timeToMinutes(venue.openingTime)
  let close = timeToMinutes(venue.closingTime)
  if (close < open) close += 24 * 60 // overnight venue
  return t >= open && t <= close
}

// ── Activity-specific signal tags ─────────────────────────────────────────────
// Tags in a venue's atmosphere/tags arrays that indicate a strong fit.

const ACTIVITY_MATCH_TAGS: Record<string, string[]> = {
  'pub-crawl':    ['lively', 'social', 'vibrant', 'modern', 'classic', 'welcoming', 'eclectic'],
  'cocktail-bar': ['trendy', 'upscale', 'social', 'vibrant', 'modern', 'lively'],
  'restaurant':   ['romantic', 'family', 'upscale', 'casual', 'traditional', 'modern', 'cosy', 'bistro'],
  'brunch':       ['cosy', 'modern', 'casual', 'relaxed', 'friendly', 'artisan'],
  'coffee':       ['cosy', 'quiet', 'artisan', 'modern', 'relaxed', 'friendly', 'specialty'],
  'bowling':      ['fun', 'family', 'casual', 'social', 'modern', 'lively'],
  'cinema':       ['modern', 'premium', 'comfortable', 'classic', 'upscale'],
  'live-music':   ['lively', 'vibrant', 'eclectic', 'alternative', 'social', 'electric', 'intimate'],
  'board-games':  ['cosy', 'social', 'casual', 'fun', 'relaxed', 'friendly'],
  'escape-room':  ['fun', 'social', 'modern', 'eclectic'],
}

const BUDGET_PRICE_MAP: Record<BudgetPreference, number> = { low: 1, medium: 2, high: 3 }

// ── Scorer ────────────────────────────────────────────────────────────────────

export interface ScoredVenue extends PlannerScore {
  reasons: string[]
}

// Default scoring radius when no planning intelligence radius is available.
// Matches the pub-crawl planner's DEFAULT_RADIUS_METRES (1500m) in km.
// Do NOT duplicate the Location Intelligence radius table here — the planning
// radius is always passed in via PlannerRequest.groupLocation.radiusMetres.
const DEFAULT_SCORING_RADIUS_KM = 1.5

export function scoreVenueForActivity(
  venue: PlannerVenue,
  activityId: string,
  budget: BudgetPreference,
  startTime: string,
  /**
   * Planning radius in km derived from PlannerRequest.groupLocation.radiusMetres.
   * Defaults to 1.5 km (1500 m) for backward compatibility when no radius is
   * available. Adaptive values come from Location Intelligence:
   *   urban-core → 0.8 km  |  suburban → 2 km  |  town → 3.5 km  |  rural → 8 km
   */
  planningRadiusKm: number = DEFAULT_SCORING_RADIUS_KM,
): ScoredVenue {
  const reasons: string[] = []

  // ── Rating (0–20) — skip if unknown, give neutral 10 ─────────────────────
  const ratingScore =
    venue.ratingKnown === false
      ? 10
      : Math.round((Math.max(0, Math.min(5, venue.rating)) / 5) * 20)
  if (venue.ratingKnown !== false && venue.rating >= 4.0) {
    reasons.push(`Rated ${venue.rating.toFixed(1)}/5`)
  }

  // ── Distance (0–20) ───────────────────────────────────────────────────────
  // Score degrades linearly from 20 (at 0 km) to 0 (at planningRadiusKm).
  // Venues beyond the planning radius score 0 (heavily penalised).
  // The radius adapts to the group's planning context via groupLocation.radiusMetres:
  //   urban-core (0.8 km) → tight cluster preferred
  //   town (3.5 km) → 2 km venue scores ~9, not 0
  //   rural (8 km) → 5 km venue scores ~8, not 0
  const distScore = Math.max(
    0,
    Math.round(
      ((planningRadiusKm - Math.min(venue.distanceFromCentre, planningRadiusKm)) /
        planningRadiusKm) *
        20,
    ),
  )
  const distKm = Math.round(venue.distanceFromCentre * 10) / 10
  // Reason-text thresholds scale with the radius so "very close" and "nearby"
  // mean the same relative thing regardless of area type.
  const veryCloseThreshold = planningRadiusKm * 0.15
  const nearbyThreshold    = planningRadiusKm * 0.50
  if (distKm <= veryCloseThreshold) reasons.push(`${distKm} km from your group — very close`)
  else if (distKm <= nearbyThreshold) reasons.push(`${distKm} km from your group`)

  // ── Opening hours (0–17) ──────────────────────────────────────────────────
  let openingScore = 0
  const openNow = isVenueOpenAt(venue, startTime)
  const openSoon = isVenueOpenAt(venue, addMinutesToTime(startTime, 30))
  if (!venue.openingHoursKnown) {
    openingScore = 9 // unknown — optimistic partial credit
  } else if (openNow) {
    openingScore = 17
    reasons.push('Open during your Golden Window')
  } else if (openSoon) {
    openingScore = 8
  }

  // ── Activity match (0–17) ─────────────────────────────────────────────────
  const matchTags = new Set(ACTIVITY_MATCH_TAGS[activityId] ?? [])
  const allVenueTags = [...venue.atmosphere, ...venue.tags, ...venue.features]
  const matchCount = allVenueTags.filter((t) => matchTags.has(t)).length
  const activityMatchScore = Math.round((Math.min(matchCount, 3) / 3) * 17)
  if (activityMatchScore >= 12) reasons.push(`Great match for ${activityId.replace(/-/g, ' ')}`)
  else if (activityMatchScore >= 6) reasons.push('Suitable venue type')

  // ── Price match (0–15) ───────────────────────────────────────────────────
  let priceScore = 8 // default neutral when price unknown
  if (venue.priceLevelKnown !== false) {
    const target = BUDGET_PRICE_MAP[budget]
    const diff = Math.abs(venue.priceLevel - target)
    priceScore = diff === 0 ? 15 : diff === 1 ? 9 : diff === 2 ? 4 : 0
    if (diff === 0) reasons.push('Matches your budget')
  }

  // ── Capacity (0–11) ───────────────────────────────────────────────────────
  const capScore = venue.capacity === 'large' ? 11 : venue.capacity === 'medium' ? 7 : 3

  const breakdown: PlannerScoreBreakdown = {
    rating:       ratingScore,
    distance:     distScore,
    price:        priceScore,
    atmosphere:   activityMatchScore,
    openingHours: openingScore,
    capacity:     capScore,
  }
  const total = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0))

  return { total, breakdown, reasons }
}
