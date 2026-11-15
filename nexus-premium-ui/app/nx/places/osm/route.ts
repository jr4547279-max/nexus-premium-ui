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
  activity: '',
}

const DEFAULT_RADIUS = 3500

export async function GET(req: Request) {
  const url = new URL(req.url)
  const vibe = (url.searchParams.get('vibe') ?? 'drinks').toLowerCase()
  const explicitActivity = (url.searchParams.get('activity') ?? '').toLowerCase()
  const activityId = explicitActivity || VIBE_TO_ACTIVITY[vibe] || ''

  const lat = Number.parseFloat(url.searchParams.get('lat') ?? '')
  const lng = Number.parseFloat(url.searchParams.get('lng') ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
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
  const dayRaw = url.searchParams.get('meetingDay')
  const meetingTimeRaw = url.searchParams.get('meetingTime')
  const meetingTime = meetingTimeRaw ?? ''
  const meetingDay = dayRaw == null ? NaN : Number(dayRaw)
  if ((dayRaw != null || meetingTimeRaw != null) && (!Number.isInteger(meetingDay) || meetingDay < 0 || meetingDay > 6 || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(meetingTime))) {
    return NextResponse.json({ venues: [], vibe, cached: false, error: 'The Golden Window day or time is invalid.' }, { status: 400 })
  }
  const meeting = Number.isInteger(meetingDay) && meetingDay >= 0 && meetingDay <= 6 && /^([01]?\d|2[0-3]):[0-5]\d$/.test(meetingTime)
    ? { dayOfWeek: meetingDay, startTime: meetingTime }
    : undefined

  try {
    const provider = new OpenStreetMapVenueProvider(radius)
    const result = await provider.searchVenues(activityId, { lat, lng }, meeting)
    const venues = result.venues

    const payload = {
      venues: venues.slice(0, limit).map((venue) => ({
        id: venue.id,
        name: venue.name,
        rating: null,
        rating_count: null,
        open_now: null,
        address: venue.address ?? null,
        category: venue.tags.find((tag) => ['pub', 'bar', 'restaurant', 'cafe', 'nightclub'].includes(tag)) ?? null,
        open_at_meeting: venue.openAtMeetingKnown ? venue.openAtMeeting : null,
        open_at_meeting_known: venue.openAtMeetingKnown ?? false,
        maps_url: venue.mapsUrl ?? null,
        price_level: null,
        distance_km: venue.distanceFromCentre,
        lat: venue.lat,
        lng: venue.lng,
        photo_url: null,
        score: Math.max(0, 100 - venue.distanceFromCentre * 20),
      })),
      vibe,
      cached: result.cached,
      stale: result.stale,
      provider: 'OpenStreetMap',
    }

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': result.stale ? 'private, max-age=30' : 'private, max-age=300' },
    })
  } catch (error) {
    const typedError = error as Error & { category?: string; status?: number | null; retryAfterSeconds?: number }
    const message = error instanceof Error ? error.message : 'OpenStreetMap venue search failed.'
    console.error('[api/places/osm] provider unavailable', {
      category: typedError.category ?? 'provider_unavailable',
      status: typedError.status ?? null,
    })
    const headers = new Headers({ 'Cache-Control': 'no-store' })
    if (typedError.retryAfterSeconds) headers.set('Retry-After', String(typedError.retryAfterSeconds))
    return NextResponse.json(
      {
        venues: [],
        vibe,
        cached: false,
        provider: 'OpenStreetMap',
        error: `${message} No venue results were confirmed.`,
        error_code: typedError.category ?? 'provider_unavailable',
      },
      { status: 502, headers },
    )
  }
}
