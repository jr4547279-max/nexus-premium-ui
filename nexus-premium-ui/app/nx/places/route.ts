import { NextResponse } from 'next/server'
import { hasValidProviderLocation, venueDistanceKm } from '@/lib/venue-location'

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
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const FALLBACK_LAT = 50.7686
export const FALLBACK_LNG = 0.2906

const ACTIVITY_SEARCH: Record<string, { query: string; type?: string }> = {
  'gym': { query: 'gyms', type: 'gym' },
  'swimming': { query: 'swimming pools', type: 'swimming_pool' },
  'beach': { query: 'beaches', type: 'beach' },
  'picnic': { query: 'picnic areas', type: 'picnic_ground' },
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
  // "cocktail bars" was too narrow for the World map and could return only one
  // result in smaller towns. Drinks means the broader real-world bar universe;
  // users can still switch to the dedicated Pub chip when they want pubs only.
  drinks: 'bars',
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
  const activityId = (url.searchParams.get('activity') ?? '').toLowerCase()
  const activitySearch = ACTIVITY_SEARCH[activityId]
  const searchQuery = activitySearch?.query ?? VIBE_QUERIES[vibe]
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
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius,
        },
      },
      rankPreference: 'DISTANCE',
    }

    if (activitySearch?.type) {
      body.includedType = activitySearch.type
      body.strictTypeFiltering = true
    } else if (activitySearch?.type) {
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
        'X-Goog-FieldMask': [
          'places.displayName',
          'places.rating',
          'places.userRatingCount',
          'places.formattedAddress',
          'places.googleMapsUri',
          'places.websiteUri',
          'places.editorialSummary',
          'places.regularOpeningHours.openNow',
          'places.primaryTypeDisplayName',
          'places.types',
          'places.location',
          'places.priceLevel',
          'places.photos',
        ].join(','),
      },
      body: JSON.stringify(body),
    })

    const rawBody = await res.text()
    try {
      upstream = JSON.parse(rawBody) as PlaceApiResponse
    } catch {
      console.error('[api/places] non-JSON upstream', {
        status: res.status,
        bodyPreview: rawBody.slice(0, 400),
      })
      return NextResponse.json(
        {
          venues: [],
          error: `Google Places returned non-JSON (${res.status}): ${rawBody.slice(0, 200)}`,
          upstream_status: res.status,
          upstream_code: null,
        },
        { status: res.ok ? 502 : res.status },
      )
    }

    if (!res.ok) {
      const upstreamCode = upstream?.error?.status ?? ''
      const upstreamMsg = upstream?.error?.message ?? `Google Places returned ${res.status}`
      const billingHint =
        upstreamCode === 'PERMISSION_DENIED'
          ? ' — Enable billing at https://console.cloud.google.com/project/_/billing/enable and enable "Places API (New)" at https://console.cloud.google.com/apis/library'
          : ''

      console.error('[api/places] upstream error', {
        status: res.status,
        upstream_code: upstreamCode,
        message: upstreamMsg + billingHint,
        body: rawBody.slice(0, 600),
      })
      return NextResponse.json(
        {
          venues: [],
          error: upstreamMsg + billingHint,
          upstream_status: res.status,
          upstream_code: upstreamCode,
        },
        { status: res.status },
      )
    }
  } catch (err) {
    const message = (err as Error).message
    console.error('[api/places] network failure', { message })
    return NextResponse.json(
      {
        venues: [],
        error: `Places fetch failed (network): ${message}`,
      },
      { status: 502 },
    )
  }

  const venues = (upstream.places ?? []).flatMap((p) => {
    const placeLat = p.location?.latitude ?? null
    const placeLng = p.location?.longitude ?? null
    const name = p.displayName?.text?.trim() ?? ''

    if (!hasValidProviderLocation({ name, lat: placeLat, lng: placeLng }, { lat, lng }, radius)) {
      return []
    }

    const providerLat = placeLat as number
    const providerLng = placeLng as number
    const distance_km = venueDistanceKm({ lat, lng }, { lat: providerLat, lng: providerLng })
    const rating = p.rating ?? 0
    const ratingCount = p.userRatingCount ?? 0
    const openNow = p.regularOpeningHours?.openNow ?? null
    const score =
      rating * Math.log10(ratingCount + 10) +
      (openNow === true ? 0.4 : 0) +
      (distance_km != null ? -0.05 * distance_km : 0)

    const photoName = p.photos?.[0]?.name ?? null
    const photo_url = photoName
      ? `/nx/places/photo?name=${encodeURIComponent(photoName)}&w=200&h=200`
      : null

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
      photo_url,
      score,
    }]
  })

  venues.sort((a, b) => b.score - a.score)

  const payload = { venues, vibe, cached: false, fallback: usedFallback }
  CACHE.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS })

  return NextResponse.json(payload)
}
