import { NextResponse } from 'next/server'
import { hasValidProviderLocation, venueDistanceKm } from '@/lib/venue-location'

/**
 * Phase 5: Google Places (New) text-search proxy.
 *
 * Activity is authoritative whenever supplied. Every registered activity that
 * can use venue discovery has an explicit Google search definition; an unknown
 * activity never silently falls back to the generic "things to do" query.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const FALLBACK_LAT = 50.7686
export const FALLBACK_LNG = 0.2906

const ACTIVITY_SEARCH: Record<string, { query: string; type?: string }> = {
  'jogging': { query: 'running tracks and running routes', type: 'park' },
  'walking': { query: 'walking trails and parks', type: 'park' },
  'hiking': { query: 'hiking trails and parks', type: 'park' },
  'cycling': { query: 'cycling routes and cycle trails', type: 'park' },
  'swimming': { query: 'swimming pools', type: 'swimming_pool' },
  'gym': { query: 'gyms and fitness centres', type: 'gym' },
  'beach': { query: 'beaches', type: 'beach' },
  'picnic': { query: 'picnic areas and parks', type: 'park' },
  'pub-crawl': { query: 'pubs', type: 'pub' },
  'cocktail-bar': { query: 'cocktail bars', type: 'cocktail_bar' },
  'board-games': { query: 'board game cafes' },
  'restaurant': { query: 'restaurants', type: 'restaurant' },
  'brunch': { query: 'brunch restaurants', type: 'brunch_restaurant' },
  'coffee': { query: 'cafes and coffee shops', type: 'cafe' },
  'cinema': { query: 'cinemas', type: 'movie_theater' },
  'bowling': { query: 'bowling alleys', type: 'bowling_alley' },
  'live-music': { query: 'live music venues', type: 'live_music_venue' },
  'escape-room': { query: 'escape rooms' },
}

const VIBE_QUERIES: Record<string, string> = {
  pub: 'pubs',
  drinks: 'bars',
  food: 'restaurants',
  coffee: 'cafes and coffee shops',
  activity: 'things to do',
}

interface CacheEntry { expiresAt: number; payload: unknown }
const CACHE = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60 * 60 * 1000

interface PlaceApiResponse {
  places?: Array<{
    displayName?: { text?: string }
    rating?: number
    userRatingCount?: number
    formattedAddress?: string
    googleMapsUri?: string
    websiteUri?: string
    editorialSummary?: { text?: string }
    regularOpeningHours?: { openNow?: boolean }
    primaryTypeDisplayName?: { text?: string }
    types?: string[]
    location?: { latitude?: number; longitude?: number }
    priceLevel?: string
    photos?: Array<{ name?: string }>
  }>
  error?: { message?: string; status?: string }
}

export async function GET(req: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    return NextResponse.json({ venues: [], error: 'Missing GOOGLE_PLACES_API_KEY. Add it to Secrets and enable "Places API (New)" + "Maps Static API" in Google Cloud Console.' }, { status: 500 })
  }

  const url = new URL(req.url)
  const vibeRaw = (url.searchParams.get('vibe') ?? 'drinks').toLowerCase()
  const vibe = (VIBE_QUERIES[vibeRaw] ? vibeRaw : 'drinks') as keyof typeof VIBE_QUERIES
  const activityId = (url.searchParams.get('activity') ?? '').trim().toLowerCase()
  const activitySearch = ACTIVITY_SEARCH[activityId]

  // An explicit but unknown activity is still better treated as an activity
  // search than being silently converted into pubs/bars/restaurants.
  if (activityId && !activitySearch) {
    return NextResponse.json({
      venues: [],
      vibe,
      cached: false,
      error: `No venue search mapping exists for activity "${activityId}".`,
    }, { status: 422 })
  }

  const searchQuery = activitySearch?.query ?? VIBE_QUERIES[vibe]
  const latRaw = Number.parseFloat(url.searchParams.get('lat') ?? '')
  const lngRaw = Number.parseFloat(url.searchParams.get('lng') ?? '')
  const lat = Number.isFinite(latRaw) ? latRaw : FALLBACK_LAT
  const lng = Number.isFinite(lngRaw) ? lngRaw : FALLBACK_LNG
  const radius = Math.min(20000, Math.max(500, Number.parseInt(url.searchParams.get('radius') ?? '5000', 10) || 5000))
  const limit = Math.min(12, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '8', 10) || 8))

  const usedFallback = !Number.isFinite(latRaw) || !Number.isFinite(lngRaw)
    ? 'Eastbourne (default search area — member locations not set up yet)'
    : undefined

  const cacheKey = `${activityId || vibe}|${lat.toFixed(3)}|${lng.toFixed(3)}|${radius}|${limit}`
  const cached = CACHE.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ...(cached.payload as object), cached: true, fallback: usedFallback })
  }

  let upstream: PlaceApiResponse
  try {
    const body: Record<string, unknown> = {
      textQuery: searchQuery,
      pageSize: Math.min(20, limit),
      languageCode: 'en',
      regionCode: 'GB',
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius } },
      rankPreference: 'DISTANCE',
    }

    if (activitySearch?.type) {
      body.includedType = activitySearch.type
      body.strictTypeFiltering = true
    } else if (vibe === 'pub') {
      body.includedType = 'pub'
      body.strictTypeFiltering = true
    }

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': ['places.displayName','places.rating','places.userRatingCount','places.formattedAddress','places.googleMapsUri','places.websiteUri','places.editorialSummary','places.regularOpeningHours.openNow','places.primaryTypeDisplayName','places.types','places.location','places.priceLevel','places.photos'].join(','),
      },
      body: JSON.stringify(body),
    })

    const rawBody = await res.text()
    try { upstream = JSON.parse(rawBody) as PlaceApiResponse } catch {
      console.error('[api/places] non-JSON upstream', { status: res.status, bodyPreview: rawBody.slice(0, 400) })
      return NextResponse.json({ venues: [], error: `Google Places returned non-JSON (${res.status}): ${rawBody.slice(0, 200)}`, upstream_status: res.status, upstream_code: null }, { status: res.ok ? 502 : res.status })
    }

    if (!res.ok) {
      const upstreamCode = upstream?.error?.status ?? ''
      const upstreamMsg = upstream?.error?.message ?? `Google Places returned ${res.status}`
      const billingHint = upstreamCode === 'PERMISSION_DENIED' ? ' — Enable billing and Places API (New) in Google Cloud Console.' : ''
      console.error('[api/places] upstream error', { status: res.status, upstream_code: upstreamCode, message: upstreamMsg + billingHint, body: rawBody.slice(0, 600) })
      return NextResponse.json({ venues: [], error: upstreamMsg + billingHint, upstream_status: res.status, upstream_code: upstreamCode }, { status: res.status })
    }
  } catch (err) {
    return NextResponse.json({ venues: [], error: `Places fetch failed (network): ${(err as Error).message}` }, { status: 502 })
  }

  const venues = (upstream.places ?? []).flatMap((p) => {
    const placeLat = p.location?.latitude ?? null
    const placeLng = p.location?.longitude ?? null
    const name = p.displayName?.text?.trim() ?? ''
    if (!hasValidProviderLocation({ name, lat: placeLat, lng: placeLng }, { lat, lng }, radius)) return []

    const providerLat = placeLat as number
    const providerLng = placeLng as number
    const distance_km = venueDistanceKm({ lat, lng }, { lat: providerLat, lng: providerLng })
    const rating = p.rating ?? 0
    const ratingCount = p.userRatingCount ?? 0
    const openNow = p.regularOpeningHours?.openNow ?? null
    const score = rating * Math.log10(ratingCount + 10) + (openNow === true ? 0.4 : 0) + (distance_km != null ? -0.05 * distance_km : 0)
    const photoName = p.photos?.[0]?.name ?? null

    return [{
      name,
      rating: rating || null,
      rating_count: ratingCount || null,
      open_now: openNow,
      address: p.formattedAddress ?? null,
      category: p.primaryTypeDisplayName?.text ?? p.types?.[0] ?? null,
      description: p.editorialSummary?.text ?? null,
      maps_url: p.googleMapsUri ?? null,
      price_level: p.priceLevel ?? null,
      distance_km,
      lat: providerLat,
      lng: providerLng,
      photo_url: photoName ? `/nx/places/photo?name=${encodeURIComponent(photoName)}&w=200&h=200` : null,
      score,
    }]
  })

  venues.sort((a, b) => b.score - a.score)
  const payload = { venues, vibe, cached: false, fallback: usedFallback }
  CACHE.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS })
  return NextResponse.json(payload)
}
