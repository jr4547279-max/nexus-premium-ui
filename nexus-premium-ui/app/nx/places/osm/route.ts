import { NextResponse } from 'next/server'
import { OpenStreetMapVenueProvider } from '@/lib/planners/providers/openstreetmap-venue-provider'

/**
 * Real venue fallback using OpenStreetMap + Overpass.
 *
 * This route exists so Nexus still returns real-world venues when Google Places
 * is unavailable, unconfigured, rate-limited, or billing is disabled.
 * No API key is required.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VIBE_TO_ACTIVITY: Record<string, string> = {
  pub: 'pub-crawl',
  drinks: 'cocktail-bar',
  food: 'restaurant',
  coffee: 'coffee',
  activity: 'pub-crawl',
}

const DEFAULT_RADIUS = 3500

export async function GET(req: Request) {
  const url = new URL(req.url)
  const vibe = (url.searchParams.get('vibe') ?? 'drinks').toLowerCase()
  const activityId = VIBE_TO_ACTIVITY[vibe] ?? 'cocktail-bar'

  const lat = Number.parseFloat(url.searchParams.get('lat') ?? '')
  const lng = Number.parseFloat(url.searchParams.get('lng') ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { venues: [], vibe, cached: false, error: 'A real search location is required.' },
      { status: 400 },
    )
  }

  const radius = Math.min(
    10000,
    Math.max(500, Number.parseInt(url.searchParams.get('radius') ?? String(DEFAULT_RADIUS), 10) || DEFAULT_RADIUS),
  )
  const limit = Math.min(12, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '8', 10) || 8))

  try {
    const provider = new OpenStreetMapVenueProvider(radius)
    const venues = await provider.getVenues(activityId, { lat, lng })

    const payload = {
      venues: venues.slice(0, limit).map((venue) => ({
        name: venue.name,
        rating: null,
        rating_count: null,
        open_now: null,
        address: venue.address ?? null,
        category: venue.tags.find((tag) => ['pub', 'bar', 'restaurant', 'cafe', 'nightclub'].includes(tag)) ?? null,
        maps_url: venue.mapsUrl ?? null,
        price_level: null,
        distance_km: venue.distanceFromCentre,
        lat: venue.lat,
        lng: venue.lng,
        photo_url: null,
        score: Math.max(0, 100 - venue.distanceFromCentre * 20),
      })),
      vibe,
      cached: false,
      provider: 'OpenStreetMap',
    }

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenStreetMap venue search failed.'
    console.error('[api/places/osm] venue search failed', message)
    return NextResponse.json(
      { venues: [], vibe, cached: false, error: message },
      { status: 502 },
    )
  }
}
