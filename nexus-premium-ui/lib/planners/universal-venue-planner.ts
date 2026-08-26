import type {
  BudgetPreference,
  MatchQuality,
  PlannerDefinition,
  PlannerRequest,
  PlannerResult,
  PlannerStop,
  PlannerVenue,
} from './types'
import { getUniversalOsmVenues } from './providers/universal-osm-venue-provider'

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DEFAULT_RADIUS = 1500

function toMinutes(value: string) { const [h, m] = value.split(':').map(Number); return h * 60 + m }
function addMinutes(value: string, minutes: number) { const total = toMinutes(value) + minutes; const h = Math.floor(total / 60) % 24; const m = total % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
function format12h(value: string) { const [h, m] = value.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
function scoreVenue(venue: PlannerVenue, startTime: string, radiusKm: number, budget: BudgetPreference) {
  const distance = Math.max(0, Math.round((1 - Math.min(venue.distanceFromCentre / radiusKm, 1)) * 45))
  const hours = !venue.openingHoursKnown || toMinutes(startTime) >= toMinutes(venue.openingTime) ? 25 : 0
  const priceTarget = budget === 'low' ? 1 : budget === 'high' ? 3 : 2
  const price = venue.priceLevelKnown === false ? 10 : Math.max(0, 20 - Math.abs(venue.priceLevel - priceTarget) * 8)
  return Math.min(100, distance + hours + price + (venue.isRealData ? 10 : 0))
}

export interface UniversalVenueConfig { activityId: string; activityLabel: string; emoji: string }

export function createUniversalVenuePlanner(config: UniversalVenueConfig): PlannerDefinition {
  return {
    id: `${config.activityId}-universal-planner`, activityId: config.activityId, kind: 'venue',
    name: `${config.activityLabel} Planner`, description: `Finds real ${config.activityLabel.toLowerCase()} locations near the group's planning location.`,
    async plan(request: PlannerRequest): Promise<PlannerResult> {
      if (!request.goldenWindow) throw new Error(`Find a Golden Window before planning ${config.activityLabel.toLowerCase()}.`)
      if (!request.groupLocation) throw new Error(`Set a planning location so Nexus can find ${config.activityLabel.toLowerCase()} locations nearby.`)
      const radiusMetres = request.groupLocation.radiusMetres ?? DEFAULT_RADIUS
      const venues = await getUniversalOsmVenues(config.activityId, request.groupLocation, radiusMetres)
      if (!venues.length) throw new Error(`No real ${config.activityLabel.toLowerCase()} locations were found within ${Math.round(radiusMetres / 100) / 10} km. Try moving the planning location or widening the search area.`)

      const start = request.goldenWindow.start_time
      const budget = request.budgetPreference ?? 'medium'
      const ranked = venues.map(venue => ({ venue, score: scoreVenue(venue, start, radiusMetres / 1000, budget) })).sort((a, b) => b.score - a.score)
      const best = ranked[0]!
      const stop: PlannerStop = {
        order: 1, venue: best.venue, arrivalTime: start, departureTime: addMinutes(start, request.goldenWindow.duration_minutes),
        walkingFromPrevious: 0, distanceFromPrevious: 0,
        score: { total: best.score, breakdown: { rating: 0, distance: Math.min(20, Math.round((1 - Math.min(best.venue.distanceFromCentre / (radiusMetres / 1000), 1)) * 20)), price: 0, atmosphere: 0, openingHours: 0, capacity: 0 } },
      }
      const quality = (request.goldenWindow.match_quality ?? 'partial') as MatchQuality
      const matchPercent = request.goldenWindow.available_member_count != null && request.goldenWindow.total_member_count ? Math.round(request.goldenWindow.available_member_count / request.goldenWindow.total_member_count * 100) : undefined
      const warnings: string[] = []
      if (!best.venue.openingHoursKnown) warnings.push('Opening hours are not listed in OpenStreetMap — verify before visiting.')
      if (quality === 'compromise') warnings.push('The selected time is a best-effort compromise rather than a direct shared availability window.')
      return {
        kind: 'venue', title: `${config.emoji} ${config.activityLabel}`, subtitle: `${DAY_LABELS[request.goldenWindow.day_of_week] ?? 'Selected day'} · ${format12h(start)}`,
        activityId: config.activityId, durationMinutes: request.goldenWindow.duration_minutes,
        estimatedCostLabel: best.venue.priceLevelKnown === false ? 'Price unknown' : '£'.repeat(Math.max(1, best.venue.priceLevel)),
        totalDistanceKm: best.venue.distanceFromCentre, walkingMinutes: 0, stops: [stop], overallScore: best.score,
        explanation: `Nexus selected ${best.venue.name} from ${venues.length} real OpenStreetMap location${venues.length === 1 ? '' : 's'} near ${request.locationName ?? 'your planning location'}.`,
        warnings, generatedAt: new Date().toISOString(), goldenWindowQuality: quality, groupMatchPercent: matchPercent,
        dataSource: 'real', providerName: 'OpenStreetMap', scoreReasons: [`${best.venue.distanceFromCentre} km from your planning point`, best.venue.openingHoursKnown ? 'Opening hours are listed' : 'Opening hours need verification'],
      }
    },
  }
}
