const DEFAULT_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
]
const CACHE_TTL_MS = 10 * 60_000
const STALE_TTL_MS = 24 * 60 * 60_000
const MAX_CACHE_ENTRIES = 200
const cache = new Map()
const inFlight = new Map()

export function isValidSearchLocation(location) {
  return Boolean(location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && location.lat >= -90 && location.lat <= 90
    && location.lng >= -180 && location.lng <= 180)
}

export function buildOverpassQuery(tagSets, location, radiusMetres) {
  if (!isValidSearchLocation(location)) throw new TypeError('A valid search location is required.')
  if (!Number.isFinite(radiusMetres) || radiusMetres < 100 || radiusMetres > 20_000) {
    throw new RangeError('Search radius must be between 100 and 20,000 metres.')
  }
  const safeTags = tagSets.filter(({ key, value }) => /^[a-z0-9_:]+$/.test(key) && /^[a-z0-9_:.-]+$/.test(value))
  if (!safeTags.length) return ''
  const parts = safeTags.flatMap(({ key, value }) => [
    `node["${key}"="${value}"](around:${Math.round(radiusMetres)},${location.lat},${location.lng});`,
    `way["${key}"="${value}"](around:${Math.round(radiusMetres)},${location.lat},${location.lng});`,
    `relation["${key}"="${value}"](around:${Math.round(radiusMetres)},${location.lat},${location.lng});`,
  ])
  return `[out:json][timeout:12];\n(\n  ${parts.join('\n  ')}\n);\nout center tags 100;`
}

export function clearOverpassCache() {
  cache.clear()
  inFlight.clear()
}

function remember(query, elements) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value)
  cache.set(query, { elements, expiresAt: Date.now() + CACHE_TTL_MS, staleUntil: Date.now() + STALE_TTL_MS })
}

/** One request per endpoint, with a two-endpoint cap and shared in-flight/cache reuse. */
export async function fetchOverpassElements(query, options = {}) {
  if (!query) return { elements: [], cached: false }
  const endpoints = (options.endpoints ?? DEFAULT_ENDPOINTS).slice(0, 2)
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 12_000
  const now = Date.now()
  const cached = cache.get(query)
  if (cached && cached.expiresAt > now) return { elements: cached.elements, cached: true }
  if (inFlight.has(query)) return inFlight.get(query)

  const request = (async () => {
    let lastError = null
    for (const endpoint of endpoints) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            'User-Agent': 'NexusSocialPlanner/1.0 (+https://nexus-web-dev.jayrussell99999.workers.dev)',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        })
        if (!response.ok) {
          const error = new Error(`OpenStreetMap venue search returned HTTP ${response.status}.`)
          error.status = response.status
          lastError = error
          // Do not retry the same server (especially for 429s); use only the
          // one configured alternate public endpoint, if available.
          continue
        }
        const data = await response.json()
        if (!data || !Array.isArray(data.elements)) throw new Error('OpenStreetMap venue search returned an invalid response.')
        remember(query, data.elements)
        return { elements: data.elements, cached: false }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('OpenStreetMap venue search failed.')
      } finally {
        clearTimeout(timeout)
      }
    }
    const stale = cache.get(query)
    if (stale && stale.staleUntil > Date.now()) return { elements: stale.elements, cached: true, stale: true }
    throw lastError ?? new Error('OpenStreetMap venue search is temporarily unavailable.')
  })().finally(() => inFlight.delete(query))

  inFlight.set(query, request)
  return request
}

export function normalizeOverpassElements(elements, location, radiusMetres) {
  if (!isValidSearchLocation(location)) throw new TypeError('A valid search location is required.')
  const seen = new Set()
  const result = []
  for (const element of elements) {
    const tags = element.tags ?? {}
    const name = (tags.name ?? tags['name:en'] ?? tags.brand ?? '').trim()
    const lat = element.type === 'node' ? element.lat : element.center?.lat
    const lng = element.type === 'node' ? element.lon : element.center?.lon
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue
    const distanceKm = distance(location, { lat, lng })
    if (distanceKm > radiusMetres / 1000 + 0.05) continue
    const key = `${name.toLowerCase()}|${Math.round(lat * 10000)}|${Math.round(lng * 10000)}`
    if (seen.has(key)) continue
    seen.add(key)
    const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(' ') || tags['addr:full'] || null
    result.push({
      id: `osm-${element.type}-${element.id}`,
      name,
      lat,
      lng,
      distanceKm: Math.round(distanceKm * 100) / 100,
      address,
      category: tags.amenity ?? tags.leisure ?? tags.sport ?? tags.shop ?? null,
      website: tags.website ?? tags['contact:website'] ?? tags.url ?? null,
      openingHours: tags.opening_hours ?? null,
      mapUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`,
      tags,
    })
  }
  return result.sort((a, b) => a.distanceKm - b.distanceKm)
}

function distance(a, b) {
  const radians = (n) => n * Math.PI / 180
  const dLat = radians(b.lat - a.lat)
  const dLng = radians(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}
