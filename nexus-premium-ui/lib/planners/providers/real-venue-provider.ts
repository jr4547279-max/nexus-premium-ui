import type { PlannerVenue, PriceLevel } from '../types'
import { hasValidProviderLocation, venueDistanceKm } from '../../venue-location'
import { OpenStreetMapVenueProvider } from './openstreetmap-venue-provider'

interface GooglePlace {
  displayName?: { text?: string }
  rating?: number
  userRatingCount?: number
  formattedAddress?: string
  googleMapsUri?: string
  regularOpeningHours?: { openNow?: boolean }
  location?: { latitude?: number; longitude?: number }
  priceLevel?: string
  photos?: Array<{ name?: string }>
}

interface GooglePlacesResponse {
  places?: GooglePlace[]
  error?: { message?: string; status?: string }
}

const GOOGLE_QUERIES: Record<string, string> = {
  gym: 'gyms',
  swimming: 'swimming pools',
  beach: 'beaches',
  picnic: 'parks and gardens with picnic areas',
  'cocktail-bar': 'cocktail bars',
  restaurant: 'restaurants',
  brunch: 'brunch restaurants',
  coffee: 'coffee shops',
  cinema: 'cinemas',
  bowling: 'bowling alleys',
  'live-music': 'live music venues',
  'board-games': 'board game cafes',
  'escape-room': 'escape rooms',
}

function googlePriceLevel(value?: string): PriceLevel {
  switch (value) {
    case 'PRICE_LEVEL_FREE':
    case 'PRICE_LEVEL_INEXPENSIVE': return 1
    case 'PRICE_LEVEL_MODERATE': return 2
    case 'PRICE_LEVEL_EXPENSIVE': return 3
    case 'PRICE_LEVEL_VERY_EXPENSIVE': return 4
    default: return 2
  }
}

async function searchGoogleVenues(
  activityId: string,
  radiusMetres: number,
  location: { lat: number; lng: number },
): Promise<PlannerVenue[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  const textQuery = GOOGLE_QUERIES[activityId]
  if (!key || !textQuery) return []

  const radius = Math.min(20000, Math.max(500, radiusMetres))
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': [
        'places.displayName',
        'places.rating',
        'places.userRatingCount',
        'places.formattedAddress',
        'places.googleMapsUri',
        'places.regularOpeningHours.openNow',
        'places.location',
        'places.priceLevel',
        'places.photos',
      ].join(','),
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: 12,
      locationBias: {
        circle: {
          center: { latitude: location.lat, longitude: location.lng },
          radius,
        },
      },
    }),
  })

  if (!res.ok) throw new Error(`Google Places returned HTTP ${res.status}`)

  const data = (await res.json()) as GooglePlacesResponse
  if (data.error) throw new Error(data.error.message ?? 'Google Places search failed')

  return (data.places ?? [])
    .map((place, index) => {
      const lat = place.location?.latitude
      const lng = place.location?.longitude
      const name = place.displayName?.text
      if (lat == null || lng == null || !name) return null

      const rating = place.rating ?? 0
      const ratingCount = place.userRatingCount ?? 0
      const openNow = place.regularOpeningHours?.openNow ?? null
      const photoName = place.photos?.[0]?.name
      const photoUrl = photoName
        ? `/nx/places/photo?name=${encodeURIComponent(photoName)}&w=800&h=500`
        : null

      return {
        id: `google-${activityId}-${index}-${lat}-${lng}`,
        name,
        lat,
        lng,
        rating,
        ratingKnown: rating > 0,
        priceLevel: googlePriceLevel(place.priceLevel),
        priceLevelKnown: !!place.priceLevel,
        estimatedCostPerPerson: 0,
        atmosphere: [],
        features: [],
        openingTime: '00:00',
        closingTime: '23:59',
        openingHoursKnown: openNow !== null,
        capacity: 'medium',
        tags: openNow === true ? ['open-now'] : [],
        distanceFromCentre: Math.round(venueDistanceKm(location, { lat, lng }) * 100) / 100,
        mapsUrl: place.googleMapsUri ?? null,
        address: place.formattedAddress ?? null,
        website: null,
        isRealData: true,
        photoUrl,
        ratingCount,
      } as PlannerVenue & { ratingCount: number; photoUrl: string | null }
    })
    .filter((venue): venue is PlannerVenue =>
      venue !== null && hasValidProviderLocation(venue, location, radius),
    )
    .sort((a, b) => {
      const ratingA = a.rating * Math.log10(((a as PlannerVenue & { ratingCount?: number }).ratingCount ?? 0) + 10)
      const ratingB = b.rating * Math.log10(((b as PlannerVenue & { ratingCount?: number }).ratingCount ?? 0) + 10)
      return (ratingB - ratingA) || (a.distanceFromCentre - b.distanceFromCentre)
    })
}

/**
 * Real venue provider for single-venue activities.
 * Google Places is the primary source; OpenStreetMap remains the no-key
 * fallback so a provider outage does not turn every planner into an error.
 */
export class RealVenueProvider {
  private readonly radiusMetres: number
  private readonly osm: OpenStreetMapVenueProvider

  constructor(radiusMetres = 1500) {
    this.radiusMetres = radiusMetres
    this.osm = new OpenStreetMapVenueProvider(radiusMetres)
  }

  async getVenues(
    activityId: string,
    location?: { lat: number; lng: number },
  ): Promise<PlannerVenue[]> {
    if (!location) return []

    try {
      const googleVenues = await searchGoogleVenues(activityId, this.radiusMetres, location)
      if (googleVenues.length > 0) return googleVenues.slice(0, 30)
    } catch (error) {
      console.warn(`[${activityId}] Google Places failed; falling back to OSM:`, error)
    }

    return this.osm.getVenues(activityId, location)
  }
}
