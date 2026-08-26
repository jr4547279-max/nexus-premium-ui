import type { PlannerDefinition, PlannerResult, PlannerVenue } from './types'
import { pubCrawlPlanner } from './pub-crawl-planner'

type VenuePhoto = PlannerVenue & { photoUrl?: string | null; ratingCount?: number | null }

interface PlacesResponse {
  venues?: Array<{
    name?: string
    rating?: number | null
    rating_count?: number | null
    photo_url?: string | null
    lat?: number | null
    lng?: number | null
  }>
}

function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function distanceKm(a: PlannerVenue, b: { lat?: number | null; lng?: number | null }): number {
  if (b.lat == null || b.lng == null) return Infinity
  const R = 6371
  const toRad = (n: number) => (n * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

async function enrichWithGooglePlaces(
  result: PlannerResult,
  location: { lat: number; lng: number; radiusMetres?: number },
): Promise<PlannerResult> {
  try {
    const params = new URLSearchParams({
      vibe: 'pub',
      lat: String(location.lat),
      lng: String(location.lng),
      radius: String(Math.min(location.radiusMetres ?? 5000, 10000)),
      limit: '12',
    })
    const response = await fetch(`/nx/places?${params.toString()}`, { cache: 'no-store' })
    if (!response.ok) return result

    const payload = (await response.json()) as PlacesResponse
    const places = payload.venues ?? []
    if (places.length === 0) return result

    const enrichedStops = result.stops.map((stop) => {
      if (!stop.venue) return stop

      const venue = stop.venue
      const targetName = normaliseName(venue.name)
      const match = places
        .map((place) => ({
          place,
          nameMatch: normaliseName(place.name ?? '') === targetName,
          distance: distanceKm(venue, place),
        }))
        .filter((candidate) => candidate.nameMatch || candidate.distance <= 0.25)
        .sort((a, b) => Number(b.nameMatch) - Number(a.nameMatch) || a.distance - b.distance)[0]

      if (!match) return stop

      const nextVenue = { ...venue, photoUrl: match.place.photo_url ?? null } as VenuePhoto
      if (match.place.rating != null && match.place.rating > 0) {
        nextVenue.rating = match.place.rating
        nextVenue.ratingKnown = true
        nextVenue.ratingCount = match.place.rating_count ?? null
      }

      return { ...stop, venue: nextVenue }
    })

    return { ...result, stops: enrichedStops }
  } catch {
    // Google enrichment is optional. The underlying OSM plan remains fully real.
    return result
  }
}

/**
 * Production pub-crawl planner guard.
 *
 * The legacy planner contains a deterministic demo fallback so the prototype
 * remains usable in development. The real app must never silently present that
 * fallback as a recommendation, so production routes through this wrapper.
 */
export const realPubCrawlPlanner: PlannerDefinition = {
  ...pubCrawlPlanner,
  async plan(request): Promise<PlannerResult> {
    if (!request.groupLocation) {
      throw new Error('Set a planning location first so Nexus can find real pubs near your group.')
    }

    const result = await pubCrawlPlanner.plan(request)

    if (result.dataSource !== 'real') {
      throw new Error('Nexus could not find enough real pubs at this location right now. Try a wider planning radius or a different location.')
    }

    return enrichWithGooglePlaces(result, request.groupLocation)
  },
}
