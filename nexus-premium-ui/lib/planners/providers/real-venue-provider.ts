import type { PlannerVenue, PriceLevel } from '../types'

interface NexusVenue {
  id?: string
  name: string
  rating: number | null
  rating_count: number | null
  open_now: boolean | null
  address: string | null
  category: string | null
  maps_url: string | null
  price_level: string | null
  distance_km: number | null
  lat: number | null
  lng: number | null
  photo_url: string | null
}

interface NexusPlacesResponse {
  venues?: NexusVenue[]
  error?: string
  provider?: string
}

function priceLevel(value?: string | null): PriceLevel {
  switch (value) {
    case 'PRICE_LEVEL_FREE':
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 1
    case 'PRICE_LEVEL_MODERATE':
      return 2
    case 'PRICE_LEVEL_EXPENSIVE':
      return 3
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 4
    default:
      return 2
  }
}

function mapVenues(activityId: string, venues: NexusVenue[]): PlannerVenue[] {
  return venues
    .filter((venue) => venue.name && venue.lat != null && venue.lng != null)
    .map((venue, index) => ({
      id: venue.id ?? `nexus-${activityId}-${index}-${venue.lat}-${venue.lng}`,
      name: venue.name,
      lat: venue.lat as number,
      lng: venue.lng as number,
      rating: venue.rating ?? 0,
      ratingKnown: venue.rating != null,
      ratingCount: venue.rating_count ?? 0,
      priceLevel: priceLevel(venue.price_level),
      priceLevelKnown: !!venue.price_level,
      estimatedCostPerPerson: 0,
      atmosphere: [],
      features: [],
      openingTime: '00:00',
      closingTime: '23:59',
      openingHoursKnown: venue.open_now !== null,
      capacity: 'medium',
      tags: [venue.category ?? activityId, ...(venue.open_now === true ? ['open-now'] : [])],
      distanceFromCentre: venue.distance_km ?? 0,
      mapsUrl: venue.maps_url,
      address: venue.address,
      website: null,
      isRealData: true,
      photoUrl: venue.photo_url,
    } as PlannerVenue))
}

async function requestJson(url: string): Promise<{ response: Response; data: NexusPlacesResponse | null }> {
  const response = await fetch(url)
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    await response.text().catch(() => '')
    return { response, data: null }
  }
  return { response, data: (await response.json()) as NexusPlacesResponse }
}

/**
 * Single-venue planners run from the client-side Group Detail component.
 * They must NEVER call Google Places directly or read the private
 * GOOGLE_PLACES_API_KEY. The shared /nx/places route is the provider boundary.
 *
 * Importantly, this provider uses the same two-stage provider chain as Nearby
 * Fits: Google Places first, then the server-side OSM route if Google is
 * unavailable or too sparse. This prevents the planner from failing while the
 * Nearby Fits section continues working.
 */
async function searchViaNexusPlaces(
  activityId: string,
  radiusMetres: number,
  location: { lat: number; lng: number },
): Promise<PlannerVenue[]> {
  const qs = new URLSearchParams({
    vibe: activityId === 'pub-crawl' ? 'pub' : 'activity',
    activity: activityId,
    lat: String(location.lat),
    lng: String(location.lng),
    radius: String(radiusMetres),
    limit: '12',
  })

  const primary = await requestJson(`/nx/places?${qs.toString()}`)
  const primaryVenues = primary.response.ok && primary.data?.venues ? primary.data.venues : []

  // Keep Google's richer data when it gives us enough results.
  if (primary.response.ok && primary.data && primaryVenues.length >= 1) {
    return mapVenues(activityId, primaryVenues)
  }

  // Google can legitimately be unavailable because of billing, API quota,
  // categorisation, or a transient upstream failure. Do not turn that into a
  // fatal planner error: use the real OSM fallback with the SAME activity id.
  const osm = await requestJson(`/nx/places/osm?${qs.toString()}`)
  if (osm.response.ok && osm.data?.venues?.length) {
    return mapVenues(activityId, osm.data.venues)
  }

  if (primaryVenues.length) return mapVenues(activityId, primaryVenues)

  const primaryError = primary.data?.error
  const osmError = osm.data?.error
  throw new Error(
    osmError ?? primaryError ?? `Venue search failed (Google HTTP ${primary.response.status}, OSM HTTP ${osm.response.status})`,
  )
}

export class RealVenueProvider {
  private readonly radiusMetres: number

  constructor(radiusMetres = 1500) {
    this.radiusMetres = radiusMetres
  }

  async getVenues(
    activityId: string,
    location?: { lat: number; lng: number },
  ): Promise<PlannerVenue[]> {
    if (!location) return []
    return searchViaNexusPlaces(activityId, this.radiusMetres, location)
  }
}
