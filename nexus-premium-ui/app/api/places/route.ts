import { NextResponse } from 'next/server'

/**
 * Phase 5: Google Places (New) text-search proxy.
 *
 * Why server-side? Keeps GOOGLE_PLACES_API_KEY out of the browser bundle and
 * lets us cache responses in memory. The browser hits /api/places only.
 *
 * Query params:
 *   vibe   — pub | drinks | food | coffee | activity   (default: drinks)
 *   lat    — search center latitude                    (default: Eastbourne)
 *   lng    — search center longitude                   (default: Eastbourne)
 *   radius — search radius in meters                    (default: 5000)
 *   limit  — how many venues to return                  (default: 6, max: 10)
 *
 * Returns:
 *   { venues: Venue[], cached: boolean, fallback?: string }
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Eastbourne town centre — sensible UK fallback until we have member locations.
const FALLBACK_LAT = 50.7686
const FALLBACK_LNG = 0.2906

const VIBE_QUERIES: Record<string, string> = {
  pub: 'traditional pubs',
  drinks: 'cocktail bars',
  food: 'restaurants',
  coffee: 'cafes and coffee shops',
  activity: 'things to do',
}

interface CacheEntry {
  expiresAt: number
  payload: unknown
}
// In-memory cache. Resets per server boot — fine for v1.
const CACHE = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface PlaceApiResponse {
  places?: Array<{
    displayName?: { text?: string }
    rating?: number
    userRatingCount?: number
    formattedAddress?: string
    googleMapsUri?: string
    regularOpeningHours?: { openNow?: boolean }
    primaryTypeDisplayName?: { text?: string }
    types?: string[]
    location?: { latitude?: number; longitude?: number }
    priceLevel?: string
  }>
  error?: { message?: string; status?: string }
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

export async function GET(req: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    return NextResponse.json(
      {
        venues: [],
        error:
          'Missing GOOGLE_PLACES_API_KEY. Add it in Secrets so the venue recommendations can load.',
      },
      { status: 500 },
    )
  }

  const url = new URL(req.url)
  const vibeRaw = (url.searchParams.get('vibe') ?? 'drinks').toLowerCase()
  const vibe = (VIBE_QUERIES[vibeRaw] ? vibeRaw : 'drinks') as keyof typeof VIBE_QUERIES
  const lat = Number.parseFloat(url.searchParams.get('lat') ?? '') || FALLBACK_LAT
  const lng = Number.parseFloat(url.searchParams.get('lng') ?? '') || FALLBACK_LNG
  const radius = Math.min(
    20000,
    Math.max(500, Number.parseInt(url.searchParams.get('radius') ?? '5000', 10) || 5000),
  )
  const limit = Math.min(10, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '6', 10) || 6))

  const usedFallback =
    !url.searchParams.get('lat') || !url.searchParams.get('lng')
      ? 'Eastbourne (default search area — member locations not set up yet)'
      : undefined

  const cacheKey = `${vibe}|${lat.toFixed(3)}|${lng.toFixed(3)}|${radius}|${limit}`
  const cached = CACHE.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ...(cached.payload as object), cached: true, fallback: usedFallback })
  }

  let upstream: PlaceApiResponse
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': [
          'places.displayName',
          'places.rating',
          'places.userRatingCount',
          'places.formattedAddress',
          'places.googleMapsUri',
          'places.regularOpeningHours.openNow',
          'places.primaryTypeDisplayName',
          'places.types',
          'places.location',
          'places.priceLevel',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery: VIBE_QUERIES[vibe],
        maxResultCount: limit,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius,
          },
        },
      }),
    })
    upstream = (await res.json()) as PlaceApiResponse
    if (!res.ok) {
      return NextResponse.json(
        {
          venues: [],
          error: upstream?.error?.message || `Google Places returned ${res.status}`,
        },
        { status: res.status },
      )
    }
  } catch (err) {
    return NextResponse.json(
      { venues: [], error: `Places fetch failed: ${(err as Error).message}` },
      { status: 502 },
    )
  }

  const venues = (upstream.places ?? []).map((p) => {
    const placeLat = p.location?.latitude ?? null
    const placeLng = p.location?.longitude ?? null
    const distance_km =
      placeLat != null && placeLng != null ? haversineKm(lat, lng, placeLat, placeLng) : null

    // Lightweight score:
    //   rating × log10(reviews+10)  → quality + popularity, capped sensibly
    //   + 0.4 if open now
    //   – 0.05 × distance_km        → modest distance penalty
    const rating = p.rating ?? 0
    const ratingCount = p.userRatingCount ?? 0
    const openNow = p.regularOpeningHours?.openNow ?? null
    const score =
      rating * Math.log10(ratingCount + 10) +
      (openNow === true ? 0.4 : 0) +
      (distance_km != null ? -0.05 * distance_km : 0)

    return {
      name: p.displayName?.text ?? 'Unknown',
      rating: rating || null,
      rating_count: ratingCount || null,
      open_now: openNow,
      address: p.formattedAddress ?? null,
      category: p.primaryTypeDisplayName?.text ?? p.types?.[0] ?? null,
      maps_url: p.googleMapsUri ?? null,
      price_level: p.priceLevel ?? null,
      distance_km,
      score,
    }
  })

  venues.sort((a, b) => b.score - a.score)

  const payload = { venues, vibe, cached: false, fallback: usedFallback }
  CACHE.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS })

  return NextResponse.json(payload)
}
