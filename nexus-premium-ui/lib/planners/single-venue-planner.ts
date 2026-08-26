// ─────────────────────────────────────────────────────────────────────────────
// Single-Venue Planner Factory
// ─────────────────────────────────────────────────────────────────────────────
// Creates a PlannerDefinition for any activity that results in choosing one
// best-fit venue (restaurant, coffee, cinema, bowling, live-music, etc.).
//
// Production rule: planner recommendations must be real venues. We use the
// OpenStreetMap/Overpass provider as the no-key real-data source and never fall
// back to fictional/demo venues in the user-facing planner.

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
    description: `Finds the best ${activityLabel.toLowerCase()} venue for your group based on location and availability.`,

    async plan(request: PlannerRequest): Promise<PlannerResult> {
      const {
        goldenWindow,
        budgetPreference = 'medium' as BudgetPreference,
        groupLocation,
      } = request

      if (!goldenWindow) {
        throw new Error(
          `Add your availability first — ${activityLabel} planning needs to know when your group is free.`,
        )
      }

      if (!groupLocation) {
        throw new Error(
          `Add a planning location so Nexus can find ${activityLabel.toLowerCase()} venues nearby.`,
        )
      }

      const startTime = goldenWindow.start_time
      const radiusMetres = groupLocation.radiusMetres ?? DEFAULT_RADIUS_METRES
      const planningRadiusKm = radiusMetres / 1000

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
          startTime,
          planningRadiusKm,
        )
        const openDuringWindow =
          isVenueOpenAt(venue, startTime) ||
          isVenueOpenAt(venue, addMinutesToTime(startTime, 30)) ||
          !venue.openingHoursKnown
        return { venue, scored, openDuringWindow }
      })

      // Prefer venues that are open at the Golden Window. If OSM doesn't have
      // hours for any candidate, retain them rather than pretending they are closed.
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

      const gw = goldenWindow
      const matchQuality = (gw.match_quality ?? 'partial') as MatchQuality
      if (matchQuality === 'compromise') {
        warnings.push('This time is a best-effort compromise — not everyone is fully available.')
      }

      const groupMatchPercent =
        gw.available_member_count != null && gw.total_member_count
          ? Math.round((gw.available_member_count / gw.total_member_count) * 100)
          : undefined

      const dayName = DAY_LABELS[gw.day_of_week] ?? 'Unknown'

      const stop: PlannerStop = {
        order: 1,
        venue,
        arrivalTime: startTime,
        departureTime: addMinutesToTime(startTime, gw.duration_minutes),
        walkingFromPrevious: 0,
        distanceFromPrevious: 0,
        score: { total: scored.total, breakdown: scored.breakdown },
      }

      const costLabel = venue.priceLevelKnown !== false
        ? '£'.repeat(Math.max(1, Math.min(4, venue.priceLevel)))
        : 'Price unavailable'

      void QUALITY_LABELS

      return {
        kind: 'venue',
        title: `${activityEmoji} ${activityLabel}`,
        subtitle: `${dayName} · ${format12h(startTime)}`,
        activityId,
        durationMinutes: gw.duration_minutes,
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
