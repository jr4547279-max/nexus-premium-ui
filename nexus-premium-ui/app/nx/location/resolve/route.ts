/**
 * Location Intelligence resolver endpoint — server-side only, zero cost.
 *
 * POST /nx/location/resolve
 *   Body:    { lat: number; lng: number }
 *   Returns: LocationIntelligence JSON
 *
 * Calls Nominatim with an identifying User-Agent for address/area resolution,
 * then classifies the area type and derives the planning radius.
 * Results are cached 1 hour in-process; failures return a safe fallback.
 *
 * Nominatim is used ONLY for address resolution (reverse geocoding).
 * Venue/POI discovery uses the Overpass API via OpenStreetMapVenueProvider.
 *
 * No Nominatim URLs, credentials, or implementation details are forwarded
 * to the client — only the structured LocationIntelligence response.
 */

import { NextResponse } from 'next/server'
import { resolveLocationIntelligence } from '@/lib/location-intelligence/resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { lat, lng } = (body as Record<string, unknown>) ?? {}

  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !isFinite(lat) || !isFinite(lng) ||
    lat < -90 || lat > 90 ||
    lng < -180 || lng > 180
  ) {
    return NextResponse.json(
      { error: 'Body must contain valid numeric lat and lng' },
      { status: 400 },
    )
  }

  const intelligence = await resolveLocationIntelligence(lat, lng)

  return NextResponse.json(intelligence)
}
