// ─────────────────────────────────────────────────────────────────────────────
// Location Intelligence Resolver — SERVER-SIDE ONLY
// ─────────────────────────────────────────────────────────────────────────────
// Calls Nominatim for reverse geocoding, then classifies the area and derives
// the planning radius. Import this only from server-side code (API routes,
// server actions). Clients must call POST /nx/location/resolve instead.
//
// Nominatim usage policy:
//   – Identifying User-Agent header is included on every request.
//   – Results are cached in-process for 1 hour, keyed by ≈50 m grid squares,
//     so repeated saves do not hammer the Nominatim service.
//   – On failure the resolver returns a safe fallback — it never throws.
//
// Venue/POI discovery is NOT done here. Nominatim is used only for address
// resolution. Use OpenStreetMapVenueProvider (Overpass API) for venue search.

import { buildLocationIntelligence, type NominatimReverseResult } from './area-classifier'
import type { LocationIntelligence } from './types'

// ── In-process cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  intelligence: LocationIntelligence
  expiresAt:    number
}

const cache     = new Map<string, CacheEntry>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

/** Cache key: ~50 m grid (3 decimal places ≈ 111 m / deg → ~50 m diagonal) */
function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}

// ── Nominatim call ────────────────────────────────────────────────────────────

// zoom=14 → neighbourhood-level detail (suburb / quarter granularity)
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
// Identifying User-Agent as required by the Nominatim usage policy.
const USER_AGENT    = 'NexusApp/1.0 (contact@nexus.app)'
const TIMEOUT_MS    = 8_000

/** Safe fallback returned when Nominatim is unreachable. */
const FALLBACK_INTELLIGENCE: LocationIntelligence = {
  areaType:             'suburban',
  planningRadiusMetres: 2000,
  neighborhood:         '',
  city:                 '',
  adminArea:            '',
  country:              '',
  displayLabel:         '',
}

/**
 * Resolve {lat, lng} → LocationIntelligence.
 *
 * Uses Nominatim at zoom=14 for neighbourhood-level detail.
 * Always returns a value — falls back gracefully if Nominatim is unavailable.
 * Results are cached 1 hour to avoid repeated requests for the same location.
 */
export async function resolveLocationIntelligence(
  lat: number,
  lng: number,
): Promise<LocationIntelligence> {
  // Cache hit
  const key    = cacheKey(lat, lng)
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.intelligence
  }

  const url =
    `${NOMINATIM_URL}?lat=${lat}&lon=${lng}` +
    `&format=json&zoom=14&addressdetails=1`

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let data: NominatimReverseResult
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':      USER_AGENT,
        'Accept-Language': 'en',
      },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
    data = (await res.json()) as NominatimReverseResult
  } catch (err) {
    console.warn('[location-intelligence] Nominatim unavailable, using fallback:', err)
    return FALLBACK_INTELLIGENCE
  } finally {
    clearTimeout(timeout)
  }

  const intelligence = buildLocationIntelligence(data)
  cache.set(key, { intelligence, expiresAt: Date.now() + CACHE_TTL })
  return intelligence
}
