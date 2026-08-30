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

/**
 * Single-venue planners run from the client-side Group Detail component.
 * They must therefore NEVER call Google Places directly or read the private
 * GOOGLE_PLACES_API_KEY. The shared /nx/places route is the server-side
 * provider boundary and already owns Google + OpenStreetMap fallback logic.
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

  const response = await fetch(`/nx/places?${qs.toString()}`)
  const contentType = response.headers.get('content-type') ?? ''
  const data = contentType.includes('application/json')
    ? (await response.json()) as NexusPlacesResponse
    : null

  if (!response.ok) {
    throw new Error(data?.error ?? `Nexus Places returned HTTP ${response.status}`)
  }

  const venues = data?.venues ?? []
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

/**
 * Real venue provider for single-venue activities.
 * Uses the same server-side provider boundary as Nearby Fits, so planner
 * results and the venue browser cannot drift onto different data sources.
 */
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
