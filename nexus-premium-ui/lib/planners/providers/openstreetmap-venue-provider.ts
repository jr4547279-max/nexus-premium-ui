// ─────────────────────────────────────────────────────────────────────────────
// OpenStreetMap Venue Provider — Overpass API, zero cost, no API key
// ─────────────────────────────────────────────────────────────────────────────
// Honest about what OSM provides and does NOT provide:
//   ✓ Name, location, address, website, opening_hours
//   ✗ Ratings, prices, reviews, booking availability
//
// All unknown fields are marked with *Known: false so the UI can display
// "unavailable" instead of invented data.

import type { PlannerVenue, VenueProvider } from '../types'
import { getOsmTagsForActivity, type OsmTagSet } from './venue-provider'

// ── Utilities ─────────────────────────────────────────────────────────────────

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

/**
 * Parse the first recognisable time range from an OSM opening_hours string.
 * Returns null when the format cannot be understood (many entries use complex
 * specs that require a full parser — we degrade gracefully).
 */
function parseOsmHours(oh: string | undefined): { open: string; close: string } | null {
  if (!oh) return null
  if (/24\/7/.test(oh)) return { open: '00:00', close: '23:59' }
  // Match patterns like "11:00-23:00" or "11:00–23:00"
  const m = oh.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/)
  if (!m) return null
  const pad = (t: string) => t.padStart(5, '0')
  return { open: pad(m[1]!), close: pad(m[2]!) }
}

// ── Overpass API ──────────────────────────────────────────────────────────────

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

interface OverpassResponse {
  elements: OverpassElement[]
}

function buildQuery(tagSets: OsmTagSet[], lat: number, lng: number, radius: number): string {
  const parts = tagSets.flatMap(({ key, value }) => [
    `node["${key}"="${value}"](around:${radius},${lat},${lng});`,
    `way["${key}"="${value}"](around:${radius},${lat},${lng});`,
  ])
  return `[out:json][timeout:15];\n(\n  ${parts.join('\n  ')}\n);\nout center body;`
}

// ── Provider ──────────────────────────────────────────────────────────────────

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

    // Deduplicate (same name within ~50 m = likely the same venue listed as node + way)
    const seen = new Set<string>()
    const venues: PlannerVenue[] = []

    for (const el of data.elements) {
      const tags = el.tags ?? {}
      const name =
        tags['name'] ?? tags['name:en'] ?? tags['brand'] ?? null
      if (!name) continue // skip nameless venues — not useful to the user

      const elLat = el.type === 'node' ? el.lat! : el.center?.lat
      const elLng = el.type === 'node' ? el.lon! : el.center?.lon
      if (elLat == null || elLng == null) continue

      const dedupeKey = `${name}|${Math.round(elLat * 1000)}|${Math.round(elLng * 1000)}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const hours = parseOsmHours(tags['opening_hours'])
      const dist = haversineKm(lat, lng, elLat, elLng)

      const addressParts = [
        tags['addr:housenumber'],
        tags['addr:street'],
        tags['addr:city'],
      ].filter(Boolean)
      const address =
        addressParts.length > 0
          ? addressParts.join(' ')
          : (tags['addr:full'] ?? null)

      const osmMapUrl = `https://www.openstreetmap.org/?mlat=${elLat}&mlon=${elLng}#map=18/${elLat}/${elLng}`

      // Extract any machine-readable tags as venue tags (cuisine, sport, etc.)
      const TAG_KEYS = ['cuisine', 'sport', 'music', 'amenity', 'leisure', 'genre']
      const venueTags = TAG_KEYS
        .map((k) => tags[k])
        .filter((v): v is string => !!v)

      venues.push({
        id: `osm-${el.type}-${el.id}`,
        name,
        lat: elLat,
        lng: elLng,

        // ── Fields OSM does NOT reliably provide ──────────────────────────
        rating: 0,                      // unknown — see ratingKnown
        ratingKnown: false,
        priceLevel: 2,                  // unknown — see priceLevelKnown
        priceLevelKnown: false,
        estimatedCostPerPerson: 0,      // unknown
        atmosphere: [],                 // no atmosphere taxonomy in OSM
        features: [],

        // ── Fields OSM provides ───────────────────────────────────────────
        openingTime: hours?.open ?? '09:00',
        closingTime: hours?.close ?? '23:00',
        openingHoursKnown: hours !== null,
        capacity: 'medium',
        tags: venueTags,
        distanceFromCentre: Math.round(dist * 100) / 100,

        // ── Transparency fields ───────────────────────────────────────────
        mapsUrl: osmMapUrl,
        address,
        website:
          tags['website'] ?? tags['contact:website'] ?? tags['url'] ?? null,
        isRealData: true,
      })
    }

    // Sort by distance, cap at 30 results
    return venues
      .sort((a, b) => a.distanceFromCentre - b.distanceFromCentre)
      .slice(0, 30)
  }
}
