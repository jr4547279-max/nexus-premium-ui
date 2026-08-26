import type { PlannerVenue, VenueProvider, PriceLevel } from '../types'
import { getOsmTagsForActivity, type OsmTagSet } from './venue-provider'

// This provider keeps the existing OSM fallback, but pub-crawl now prefers the
// same Google Places (New) source used by /nx/places. That gives the crawl real
// pub names, ratings, review counts and photos instead of dropping to demo data.

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function parseOsmHours(oh: string | undefined): { open: string; close: string } | null {
  if (!oh) return null
  if (/24\/7/.test(oh)) return { open: '00:00', close: '23:59' }
  const m = oh.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/)
  if (!m) return null
  const pad = (t: string) => t.padStart(5, '0')
  return { open: pad(m[1]!), close: pad(m[2]!) }
}

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'
const REQUEST_TIMEOUT_MS = 15_000

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface OverpassResponse { elements: OverpassElement[] }

function buildQuery(tagSets: OsmTagSet[], lat: number, lng: number, radius: number): string {
  const parts = tagSets.flatMap(({ key, value }) => [
    `node["${key}"="${value}"](around:${radius},${lat},${lng});`,
    `way["${key}"="${value}"](around:${radius},${lat},${lng});`,
  ])
  return `[out:json][timeout:15];\n(\n  ${parts.join('\n  ')}\n);\nout center body;`
}

interface GooglePlace {
  displayName?: { text?: string }
  rating?: number
  userRatingCount?: number
  formattedAddress?: string
  googleMapsUri?: string
  regularOpeningHours?: { openNow?: boolean }
  primaryTypeDisplayName?: { text?: string }
  types?: string[]
  location?: { latitude?: number; longitude?: number }
  priceLevel?: string
  photos?: Array<{ name?: string }>
}

interface GooglePlacesResponse {
  places?: GooglePlace[]
  error?: { message?: string; status?: string }
}

function googlePriceLevel(value?: string): PriceLevel {
  switch (value) {
    case 'PRICE_LEVEL_FREE': return 1
    case 'PRICE_LEVEL_INEXPENSIVE': return 1
    case 'PRICE_LEVEL_MODERATE': return 2
    case 'PRICE_LEVEL_EXPENSIVE': return 3
    case 'PRICE_LEVEL_VERY_EXPENSIVE': return 4
    default: return 2
  }
}

async function getGooglePubs(
  radiusMetres: number,
  location: { lat: number; lng: number },
): Promise<PlannerVenue[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return []

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
        'places.primaryTypeDisplayName',
        'places.types',
        'places.location',
        'places.priceLevel',
        'places.photos',
      ].join(','),
    },
    body: JSON.stringify({
      textQuery: 'pubs',
      maxResultCount: 12,
      locationBias: {
        circle: {
          center: { latitude: location.lat, longitude: location.lng },
          radius,
        },
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google Places returned HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

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

      const tags = [
        'pub',
        ...(place.types ?? []).filter((tag) => ['bar', 'night_club', 'beer_garden', 'gastropub'].includes(tag)),
      ]

      return {
        id: `google-pub-${index}-${lat}-${lng}`,
        name,
        lat,
        lng,
        rating,
        ratingKnown: rating > 0,
        priceLevel: googlePriceLevel(place.priceLevel),
        priceLevelKnown: !!place.priceLevel,
        estimatedCostPerPerson: 0,
        atmosphere: ['social', 'welcoming'],
        features: [],
        // Google Places Text Search exposes openNow here, not the full weekly
        // opening-hours intervals. Keep the venue schedulable without inventing
        // opening/closing times, while retaining the live open/closed signal in tags.
        openingTime: '00:00',
        closingTime: '23:59',
        openingHoursKnown: openNow !== null,
        capacity: 'medium',
        tags: openNow === true ? [...tags, 'open-now'] : tags,
        distanceFromCentre: Math.round(haversineKm(location.lat, location.lng, lat, lng) * 100) / 100,
        mapsUrl: place.googleMapsUri ?? null,
        address: place.formattedAddress ?? null,
        website: null,
        isRealData: true,
        // PubCrawlPlanV2 already supports this optional runtime field.
        photoUrl,
        ratingCount,
      } as PlannerVenue
    })
    .filter((venue): venue is PlannerVenue => venue !== null)
    .sort((a, b) => {
      const ratingA = a.rating * Math.log10((a as PlannerVenue & { ratingCount?: number }).ratingCount ?? 0 + 10)
      const ratingB = b.rating * Math.log10((b as PlannerVenue & { ratingCount?: number }).ratingCount ?? 0 + 10)
      return (ratingB - ratingA) || (a.distanceFromCentre - b.distanceFromCentre)
    })
}

export class OpenStreetMapVenueProvider implements VenueProvider {
  private readonly radiusMetres: number

  constructor(radiusMetres = 1500) {
    this.radiusMetres = radiusMetres
  }

  async getVenues(
    activityId: string,
    location?: { lat: number; lng: number },
  ): Promise<PlannerVenue[]> {
    if (!location) return []

    // Pub Crawl: use the live Google Places source first. This is the same
    // provider already wired into Nearby Fits, so we don't fall back to fake
    ///demo venues just because OSM is sparse.
    if (activityId === 'pub-crawl') {
      try {
        const googleVenues = await getGooglePubs(this.radiusMetres, location)
        if (googleVenues.length >= 2) return googleVenues.slice(0, 30)
      } catch (error) {
        console.warn('[pub-crawl] Google Places failed; falling back to OSM:', error)
      }
    }

    const { lat, lng } = location
    const tagSets = getOsmTagsForActivity(activityId)
    const query = buildQuery(tagSets, lat, lng, this.radiusMetres)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let data: OverpassResponse
    try {
      const res = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`Overpass API returned HTTP ${res.status}`)
      data = (await res.json()) as OverpassResponse
    } finally {
      clearTimeout(timeout)
    }

    const seen = new Set<string>()
    const venues: PlannerVenue[] = []

    for (const el of data.elements) {
      const tags = el.tags ?? {}
      const name = tags['name'] ?? tags['name:en'] ?? tags['brand'] ?? null
      if (!name) continue

      const elLat = el.type === 'node' ? el.lat! : el.center?.lat
      const elLng = el.type === 'node' ? el.lon! : el.center?.lon
      if (elLat == null || elLng == null) continue

      const dedupeKey = `${name}|${Math.round(elLat * 1000)}|${Math.round(elLng * 1000)}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const hours = parseOsmHours(tags['opening_hours'])
      const dist = haversineKm(lat, lng, elLat, elLng)
      const addressParts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean)
      const address = addressParts.length > 0 ? addressParts.join(' ') : (tags['addr:full'] ?? null)
      const osmMapUrl = `https://www.openstreetmap.org/?mlat=${elLat}&mlon=${elLng}#map=18/${elLat}/${elLng}`
      const TAG_KEYS = ['cuisine', 'sport', 'music', 'amenity', 'leisure', 'genre']
      const venueTags = TAG_KEYS.map((k) => tags[k]).filter((v): v is string => !!v)

      venues.push({
        id: `osm-${el.type}-${el.id}`,
        name,
        lat: elLat,
        lng: elLng,
        rating: 0,
        ratingKnown: false,
        priceLevel: 2,
        priceLevelKnown: false,
        estimatedCostPerPerson: 0,
        atmosphere: [],
        features: [],
        openingTime: hours?.open ?? '09:00',
        closingTime: hours?.close ?? '23:00',
        openingHoursKnown: hours !== null,
        capacity: 'medium',
        tags: venueTags,
        distanceFromCentre: Math.round(dist * 100) / 100,
        mapsUrl: osmMapUrl,
        address,
        website: tags['website'] ?? tags['contact:website'] ?? tags['url'] ?? null,
        isRealData: true,
      })
    }

    return venues.sort((a, b) => a.distanceFromCentre - b.distanceFromCentre).slice(0, 30)
  }
}
