// ─────────────────────────────────────────────────────────────────────────────
// Single-Venue Planner Factory
// ─────────────────────────────────────────────────────────────────────────────
// Creates a PlannerDefinition for any activity that results in choosing one
// best-fit venue (restaurant, coffee, cinema, bowling, live-music, etc.).
//
// Strategy:
//   1. Require an explicit planning location — no silent fallbacks.
//   2. Try OpenStreetMap provider with the group's location.
//   3. Fall back to MockVenueProvider when OSM returns insufficient results.
//   4. Score all candidates with the universal scorer.
//   5. Return the top pick as a single-stop PlannerResult.

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
import { MockVenueProvider } from './providers/mock-venue-provider'
import { scoreVenueForActivity, isVenueOpenAt, addMinutesToTime, format12h } from './scoring'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum real venues before we accept OSM results (avoids thin coverage areas) */
const MIN_OSM_RESULTS = 2

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const QUALITY_LABELS: Record<MatchQuality, string> = {
  perfect: 'PERFECT MATCH',
  strong: 'STRONG MATCH',
  partial: 'PARTIAL MATCH',
  compromise: 'BEST OPTION',
}

// ── Shared providers (module-level singletons) ────────────────────────────────
const osmProvider = new OpenStreetMapVenueProvider(1500)
const mockProvider = new MockVenueProvider()

// ── Factory ───────────────────────────────────────────────────────────────────

export interface SingleVenuePlannerConfig {
  /** Must match the activityId in the PLANNER_REGISTRY key */
  activityId: string
  activityEmoji: string
  activityLabel: string
}

export function createSingleVenuePlanner(config: SingleVenuePlannerConfig): PlannerDefinition {
  const { activityId, activityEmoji, activityLabel } = config

  return {
    id: `${activityId}-planner`,
    activityId,
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

      // ── Location is required — no silent fallback ──────────────────────────
      if (!groupLocation) {
        throw new Error(
          `Add a planning location so Nexus can find ${activityLabel.toLowerCase()} venues nearby.`,
        )
      }

      const startTime = goldenWindow.start_time

      // ── Venue discovery ────────────────────────────────────────────────────
      let venues: PlannerVenue[] = []
      let dataSource: 'real' | 'mock' = 'real'
      let providerName = 'OpenStreetMap'

      try {
        const realVenues = await osmProvider.getVenues(activityId, groupLocation)
        if (realVenues.length >= MIN_OSM_RESULTS) {
          venues = realVenues
        } else {
          throw new Error(
            `Only ${realVenues.length} OSM result(s) — insufficient for confident recommendation`,
          )
        }
      } catch {
        venues = await mockProvider.getVenues(activityId, groupLocation)
        dataSource = 'mock'
        providerName = 'Demo Venues'
      }

      if (venues.length === 0) {
        throw new Error(
          `No ${activityLabel.toLowerCase()} venues found near your location. Try a different meeting place.`,
        )
      }

      // ── Score & filter ─────────────────────────────────────────────────────
      const candidates = venues.map((venue) => {
        const scored = scoreVenueForActivity(venue, activityId, budgetPreference, startTime)
        const openDuringWindow =
          isVenueOpenAt(venue, startTime) ||
          isVenueOpenAt(venue, addMinutesToTime(startTime, 30)) ||
          !venue.openingHoursKnown
        return { venue, scored, openDuringWindow }
      })

      // Prefer open venues, but don't exclude everything if all are closed
      const open = candidates.filter((c) => c.openDuringWindow)
      const pool = open.length > 0 ? open : candidates
      pool.sort((a, b) => b.scored.total - a.scored.total)

      const { venue, scored } = pool[0]!

      // ── Warnings ───────────────────────────────────────────────────────────
      const warnings: string[] = []

      if (dataSource === 'mock') {
        warnings.push(
          'Showing demo venues — OpenStreetMap returned limited results for this area. Real venue discovery will improve as OSM data grows.',
        )
      }
      const gw = goldenWindow
      const matchQuality = ((gw.match_quality ?? 'partial') as MatchQuality)
      if (matchQuality === 'compromise') {
        warnings.push("This time is a best-effort compromise — not everyone is fully available.")
      }
      if (venue.openingHoursKnown === false && dataSource === 'real') {
        warnings.push(`Opening hours for ${venue.name} are not listed on OpenStreetMap — verify before visiting.`)
      }

      // ── Build result ───────────────────────────────────────────────────────
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
        : '££'

      // Suppress the quality label in explanation — it's shown in the UI badge
      void QUALITY_LABELS

      return {
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
          `Nexus selected ${venue.name} from ${venues.length} nearby ${activityLabel.toLowerCase()} venue${venues.length !== 1 ? 's' : ''}.`,
          scored.reasons.length > 0
            ? `Chosen because: ${scored.reasons.slice(0, 3).join(', ')}.`
            : '',
        ].filter(Boolean).join(' '),
        warnings,
        generatedAt: new Date().toISOString(),
        goldenWindowQuality: matchQuality,
        groupMatchPercent,
        dataSource,
        providerName,
        scoreReasons: scored.reasons,
      }
    },
  }
}
