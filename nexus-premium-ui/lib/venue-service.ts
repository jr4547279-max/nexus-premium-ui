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
  error?: string
}

// Eastbourne midpoint, mirrors the server-side fallback.
export const FALLBACK_LAT = 50.7686
export const FALLBACK_LNG = 0.2906

/**
 * Average a set of member coordinates to a single midpoint, falling back to
 * Eastbourne if nobody has set a location yet. Structured so the real member
 * geolocation feature can drop in later without changing call sites.
 */
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

/** Guess a vibe from a group name. Tiny on purpose — user can flip chips. */
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

/**
 * Outdoor vibes ride the weather harder. With no weather API hooked up yet,
 * indoor vibes always "fit"; outdoor (activity) tentatively also fits.
 * This is the seam where a real forecast will plug in.
 */
export function weatherFits(vibe: Vibe, _venue: Venue): boolean {
  if (vibe === 'activity') return true // placeholder until forecast lands
  return true
}

/** Friendly one-liner used as a recommendation reason inside venue cards. */
export function venueReason(v: Venue): string {
  if (v.rating != null && v.rating >= 4.4) return `Highly rated nearby — ${v.rating.toFixed(1)}★`
  if (v.open_now === true) return 'Open now and close to the midpoint'
  if (v.distance_km != null && v.distance_km < 1) return 'Right by the midpoint'
  return 'Popular spot nearby'
}

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
    const res = await fetch(`/nx/places?${qs.toString()}`)
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('application/json')) {
      const text = await res.text().catch(() => '')
      return {
        venues: [],
        vibe: opts.vibe,
        cached: false,
        error: `Server returned ${res.status} ${ct}: ${text.slice(0, 120)}`,
      }
    }
    const json = (await res.json()) as VenuesResult
    if (!res.ok) {
      return { venues: [], vibe: opts.vibe, cached: false, error: json.error ?? `HTTP ${res.status}` }
    }
    return json
  } catch (err) {
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
