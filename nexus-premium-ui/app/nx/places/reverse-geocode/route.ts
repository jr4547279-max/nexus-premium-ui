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

    // Priority order: specific settlement first, large administrative areas last.
    // Nominatim sometimes returns addr.city = 'Wealden' (an 835 km² district)
    // or addr.city = 'Greater London' — these are administrative boundaries, not
    // towns, and produce misleading labels like "Wealden, United Kingdom".
    // By trying town → village → suburb → hamlet first we get the nearest
    // settlement name. We only fall back to addr.city when none of those exist,
    // and even then we prefer display_name over a bare administrative district.
    const settlement =
      addr.town         ??   // e.g. "Uckfield", "Crowborough"
      addr.village       ??  // e.g. "Hartfield", "Nutley"
      addr.suburb        ??  // e.g. "Hove" (within a city boundary)
      addr.hamlet        ??  // e.g. "Poundgate"
      addr.municipality  ??  // fallback for some non-UK geocoders
      null

    const country = addr.country ?? ''

    // Use the settlement if found. Only fall back to addr.city when there is
    // no finer-grained name — and even then, if the display_name leads with
    // something more specific (e.g. a road or village), prefer that.
    let address: string
    if (settlement) {
      address = [settlement, country].filter(Boolean).join(', ')
    } else if (addr.city) {
      // addr.city present but may be a large administrative district.
      // Use display_name's first token as a sanity-check: if it is more
      // specific than addr.city (different string), use display_name instead.
      const displayFirst = data.display_name?.split(',')[0]?.trim() ?? ''
      const cityStr = addr.city
      address =
        displayFirst && displayFirst !== cityStr
          ? [displayFirst, country].filter(Boolean).join(', ')
          : [cityStr, country].filter(Boolean).join(', ')
    } else {
      // No settlement or city at all — use the full display_name or raw coords.
      address = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    }

    // `city` in the response is the settlement name — callers may use it for
    // display. We keep the field name for backwards compatibility.
    const city = settlement ?? addr.city ?? ''

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
