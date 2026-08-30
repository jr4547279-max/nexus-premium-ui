import type { PlannerVenue, VenueProvider, PriceLevel } from '../types'
import { getOsmTagsForActivity, type OsmTagSet } from './venue-provider'
import { getActivityVenueSearch } from '../../activities/venue-search'
import { hasValidProviderLocation, venueDistanceKm } from '../../venue-location'

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

interface OverpassResponse { elements?: OverpassElement[] }

function buildQuery(tagSets: OsmTagSet[], lat: number, lng: number, radius: number): string {
  const parts = tagSets.flatMap(({ key, value }) => [
    `node["${key}"="${value}"](around:${radius},${lat},${lng});`,
    `way["${key}"="${value}"](around:${radius},${lat},${lng});`,
  ])
  return `[out:json][timeout:15];\n(\n  ${parts.join('\n  ')}\n);\nout center body;`
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

export class OpenStreetMapVenueProvider implements VenueProvider {
  private readonly radiusMetres: number

  constructor(radiusMetres = 1500) {
    this.radiusMetres = radiusMetres
  }

  async getVenues(activityId: string, location?: { lat: number; lng: number }): Promise<PlannerVenue[]> {
    if (!location) return []

    const search = getActivityVenueSearch(activityId)
    if (!search) return []

    const { lat, lng } = location
    const tagSets = getOsmTagsForActivity(activityId)
    if (tagSets.length === 0) return []

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
      const raw: unknown = await res.json()
      if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { elements?: unknown }).elements)) {
        throw new Error('Overpass API returned a malformed venue payload.')
      }
      data = raw as OverpassResponse
    } finally {
      clearTimeout(timeout)
    }

    const requiredTags = new Set(search.requiredTags ?? [])
    const seen = new Set<string>()
    const venues: PlannerVenue[] = []

    for (const el of data.elements ?? []) {
      const tags = el.tags ?? {}
      if (requiredTags.size > 0) {
        const searchable = new Set(
          Object.entries(tags)
            .flatMap(([key, value]) => [key.toLowerCase(), value.toLowerCase()]),
        )
        if (![...requiredTags].some((tag) => searchable.has(tag))) continue
      }

      const name = tags.name ?? tags['name:en'] ?? tags.brand ?? null
      if (!name) continue

      const elLat = el.type === 'node' ? el.lat : el.center?.lat
      const elLng = el.type === 'node' ? el.lon : el.center?.lon
      if (!hasValidProviderLocation({ name, lat: elLat, lng: elLng }, location, this.radiusMetres)) continue

      const providerLat = elLat as number
      const providerLng = elLng as number
      const dedupeKey = `${name}|${Math.round(providerLat * 1000)}|${Math.round(providerLng * 1000)}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const hours = parseOsmHours(tags.opening_hours)
      const dist = venueDistanceKm(location, { lat: providerLat, lng: providerLng })
      const addressParts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean)
      const address = addressParts.length > 0 ? addressParts.join(' ') : (tags['addr:full'] ?? null)
      const osmMapUrl = `https://www.openstreetmap.org/?mlat=${providerLat}&mlon=${providerLng}#map=18/${providerLat}/${providerLng}`
      const venueTags = ['cuisine', 'sport', 'music', 'amenity', 'leisure', 'genre', 'diet:vegan']
        .map((key) => tags[key]).filter((value): value is string => Boolean(value))

      venues.push({
        id: `osm-${el.type}-${el.id}`,
        name,
        lat: providerLat,
        lng: providerLng,
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
        website: tags.website ?? tags['contact:website'] ?? tags.url ?? null,
        isRealData: true,
      })
    }

    return venues.sort((a, b) => a.distanceFromCentre - b.distanceFromCentre).slice(0, 30)
  }
}
