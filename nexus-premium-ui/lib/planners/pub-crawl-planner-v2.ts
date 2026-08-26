import type { BudgetPreference, MatchQuality, PlannerDefinition, PlannerRequest, PlannerResult, PlannerStop, PlannerVenue } from './types'
import { OpenStreetMapVenueProvider } from './providers/openstreetmap-venue-provider'

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DEFAULT_RADIUS = 1500
const STOP_MINUTES = 42

function mins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
function add(t: string, n: number) { const x = mins(t) + n; return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}` }
function fmt(t: string) { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
function distance(a: PlannerVenue, b: PlannerVenue) { const r = 6371; const p = Math.PI / 180; const dLat = (b.lat - a.lat) * p; const dLng = (b.lng - a.lng) * p; const q = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dLng / 2) ** 2; return r * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)) }
function score(v: PlannerVenue, radiusKm: number, budget: BudgetPreference) {
  const dist = Math.round((1 - Math.min(v.distanceFromCentre / radiusKm, 1)) * 40)
  const priceTarget = budget === 'low' ? 1 : budget === 'high' ? 3 : 2
  const price = v.priceLevelKnown === false ? 8 : Math.max(0, 20 - Math.abs(v.priceLevel - priceTarget) * 7)
  const hours = v.openingHoursKnown ? 20 : 10
  return Math.min(100, dist + price + hours + (v.isRealData ? 10 : 0))
}
function routeOrder(venues: PlannerVenue[]) {
  if (venues.length <= 1) return venues
  const remaining = [...venues]
  const result = [remaining.shift()!]
  while (remaining.length) {
    const last = result[result.length - 1]!
    let best = 0, bestDist = Infinity
    remaining.forEach((v, i) => { const d = distance(last, v); if (d < bestDist) { best = i; bestDist = d } })
    result.push(remaining.splice(best, 1)[0]!)
  }
  return result
}

export const pubCrawlPlannerV2: PlannerDefinition = {
  id: 'pub-crawl-planner-v2',
  activityId: 'pub-crawl',
  kind: 'venue',
  name: 'Pub Crawl Planner',
  description: 'Builds a real multi-stop pub crawl from nearby OpenStreetMap pubs and bars.',
  async plan(request: PlannerRequest): Promise<PlannerResult> {
    if (!request.goldenWindow) throw new Error('Find a Golden Window before planning your pub crawl.')
    if (!request.groupLocation) throw new Error('Set a planning location so Nexus can find pubs nearby.')

    const radius = request.groupLocation.radiusMetres ?? DEFAULT_RADIUS
    const provider = new OpenStreetMapVenueProvider(radius)
    const venues = await provider.getVenues('pub-crawl', request.groupLocation)
    if (venues.length < 2) throw new Error(`Only ${venues.length} real pub/bar location${venues.length === 1 ? '' : 's'} found nearby. Move the planning location or widen the search area.`)

    const budget = request.budgetPreference ?? 'medium'
    const ranked = venues.map(v => ({ venue: v, score: score(v, radius / 1000, budget) })).sort((a, b) => b.score - a.score)
    const count = Math.min(request.desiredStops ?? 4, ranked.length)
    const ordered = routeOrder(ranked.slice(0, count).map(x => x.venue))
    const start = request.goldenWindow.start_time
    let current = start
    const stops: PlannerStop[] = ordered.map((venue, index) => {
      const previous = ordered[index - 1]
      const walk = previous ? Math.max(1, Math.round(distance(previous, venue) / 0.083)) : 0
      if (index > 0) current = add(current, walk)
      const arrival = current
      const departure = add(arrival, STOP_MINUTES)
      current = departure
      return {
        order: index + 1,
        venue,
        arrivalTime: arrival,
        departureTime: departure,
        walkingFromPrevious: walk,
        distanceFromPrevious: previous ? Math.round(distance(previous, venue) * 100) / 100 : 0,
        score: { total: score(venue, radius / 1000, budget), breakdown: { rating: 0, distance: 0, price: 0, atmosphere: 0, openingHours: 0, capacity: 0 } },
        role: index === 0 ? 'Opener' : index === ordered.length - 1 ? 'Finale' : 'Stop',
        reason: venue.openingHoursKnown ? 'Real venue with listed opening hours' : 'Real venue — opening hours need verification',
      }
    })
    const walkingMinutes = stops.reduce((sum, s) => sum + s.walkingFromPrevious, 0)
    const totalDistanceKm = Math.round(stops.reduce((sum, s) => sum + s.distanceFromPrevious, 0) * 10) / 10
    const quality = (request.goldenWindow.match_quality ?? 'partial') as MatchQuality
    const matchPercent = request.goldenWindow.available_member_count != null && request.goldenWindow.total_member_count ? Math.round(request.goldenWindow.available_member_count / request.goldenWindow.total_member_count * 100) : undefined
    const warnings: string[] = []
    if (quality === 'compromise') warnings.push('The selected time is a best-effort compromise.')
    if (stops.some(s => s.venue?.openingHoursKnown === false)) warnings.push('Some opening hours are not listed in OpenStreetMap — verify before setting off.')
    return {
      kind: 'venue', title: '🍺 Pub Crawl', subtitle: `${DAY_LABELS[request.goldenWindow.day_of_week] ?? 'Selected day'} · ${fmt(start)}`,
      activityId: 'pub-crawl', durationMinutes: ordered.length * STOP_MINUTES + walkingMinutes, estimatedCostLabel: '££', totalDistanceKm, walkingMinutes,
      stops, overallScore: Math.round(stops.reduce((sum, s) => sum + s.score.total, 0) / stops.length),
      explanation: `Built a ${ordered.length}-stop route from ${venues.length} real pubs and bars near ${request.locationName ?? 'your planning location'}.`, warnings,
      generatedAt: new Date().toISOString(), goldenWindowQuality: quality, groupMatchPercent, dataSource: 'real', providerName: 'OpenStreetMap',
      scoreReasons: ['Real nearby venues', 'Route ordered to reduce walking between stops'],
    }
  },
}
