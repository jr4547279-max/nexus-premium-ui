// ─────────────────────────────────────────────────────────────────────────────
// Single-Venue Planner Factory
// ─────────────────────────────────────────────────────────────────────────────
// Creates a PlannerDefinition for any activity that results in choosing one
// best-fit venue (restaurant, coffee, cinema, bowling, live-music, etc.).
//
// Golden Window is intentionally OPTIONAL here. Nexus can discover venues
// from the activity + planning location first, then use a Golden Window as a
// timing layer. The planner returns several ranked real venues so the UI can
// present genuine alternatives instead of silently selecting one at random.

import type {
  PlannerDefinition,
  PlannerRequest,
  PlannerResult,
  PlannerStop,
  PlannerVenue,
  BudgetPreference,
  MatchQuality,
} from './types'
import { RealVenueProvider } from './providers/real-venue-provider'
import { scoreVenueForActivity, isVenueOpenAt, addMinutesToTime, format12h } from './scoring'

const MIN_REAL_RESULTS = 1
const MAX_SUGGESTIONS = 5
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
    description: `Finds and ranks several real ${activityLabel.toLowerCase()} venues for your group based on location, with Golden Window available as an optional timing layer.`,

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

      const provider = new RealVenueProvider(radiusMetres)
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

      const candidates = venues.map((venue) => {
        const scored = scoreVenueForActivity(
          venue,
          activityId,
          budgetPreference,
          hasGoldenWindow ? startTime : undefined,
          planningRadiusKm,
        )

        const openDuringWindow = hasGoldenWindow
          ? isVenueOpenAt(venue, startTime) ||
            isVenueOpenAt(venue, addMinutesToTime(startTime, 30)) ||
            !venue.openingHoursKnown
          : true

        return { venue, scored, openDuringWindow }
      })

      const open = candidates.filter((c) => c.openDuringWindow)
      const pool = (open.length > 0 ? open : candidates)
        .slice()
        .sort((a, b) => b.scored.total - a.scored.total)
      const selected = pool.slice(0, MAX_SUGGESTIONS)
      const top = selected[0]!
      const { venue, scored } = top

      const warnings: string[] = []
      if (venue.openingHoursKnown === false) {
        warnings.push(
          `Opening hours for ${venue.name} are not listed in the real venue source — verify before visiting.`,
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

      const stops: PlannerStop[] = selected.map(({ venue: candidateVenue, scored: candidateScore }, index) => ({
        order: index + 1,
        venue: candidateVenue,
        arrivalTime: startTime,
        departureTime: addMinutesToTime(startTime, durationMinutes),
        walkingFromPrevious: 0,
        distanceFromPrevious: 0,
        score: { total: candidateScore.total, breakdown: candidateScore.breakdown },
        role: index === 0 ? 'Top pick' : 'Alternative',
        reason: candidateScore.reasons.slice(0, 2).join(' · '),
      }))

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
          : 'Real venues ranked · timing flexible',
        activityId,
        durationMinutes,
        estimatedCostLabel: costLabel,
        totalDistanceKm: venue.distanceFromCentre,
        walkingMinutes: 0,
        stops,
        overallScore: scored.total,
        explanation: [
          `Nexus ranked ${selected.length} real nearby ${activityLabel.toLowerCase()} venue${selected.length !== 1 ? 's' : ''}.`,
          `Top pick: ${venue.name}.`,
          scored.reasons.length > 0
            ? `Chosen because: ${scored.reasons.slice(0, 3).join(', ')}.`
            : '',
          goldenWindow
            ? 'The ranking was scored against your Golden Window.'
            : 'No Golden Window was required — timing stays flexible until you choose a venue.',
        ].filter(Boolean).join(' '),
        warnings,
        generatedAt: new Date().toISOString(),
        goldenWindowQuality: matchQuality,
        groupMatchPercent,
        dataSource: 'real',
        providerName: 'Google Places / OpenStreetMap',
        scoreReasons: scored.reasons,
      }
    },
  }
}
