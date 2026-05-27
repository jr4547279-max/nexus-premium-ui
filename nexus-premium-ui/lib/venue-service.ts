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
  score: number
}

export interface VenuesResult {
  venues: Venue[]
  vibe: Vibe
  cached: boolean
  fallback?: string
  error?: string
}

/**
 * Guess a vibe from a group name. Very intentionally tiny — the user can
 * still flip vibe chips manually in the UI.
 */
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
    const res = await fetch(`/api/places?${qs.toString()}`)
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
