import { NextResponse } from 'next/server'

/**
 * Phase 5: Google Places (New) text-search proxy.
 *
 * Server-side only — keeps GOOGLE_PLACES_API_KEY out of the browser and
 * caches responses in memory for an hour.
 *
 * Query params:
 *   vibe       — pub | drinks | food | coffee | activity   (default: drinks)
 *   lat        — search center latitude                    (default: Eastbourne midpoint)
 *   lng        — search center longitude                   (default: Eastbourne midpoint)
 *   radius     — search radius in meters                   (default: 5000)
 *   limit      — venues to return                          (default: 8, max: 12)
 *
 * Response:
 *   { venues: Venue[], cached: boolean, vibe, fallback?: string }
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Eastbourne town centre — sensible UK fallback until we have member locations.
export const FALLBACK_LAT = 50.7686
export const FALLBACK_LNG = 0.2906

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
const CACHE = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60 * 60 * 1000

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
    photos?: Array<{ name?: string }>
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
          'Missing GOOGLE_PLACES_API_KEY. Add it to Secrets and enable "Places API (New)" + "Maps Static API" in Google Cloud Console.',
      },
      { status: 500 },
    )
  }

  const url = new URL(req.url)
  const vibeRaw = (url.searchParams.get('vibe') ?? 'drinks').toLowerCase()
  const vibe = (VIBE_QUERIES[vibeRaw] ? vibeRaw : 'drinks') as keyof typeof VIBE_QUERIES
  const latRaw = Number.parseFloat(url.searchParams.get('lat') ?? '')
  const lngRaw = Number.parseFloat(url.searchParams.get('lng') ?? '')
  const lat = Number.isFinite(latRaw) ? latRaw : FALLBACK_LAT
  const lng = Number.isFinite(lngRaw) ? lngRaw : FALLBACK_LNG
  const radius = Math.min(
    20000,
    Math.max(500, Number.parseInt(url.searchParams.get('radius') ?? '5000', 10) || 5000),
  )
  const limit = Math.min(12, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '8', 10) || 8))

  const usedFallback =
    !Number.isFinite(latRaw) || !Number.isFinite(lngRaw)
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
          'places.photos',
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

    // Lightweight composite score:
    //   rating × log10(reviews+10)  → quality + popularity
    //   + 0.4 if open now           → fits the Golden Window right now
    //   – 0.05 × distance_km        → mild distance penalty from midpoint
    const rating = p.rating ?? 0
    const ratingCount = p.userRatingCount ?? 0
    const openNow = p.regularOpeningHours?.openNow ?? null
    const score =
      rating * Math.log10(ratingCount + 10) +
      (openNow === true ? 0.4 : 0) +
      (distance_km != null ? -0.05 * distance_km : 0)

    const photoName = p.photos?.[0]?.name ?? null
    const photo_url = photoName
      ? `/api/places/photo?name=${encodeURIComponent(photoName)}&w=200&h=200`
      : null

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
      lat: placeLat,
      lng: placeLng,
      photo_url,
      score,
    }
  })

  venues.sort((a, b) => b.score - a.score)

  const payload = { venues, vibe, cached: false, fallback: usedFallback }
  CACHE.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS })

  return NextResponse.json(payload)
}
