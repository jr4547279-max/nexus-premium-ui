const GLOBAL_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
]
const EUROPE_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://ovp.dresel.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
const CACHE_TTL_MS = 10 * 60_000
const STALE_TTL_MS = 24 * 60 * 60_000
const MAX_CACHE_ENTRIES = 200
const MAX_ENDPOINTS = 3
const MAX_RESPONSE_BYTES = 4_000_000
const MIN_REQUEST_INTERVAL_MS = 1_000
const RATE_LIMIT_BACKOFF_MS = 30_000
const MAX_BACKOFF_MS = 60 * 60_000
const cache = new Map()
const inFlight = new Map()
const endpointBackoff = new Map()
let requestQueue = Promise.resolve()
let nextRequestAt = 0

export function isValidSearchLocation(location) {
  return Boolean(location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && location.lat >= -90 && location.lat <= 90
    && location.lng >= -180 && location.lng <= 180)
}

/**
 * The dresel instance serves a Europe extract only, so never use it for
 * locations outside a conservative continental-Europe bounding area.
 */
export function getOverpassEndpoints(location) {
  const isEurope = isValidSearchLocation(location)
    && location.lat >= 34 && location.lat <= 72
    && location.lng >= -12 && location.lng <= 35
  return isEurope ? EUROPE_ENDPOINTS : GLOBAL_ENDPOINTS
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
  // `data=` form encoding is accepted by the public interpreter endpoints.
  return `[out:json][timeout:8];\n(\n  ${parts.join('\n  ')}\n);\nout center tags 100;`
}

export function clearOverpassCache() {
  cache.clear()
  inFlight.clear()
  endpointBackoff.clear()
  requestQueue = Promise.resolve()
  nextRequestAt = 0
}

function remember(query, elements, cacheTtlMs = CACHE_TTL_MS, staleTtlMs = STALE_TTL_MS) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value)
  const now = Date.now()
  cache.set(query, { elements, cachedAt: now, expiresAt: now + cacheTtlMs, staleUntil: now + staleTtlMs })
}

function safeEndpointLabel(endpoint) {
  try {
    const url = new URL(endpoint)
    return `${url.origin}${url.pathname}`
  } catch {
    return 'invalid-endpoint'
  }
}

function failureCategory(status, error, timedOut) {
  if (timedOut) return 'timeout'
  if (status === 521) return 'origin_unavailable'
  if (status === 429 || status === 406) return 'rate_limited_or_policy_rejected'
  if (status != null) return status >= 500 ? 'upstream_server_error' : 'upstream_http_error'
  return error === 'invalid_response' ? 'invalid_response' : 'network_error'
}

function writeDiagnostic(logger, { endpoint, status = null, elapsedMs, category }) {
  // Deliberately excludes the query, coordinates, response body, headers and credentials.
  const record = {
    event: 'nexus_overpass_attempt_failed',
    endpoint: safeEndpointLabel(endpoint),
    status,
    elapsedMs,
    category,
  }
  try {
    logger(record)
  } catch {
    // Diagnostics must not change the venue search result.
  }
}

function parseRetryAfter(response, now = Date.now()) {
  const raw = response.headers.get('retry-after')
  if (!raw) return RATE_LIMIT_BACKOFF_MS
  const seconds = Number(raw)
  const until = Number.isFinite(seconds) ? now + seconds * 1_000 : Date.parse(raw)
  if (!Number.isFinite(until)) return RATE_LIMIT_BACKOFF_MS
  return Math.min(MAX_BACKOFF_MS, Math.max(RATE_LIMIT_BACKOFF_MS, until - now))
}

async function withRequestSlot(task, minIntervalMs) {
  const previous = requestQueue
  let release
  requestQueue = new Promise((resolve) => { release = resolve })
  await previous
  try {
    const waitMs = Math.max(0, nextRequestAt - Date.now())
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs))
    nextRequestAt = Date.now() + minIntervalMs
    return await task()
  } finally {
    release()
  }
}

async function requestEndpoint(endpoint, query, options) {
  const {
    fetchImpl,
    timeoutMs,
    logger,
    minIntervalMs,
  } = options
  const blockedUntil = endpointBackoff.get(endpoint) ?? 0
  if (blockedUntil > Date.now()) {
    writeDiagnostic(logger, { endpoint, status: null, elapsedMs: 0, category: 'endpoint_backoff' })
    return { kind: 'skipped', retryAfterMs: blockedUntil - Date.now() }
  }
  return withRequestSlot(async () => {
    const now = Date.now()
    const backoffUntil = endpointBackoff.get(endpoint) ?? 0
    if (backoffUntil > now) {
      writeDiagnostic(logger, { endpoint, status: null, elapsedMs: 0, category: 'endpoint_backoff' })
      return { kind: 'skipped', retryAfterMs: backoffUntil - now }
    }

    const controller = new AbortController()
    const startedAt = Date.now()
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
      const elapsedMs = Date.now() - startedAt
      if (!response.ok) {
        const category = failureCategory(response.status)
        writeDiagnostic(logger, { endpoint, status: response.status, elapsedMs, category })
        const retryAfterMs = response.status === 429 || response.status === 406
          ? parseRetryAfter(response)
          : undefined
        if (retryAfterMs) endpointBackoff.set(endpoint, Date.now() + retryAfterMs)
        return { kind: 'failure', status: response.status, category, retryAfterMs }
      }

      const body = await response.text()
      if (body.length > MAX_RESPONSE_BYTES) {
        writeDiagnostic(logger, { endpoint, status: response.status, elapsedMs: Date.now() - startedAt, category: 'response_too_large' })
        return { kind: 'failure', status: response.status, category: 'invalid_response' }
      }
      let data
      try {
        data = JSON.parse(body)
      } catch {
        writeDiagnostic(logger, { endpoint, status: response.status, elapsedMs: Date.now() - startedAt, category: 'invalid_response' })
        return { kind: 'failure', status: response.status, category: 'invalid_response' }
      }
      if (!data || !Array.isArray(data.elements)) {
        writeDiagnostic(logger, { endpoint, status: response.status, elapsedMs: Date.now() - startedAt, category: 'invalid_response' })
        return { kind: 'failure', status: response.status, category: 'invalid_response' }
      }
      return { kind: 'success', elements: data.elements }
    } catch (error) {
      const timedOut = controller.signal.aborted || error?.name === 'AbortError'
      const category = failureCategory(null, 'network_error', timedOut)
      writeDiagnostic(logger, { endpoint, status: null, elapsedMs: Date.now() - startedAt, category })
      return { kind: 'failure', status: null, category }
    } finally {
      clearTimeout(timeout)
    }
  }, minIntervalMs)
}

/**
 * Uses one request per endpoint at most, shares identical in-flight work, and
 * serializes this isolate's outbound calls. 429/406 responses pause that
 * endpoint for at least 30s; 521/timeouts move directly to a different server.
 */
export async function fetchOverpassElements(query, options = {}) {
  if (!query) return { elements: [], cached: false, stale: false }
  const endpoints = (options.endpoints ?? GLOBAL_ENDPOINTS).filter((endpoint) => {
    try { return new URL(endpoint).protocol === 'https:' } catch { return false }
  }).slice(0, options.maxEndpoints ?? MAX_ENDPOINTS)
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 8_000
  const logger = options.logger ?? ((record) => console.warn(JSON.stringify(record)))
  const minIntervalMs = options.minIntervalMs ?? MIN_REQUEST_INTERVAL_MS
  const cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS
  const staleTtlMs = options.staleTtlMs ?? STALE_TTL_MS
  const now = Date.now()
  const cached = cache.get(query)
  if (cached && cached.expiresAt > now) return { elements: cached.elements, cached: true, stale: false }
  if (inFlight.has(query)) return inFlight.get(query)

  const request = (async () => {
    const failures = []
    let retryAfterMs
    for (const endpoint of endpoints) {
      const result = await requestEndpoint(endpoint, query, { fetchImpl, timeoutMs, logger, minIntervalMs })
      if (result.kind === 'success') {
        remember(query, result.elements, cacheTtlMs, staleTtlMs)
        return { elements: result.elements, cached: false, stale: false }
      }
      if (result.kind === 'skipped') {
        failures.push({ category: 'endpoint_backoff', status: null })
        retryAfterMs = Math.max(retryAfterMs ?? 0, result.retryAfterMs)
        continue
      }
      failures.push({ category: result.category, status: result.status })
      if (result.retryAfterMs) {
        retryAfterMs = Math.max(retryAfterMs ?? 0, result.retryAfterMs)
        // OSM policy asks clients to pause after 406/429. Do not fan out the
        // same request to another public service during that cooldown.
        break
      }
    }

    const stale = cache.get(query)
    if (stale && stale.staleUntil > Date.now()) {
      return { elements: stale.elements, cached: true, stale: true }
    }
    const lastFailure = failures.at(-1) ?? { category: 'provider_unavailable', status: null }
    const status = lastFailure.status
    const message = status === 521
      ? 'OpenStreetMap venue search is temporarily unavailable (HTTP 521). Please try again shortly.'
      : status === 406 || status === 429
        ? 'OpenStreetMap venue search is rate-limited or temporarily refusing requests. Please wait before trying again.'
        : 'OpenStreetMap venue search is temporarily unavailable. Please try again shortly.'
    const error = new Error(message)
    error.name = 'OverpassProviderError'
    error.category = lastFailure.category
    error.status = status ?? null
    error.retryAfterSeconds = retryAfterMs ? Math.ceil(retryAfterMs / 1_000) : undefined
    throw error
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
