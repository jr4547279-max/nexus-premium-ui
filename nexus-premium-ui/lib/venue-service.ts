export type Vibe = 'pub' | 'drinks' | 'food' | 'coffee' | 'activity'

export interface Venue {
  /** Stable provider identifier when one is available. */
  id?: string
  name: string
  rating: number | null
  rating_count: number | null
  open_now: boolean | null
  address: string | null
  category: string | null
  description: string | null
  maps_url: string | null
  price_level: string | null
  distance_km: number | null
  lat: number | null
  lng: number | null
  photo_url: string | null
  score: number
  open_at_meeting?: boolean | null
  open_at_meeting_known?: boolean
}

export interface VenuesResult {
  venues: Venue[]
  vibe: Vibe
  cached: boolean
  fallback?: string
  provider?: string
  error?: string
}

/** Provider-neutral request and contract; UI components consume only Venue. */
export interface VenueSearchRequest {
  vibe: Vibe
  activityId?: string
  lat?: number
  lng?: number
  radius?: number
  limit?: number
  meetingDay?: number
  meetingTime?: string
}

export interface VenueProviderAdapter {
  readonly id: string
  search(request: VenueSearchRequest): Promise<VenuesResult>
  /** Providers with a details API may enrich a selected normalized venue. */
  getDetails?(providerId: string): Promise<Venue | null>
}

export type Midpoint =
  | { lat: number; lng: number; fallback: false }
  | { lat: null; lng: null; fallback: true }

export function computeMidpoint(
  coords: Array<{ lat: number; lng: number } | null | undefined>,
): Midpoint {
  const valid = coords.filter(
    (c): c is { lat: number; lng: number } =>
      !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng)
        && c.lat >= -90 && c.lat <= 90 && c.lng >= -180 && c.lng <= 180,
  )
  if (valid.length === 0) {
    return { lat: null, lng: null, fallback: true }
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
 * Fetch normalized venue data from the configured server-side provider.
 * Provider selection and secrets stay on the server; coordinates are mandatory.
 */
export async function fetchVenues(opts: VenueSearchRequest): Promise<VenuesResult> {
  const qs = new URLSearchParams({ vibe: opts.vibe })
  if (opts.activityId) qs.set('activity', opts.activityId)
  if (opts.lat != null) qs.set('lat', String(opts.lat))
  if (opts.lng != null) qs.set('lng', String(opts.lng))
  if (opts.radius != null) qs.set('radius', String(opts.radius))
  if (opts.limit != null) qs.set('limit', String(opts.limit))
  if (Number.isInteger(opts.meetingDay) && opts.meetingDay! >= 0 && opts.meetingDay! <= 6 && opts.meetingTime) {
    qs.set('meetingDay', String(opts.meetingDay))
    qs.set('meetingTime', opts.meetingTime)
  }

  const requestedLimit = Math.max(1, Math.min(opts.limit ?? 8, 18))
  if (opts.lat == null || opts.lng == null || !Number.isFinite(opts.lat) || !Number.isFinite(opts.lng)
    || opts.lat < -90 || opts.lat > 90 || opts.lng < -180 || opts.lng > 180) {
    return { venues: [], vibe: opts.vibe, cached: false, error: 'Choose a planning location before searching nearby venues.' }
  }

  try {
    const primary = await requestJson(`/nx/places?${qs.toString()}`)
    const primaryVenues = primary.response.ok && primary.json ? primary.json.venues : []
    if (primary.response.ok && primary.json) return { ...primary.json, venues: primaryVenues.slice(0, requestedLimit) }
    return { venues: [], vibe: opts.vibe, cached: false, provider: primary.json?.provider, error: primary.json?.error ?? `Venue search failed (HTTP ${primary.response.status})` }
  } catch (err) {
    return {
      venues: [],
      vibe: opts.vibe,
      cached: false,
      error: (err as Error).message,
    }
  }
}

/** A directions deep-link, with coordinates supplied by the selected provider. */
export function buildDirectionsUrl(venue: Pick<Venue, 'lat' | 'lng'>): string | null {
  if (venue.lat == null || venue.lng == null || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)
    || venue.lat < -90 || venue.lat > 90 || venue.lng < -180 || venue.lng > 180) return null
  const destination = `${venue.lat},${venue.lng}`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
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
