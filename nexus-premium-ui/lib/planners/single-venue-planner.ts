// ─────────────────────────────────────────────────────────────────────────────
// Single-Venue Planner Factory
// ─────────────────────────────────────────────────────────────────────────────
// Creates a PlannerDefinition for any activity that results in choosing one
// best-fit venue (restaurant, coffee, cinema, bowling, live-music, etc.).
//
// Golden Window is intentionally OPTIONAL here. Nexus can discover a venue
// from the activity + planning location first, then calculate a Golden Window
// around the chosen venue later. When a Golden Window is supplied, it improves
// time-aware scoring and produces a timed plan.

import type {
  PlannerDefinition,
  PlannerRequest,
  PlannerResult,
  PlannerStop,
  PlannerVenue,
  BudgetPreference,
  MatchQuality,
} from './types'
import { OpenStreetMapVenueProvider } from './providers/openstreetmap-venue-provider'
import { scoreVenueForActivity, isVenueOpenAt, addMinutesToTime, format12h } from './scoring'

const MIN_REAL_RESULTS = 1
const DEFAULT_RADIUS_METRES = 1500
const DEFAULT_FLEXIBLE_START = '12:00'
const DEFAULT_FLEXIBLE_DURATION = 120

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const QUALITY_LABELS: Record<MatchQuality, string> = {
  perfect: 'PERFECT MATCH',
  strong: 'STRONG MATCH',
  partial: 'PARTIAL MATCH',
  compromise: 'BEST OPTION',
}

export interface SingleVenuePlannerConfig {
  activityId: string
  activityEmoji: string
  activityLabel: string
}

export function createSingleVenuePlanner(config: SingleVenuePlannerConfig): PlannerDefinition {
  const { activityId, activityEmoji, activityLabel } = config

  return {
    id: `${activityId}-planner`,
    activityId,
    kind: 'venue',
    name: `${activityLabel} Planner`,
    description: `Finds the best ${activityLabel.toLowerCase()} venue for your group based on location, with Golden Window available as an optional timing layer.`,

    async plan(request: PlannerRequest): Promise<PlannerResult> {
      const {
        goldenWindow,
        budgetPreference = 'medium' as BudgetPreference,
        groupLocation,
      } = request

      if (!groupLocation) {
        throw new Error(
          `Add a planning location so Nexus can find ${activityLabel.toLowerCase()} venues nearby.`,
        )
      }

      const radiusMetres = groupLocation.radiusMetres ?? DEFAULT_RADIUS_METRES
      const planningRadiusKm = radiusMetres / 1000
      const hasGoldenWindow = !!goldenWindow
      const startTime = goldenWindow?.start_time ?? DEFAULT_FLEXIBLE_START
      const durationMinutes = goldenWindow?.duration_minutes ?? DEFAULT_FLEXIBLE_DURATION

      // ── Real venue discovery only ──────────────────────────────────────────
      // OSM is deliberately the fallback-free production provider here. It
      // returns named, geographically real-world venues and never invents data.
      const provider = new OpenStreetMapVenueProvider(radiusMetres)
      let venues: PlannerVenue[]
      try {
        venues = await provider.getVenues(activityId, groupLocation)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Venue search failed.'
        throw new Error(
          `Nexus could not reach the real venue service for ${activityLabel.toLowerCase()}. ${message}`,
        )
      }

      if (venues.length < MIN_REAL_RESULTS) {
        throw new Error(
          `Nexus couldn't find a real ${activityLabel.toLowerCase()} venue within ${radiusMetres >= 1000 ? `${(radiusMetres / 1000).toFixed(1)} km` : `${radiusMetres} m`} of your planning location. Try a nearby location or a different activity.`,
        )
      }

      // ── Score & filter ─────────────────────────────────────────────────────
      const candidates = venues.map((venue) => {
        const scored = scoreVenueForActivity(
          venue,
          activityId,
          budgetPreference,
          hasGoldenWindow ? startTime : undefined,
          planningRadiusKm,
        )

        // Opening hours should influence the result only when the user has
        // supplied a Golden Window. Without one, we're choosing a venue first
        // and the user can decide the time afterwards.
        const openDuringWindow = hasGoldenWindow
          ? isVenueOpenAt(venue, startTime) ||
            isVenueOpenAt(venue, addMinutesToTime(startTime, 30)) ||
            !venue.openingHoursKnown
          : true

        return { venue, scored, openDuringWindow }
      })

      const open = candidates.filter((c) => c.openDuringWindow)
      const pool = open.length > 0 ? open : candidates
      pool.sort((a, b) => b.scored.total - a.scored.total)

      const { venue, scored } = pool[0]!

      const warnings: string[] = []
      if (venue.openingHoursKnown === false) {
        warnings.push(
          `Opening hours for ${venue.name} are not listed in OpenStreetMap — verify before visiting.`,
        )
      }
      if (venue.ratingKnown === false) {
        warnings.push('Ratings and review counts are not available from the real venue source.')
      }
      if (venue.priceLevelKnown === false) {
        warnings.push('Pricing is not available from the real venue source.')
      }

      if (goldenWindow) {
        const matchQuality = (goldenWindow.match_quality ?? 'partial') as MatchQuality
        if (matchQuality === 'compromise') {
          warnings.push('This time is a best-effort compromise — not everyone is fully available.')
        }
      } else {
        warnings.push('Timing is flexible. Find a Golden Window later to choose the best time for this venue.')
      }

      const groupMatchPercent = goldenWindow?.available_member_count != null && goldenWindow.total_member_count
        ? Math.round((goldenWindow.available_member_count / goldenWindow.total_member_count) * 100)
        : undefined

      const dayName = goldenWindow
        ? DAY_LABELS[goldenWindow.day_of_week] ?? 'Unknown'
        : 'Flexible timing'

      const stop: PlannerStop = {
        order: 1,
        venue,
        arrivalTime: startTime,
        departureTime: addMinutesToTime(startTime, durationMinutes),
        walkingFromPrevious: 0,
        distanceFromPrevious: 0,
        score: { total: scored.total, breakdown: scored.breakdown },
      }

      const costLabel = venue.priceLevelKnown !== false
        ? '£'.repeat(Math.max(1, Math.min(4, venue.priceLevel)))
        : 'Price unavailable'

      const matchQuality = goldenWindow
        ? (goldenWindow.match_quality ?? 'partial') as MatchQuality
        : undefined

      void QUALITY_LABELS

      return {
        kind: 'venue',
        title: `${activityEmoji} ${activityLabel}`,
        subtitle: goldenWindow
          ? `${dayName} · ${format12h(startTime)}`
          : 'Venue selected · timing flexible',
        activityId,
        durationMinutes,
        estimatedCostLabel: costLabel,
        totalDistanceKm: venue.distanceFromCentre,
        walkingMinutes: 0,
        stops: [stop],
        overallScore: scored.total,
        explanation: [
          `Nexus selected ${venue.name} from ${venues.length} real nearby ${activityLabel.toLowerCase()} venue${venues.length !== 1 ? 's' : ''}.`,
          scored.reasons.length > 0
            ? `Chosen because: ${scored.reasons.slice(0, 3).join(', ')}.`
            : '',
          goldenWindow
            ? 'The selection was scored against your Golden Window.'
            : 'No Golden Window was required — you can choose the best time after selecting the venue.',
        ].filter(Boolean).join(' '),
        warnings,
        generatedAt: new Date().toISOString(),
        goldenWindowQuality: matchQuality,
        groupMatchPercent,
        dataSource: 'real',
        providerName: 'OpenStreetMap',
        scoreReasons: scored.reasons,
      }
    },
  }
}
