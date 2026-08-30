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

interface BrowserVenueResponse {
  venues?: Array<{
    name?: string
    rating?: number | null
    rating_count?: number | null
    open_now?: boolean | null
    address?: string | null
    maps_url?: string | null
    price_level?: string | null
    distance_km?: number | null
    lat?: number
    lng?: number
    photo_url?: string | null
  }>
  error?: string
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

function browserPriceLevel(value?: string | null): PriceLevel {
  switch (value) {
    case 'PRICE_LEVEL_FREE':
    case 'PRICE_LEVEL_INEXPENSIVE': return 1
    case 'PRICE_LEVEL_MODERATE': return 2
    case 'PRICE_LEVEL_EXPENSIVE': return 3
    case 'PRICE_LEVEL_VERY_EXPENSIVE': return 4
    default: return 2
  }
}

function mapBrowserVenue(
  activityId: string,
  venue: NonNullable<BrowserVenueResponse['venues']>[number],
  index: number,
  location: { lat: number; lng: number },
): PlannerVenue | null {
  const name = venue.name?.trim()
  const lat = venue.lat
  const lng = venue.lng
  if (!name || lat == null || lng == null) return null
  if (!hasValidProviderLocation({ name, lat, lng }, location, 20000)) return null

  const openNow = venue.open_now ?? null
  const rating = venue.rating ?? 0
  const ratingCount = venue.rating_count ?? 0
  const distance = venue.distance_km ?? venueDistanceKm(location, { lat, lng })

  return {
    id: `google-proxy-${activityId}-${index}-${lat}-${lng}`,
    name,
    lat,
    lng,
    rating,
    ratingKnown: rating > 0,
    priceLevel: browserPriceLevel(venue.price_level),
    priceLevelKnown: !!venue.price_level,
    estimatedCostPerPerson: 0,
    atmosphere: [],
    features: [],
    openingTime: '00:00',
    closingTime: '23:59',
    openingHoursKnown: openNow !== null,
    capacity: 'medium',
    tags: openNow === true ? ['open-now'] : [],
    distanceFromCentre: Math.round((distance ?? 0) * 100) / 100,
    mapsUrl: venue.maps_url ?? null,
    address: venue.address ?? null,
    website: null,
    isRealData: true,
    photoUrl: venue.photo_url ?? null,
    ratingCount,
  } as PlannerVenue
}

async function searchBrowserProxyVenues(
  activityId: string,
  radiusMetres: number,
  location: { lat: number; lng: number },
): Promise<PlannerVenue[]> {
  const params = new URLSearchParams({
    activity: activityId,
    vibe: 'activity',
    lat: String(location.lat),
    lng: String(location.lng),
    radius: String(radiusMetres),
    limit: '12',
  })

  const res = await fetch(`/nx/places?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  const rawBody = await res.text()
  let data: BrowserVenueResponse = {}
  try {
    data = JSON.parse(rawBody) as BrowserVenueResponse
  } catch {
    throw new Error(`Venue service returned non-JSON (${res.status}).`)
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Venue service returned HTTP ${res.status}.`)
  }

  return (data.venues ?? [])
    .map((venue, index) => mapBrowserVenue(activityId, venue, index, location))
    .filter((venue): venue is PlannerVenue => venue !== null)
    .slice(0, 30)
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
    .filter((venue) => venue !== null)
    .filter((venue) => hasValidProviderLocation(venue, location, radiusMetres))
    .sort((a, b) => {
      const ratingA = a.rating * Math.log10(((a as PlannerVenue & { ratingCount?: number }).ratingCount ?? 0) + 10)
      const ratingB = b.rating * Math.log10(((b as PlannerVenue & { ratingCount?: number }).ratingCount ?? 0) + 10)
      return (ratingB - ratingA) || (a.distanceFromCentre - b.distanceFromCentre)
    })
}

/**
 * Real venue provider for single-venue activities.
 *
 * Browser calls MUST go through the same-origin /nx/places proxy. The Google
 * API key is server-only, so reading process.env.GOOGLE_PLACES_API_KEY from a
 * client component always produced an empty result and then an unreliable OSM
 * fallback. That was the root cause of the planner's "Failed to fetch" state.
 * Server-side callers can continue to use Google directly.
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

    if (typeof window !== 'undefined') {
      return searchBrowserProxyVenues(activityId, this.radiusMetres, location)
    }

    try {
      const googleVenues = await searchGoogleVenues(activityId, this.radiusMetres, location)
      if (googleVenues.length > 0) return googleVenues.slice(0, 30)
    } catch (error) {
      console.warn(`[${activityId}] Google Places failed; falling back to OSM:`, error)
    }

    return this.osm.getVenues(activityId, location)
  }
}
