/**
 * Reverse-geocode proxy using Nominatim (OpenStreetMap).
 * No API key required. Results cached for 1 hour.
 *
 * GET /nx/places/reverse-geocode?lat={lat}&lng={lng}
 *   → { address, city, country, lat, lng }
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface NominatimResponse {
  display_name?: string
  address?: {
    city?:         string
    town?:         string
    village?:      string
    hamlet?:       string
    municipality?: string
    suburb?:       string
    state?:        string
    county?:       string
    country?:      string
  }
  error?: string
}

// Simple in-memory cache (keyed by rounded lat/lng)
const cache = new Map<string, { address: string; city: string; country: string; expiresAt: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

function cacheKey(lat: number, lng: number) {
  // Round to 2 decimal places (~1 km accuracy)
  return `${lat.toFixed(2)},${lng.toFixed(2)}`
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
  }

  // Check cache
  const key = cacheKey(lat, lng)
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ...cached, lat, lng, cached: true })
  }

  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'NexusApp/1.0 (contact@nexus.app)',
        'Accept-Language': 'en',
      },
    })

    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)

    const data = (await res.json()) as NominatimResponse
    if (data.error) throw new Error(data.error)

    const addr = data.address ?? {}
    const city    = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.suburb ?? addr.hamlet ?? ''
    const country = addr.country ?? ''
    const address = [city, country].filter(Boolean).join(', ') || data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`

    const entry = { address, city, country, expiresAt: Date.now() + CACHE_TTL }
    cache.set(key, entry)

    return NextResponse.json({ address, city, country, lat, lng, cached: false })
  } catch (err) {
    console.error('[reverse-geocode] Nominatim failed', err)
    // Graceful fallback — return coordinates as address
    return NextResponse.json({
      address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      city:    '',
      country: '',
      lat,
      lng,
      cached: false,
    })
  }
}
