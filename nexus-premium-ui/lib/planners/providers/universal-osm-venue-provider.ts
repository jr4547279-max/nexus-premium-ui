import type { PlannerVenue } from '../types'

const ENDPOINT = 'https://overpass-api.de/api/interpreter'
const TAGS: Record<string, Array<[string, string]>> = {
  'pub-crawl': [['amenity', 'pub'], ['amenity', 'bar']],
  'cocktail-bar': [['amenity', 'bar'], ['amenity', 'pub']],
  restaurant: [['amenity', 'restaurant']],
  brunch: [['amenity', 'cafe'], ['amenity', 'restaurant']],
  coffee: [['amenity', 'cafe']],
  bowling: [['leisure', 'bowling_alley']],
  cinema: [['amenity', 'cinema']],
  'live-music': [['amenity', 'nightclub'], ['amenity', 'music_venue']],
  'board-games': [['amenity', 'pub'], ['leisure', 'amusement_arcade']],
  'escape-room': [['leisure', 'escape_game']],
  gym: [['leisure', 'fitness_centre'], ['leisure', 'sports_centre']],
  swimming: [['leisure', 'swimming_pool'], ['leisure', 'water_park'], ['sport', 'swimming']],
  beach: [['natural', 'beach']],
  picnic: [['leisure', 'park'], ['leisure', 'garden'], ['tourism', 'picnic_site']],
}

function dist(a: number, b: number, c: number, d: number) {
  const R = 6371, p = Math.PI / 180
  const x = (c - a) * p, y = (d - b) * p
  const q = Math.sin(x / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(y / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q))
}

function hours(value?: string) {
  if (!value) return null
  if (/24\/7/.test(value)) return { open: '00:00', close: '23:59' }
  const m = value.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/)
  return m ? { open: m[1]!.padStart(5, '0'), close: m[2]!.padStart(5, '0') } : null
}

export async function getUniversalOsmVenues(activityId: string, location: { lat: number; lng: number }, radiusMetres: number): Promise<PlannerVenue[]> {
  const tags = TAGS[activityId] ?? []
  if (!tags.length) return []
  const parts = tags.flatMap(([key, value]) => [
    `node["${key}"="${value}"](around:${radiusMetres},${location.lat},${location.lng});`,
    `way["${key}"="${value}"](around:${radiusMetres},${location.lat},${location.lng});`,
  ])
  const query = `[out:json][timeout:20];(${parts.join('')});out center body;`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 22000)
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}`, signal: controller.signal })
    if (!res.ok) throw new Error(`OpenStreetMap returned HTTP ${res.status}`)
    const data = await res.json() as { elements?: Array<{ type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }> }
    const seen = new Set<string>()
    const out: PlannerVenue[] = []
    for (const el of data.elements ?? []) {
      const t = el.tags ?? {}
      const name = t.name ?? t['name:en'] ?? t.brand
      const lat = el.type === 'node' ? el.lat : el.center?.lat
      const lng = el.type === 'node' ? el.lon : el.center?.lon
      if (!name || lat == null || lng == null) continue
      const key = `${name}|${Math.round(lat * 10000)}|${Math.round(lng * 10000)}`
      if (seen.has(key)) continue
      seen.add(key)
      const h = hours(t.opening_hours)
      const address = [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean).join(' ') || t['addr:full'] || null
      out.push({
        id: `osm-universal-${el.type}-${el.id}`, name, lat, lng,
        rating: 0, ratingKnown: false, priceLevel: 2, priceLevelKnown: false,
        estimatedCostPerPerson: 0, atmosphere: [], features: [], capacity: 'medium',
        openingTime: h?.open ?? '00:00', closingTime: h?.close ?? '23:59', openingHoursKnown: !!h,
        tags: [t.amenity, t.leisure, t.natural, t.tourism, t.sport].filter((v): v is string => !!v),
        distanceFromCentre: Math.round(dist(location.lat, location.lng, lat, lng) * 100) / 100,
        mapsUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`,
        address, website: t.website ?? t['contact:website'] ?? null, isRealData: true,
      })
    }
    return out.sort((a, b) => a.distanceFromCentre - b.distanceFromCentre).slice(0, 50)
  } finally {
    clearTimeout(timer)
  }
}
