export type Vibe = 'pub' | 'drinks' | 'food' | 'coffee' | 'activity'

export interface Venue {
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
  score: number
}

export interface VenuesResult {
  venues: Venue[]
  vibe: Vibe
  cached: boolean
  fallback?: string
  provider?: string
  error?: string
}

// Eastbourne midpoint is retained only as a legacy display fallback. Real group
// searches must provide a planning location; the UI deliberately does not use
// this coordinate for venue discovery.
export const FALLBACK_LAT = 50.7686
export const FALLBACK_LNG = 0.2906

export function computeMidpoint(
  coords: Array<{ lat: number; lng: number } | null | undefined>,
): { lat: number; lng: number; fallback: boolean } {
  const valid = coords.filter(
    (c): c is { lat: number; lng: number } =>
      !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng),
  )
  if (valid.length === 0) {
    return { lat: FALLBACK_LAT, lng: FALLBACK_LNG, fallback: true }
  }
  const lat = valid.reduce((s, c) => s + c.lat, 0) / valid.length
  const lng = valid.reduce((s, c) => s + c.lng, 0) / valid.length
  return { lat, lng, fallback: false }
}

export function inferVibe(groupName: string | null | undefined): Vibe {
  const n = (groupName ?? '').toLowerCase()
  if (/\bpub|beer|ale|tap\b/.test(n)) return 'pub'
  if (/\bcoffee|cafe|brunch\b/.test(n)) return 'coffee'
  if (/\bdinner|food|restaurant|lunch|eat\b/.test(n)) return 'food'
  if (/\btrip|hike|adventure|activity|park|walk|outing\b/.test(n)) return 'activity'
  return 'drinks'
}

export const VIBE_LABEL: Record<Vibe, string> = {
  pub: 'Pub',
  drinks: 'Drinks',
  food: 'Food',
  coffee: 'Coffee',
  activity: 'Activity',
}

export function weatherFits(vibe: Vibe, _venue: Venue): boolean {
  if (vibe === 'activity') return true
  return true
}

export function venueReason(v: Venue): string {
  if (v.rating != null && v.rating >= 4.4) return `Highly rated nearby — ${v.rating.toFixed(1)}★`
  if (v.open_now === true) return 'Open now and close to the midpoint'
  if (v.distance_km != null && v.distance_km < 1) return 'Right by the midpoint'
  if (v.maps_url) return 'Real venue nearby'
  return 'Nearby venue'
}

async function requestJson(url: string): Promise<{ response: Response; json: VenuesResult | null }> {
  const response = await fetch(url)
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    await response.text().catch(() => '')
    return { response, json: null }
  }
  return { response, json: (await response.json()) as VenuesResult }
}

/**
 * Fetch real venues. Google Places remains the richer provider when configured,
 * but Nexus automatically falls back to OpenStreetMap/Overpass so a missing
 * Google key never turns the venue experience into a dead end.
 */
export async function fetchVenues(opts: {
  vibe: Vibe
  lat?: number
  lng?: number
  radius?: number
  limit?: number
}): Promise<VenuesResult> {
  const qs = new URLSearchParams({ vibe: opts.vibe })
  if (opts.lat != null) qs.set('lat', String(opts.lat))
  if (opts.lng != null) qs.set('lng', String(opts.lng))
  if (opts.radius != null) qs.set('radius', String(opts.radius))
  if (opts.limit != null) qs.set('limit', String(opts.limit))

  try {
    const primary = await requestJson(`/nx/places?${qs.toString()}`)
    if (primary.response.ok && primary.json && primary.json.venues.length > 0) {
      return primary.json
    }

    // No Google key / Google billing issue / empty Google result → real OSM fallback.
    if (opts.lat != null && opts.lng != null) {
      const osm = await requestJson(`/nx/places/osm?${qs.toString()}`)
      if (osm.response.ok && osm.json) {
        return {
          ...osm.json,
          provider: osm.json.provider ?? 'OpenStreetMap',
          fallback: primary.json?.error ?? 'Using OpenStreetMap real-world venue data',
        }
      }
      return {
        venues: [],
        vibe: opts.vibe,
        cached: false,
        error: osm.json?.error ?? primary.json?.error ?? `Venue search failed (HTTP ${primary.response.status})`,
      }
    }

    return {
      venues: [],
      vibe: opts.vibe,
      cached: false,
      error: primary.json?.error ?? `Venue search failed (HTTP ${primary.response.status})`,
    }
  } catch (err) {
    if (opts.lat != null && opts.lng != null) {
      try {
        const osm = await requestJson(`/nx/places/osm?${qs.toString()}`)
        if (osm.response.ok && osm.json) return osm.json
      } catch {
        // Fall through to the actionable error below.
      }
    }

    return {
      venues: [],
      vibe: opts.vibe,
      cached: false,
      error: (err as Error).message,
    }
  }
}

export function buildMapUrl(opts: {
  lat: number
  lng: number
  topPickCoord?: { lat: number; lng: number } | null
  fitCoords?: Array<{ lat: number; lng: number }>
  zoom?: number
  w?: number
  h?: number
}) {
  const qs = new URLSearchParams()
  qs.set('lat', String(opts.lat))
  qs.set('lng', String(opts.lng))
  qs.set('zoom', String(opts.zoom ?? 14))
  qs.set('w', String(opts.w ?? 600))
  qs.set('h', String(opts.h ?? 300))

  const pins: string[] = []
  for (const c of opts.fitCoords ?? []) {
    if (Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
      pins.push(`${c.lat.toFixed(5)},${c.lng.toFixed(5)},fit`)
    }
  }
  if (opts.topPickCoord && Number.isFinite(opts.topPickCoord.lat) && Number.isFinite(opts.topPickCoord.lng)) {
    pins.push(`${opts.topPickCoord.lat.toFixed(5)},${opts.topPickCoord.lng.toFixed(5)},top`)
  }
  if (pins.length > 0) qs.set('pins', pins.join('|'))

  return `/nx/places/map?${qs.toString()}`
}
