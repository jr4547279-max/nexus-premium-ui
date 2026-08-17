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
  /**
   * OSM feature type — 'city', 'town', 'village', 'suburb', 'hamlet',
   * 'isolated_dwelling', 'administrative', etc.
   */
  type?:  string
  /**
   * OSM feature class — 'place' for settlements, 'boundary' for
   * administrative boundaries.
   */
  class?: string
  address?: {
    isolated_dwelling?: string
    hamlet?:            string
    suburb?:            string
    village?:           string
    town?:              string
    city?:              string
    municipality?:      string
    county?:            string
    state?:             string
    country?:           string
  }
  error?: string
}

// OSM class/type values that indicate administrative boundaries rather than
// actual settlements. When the top-level feature has one of these values, we
// cannot trust addr.city — it may be a large district like "Wealden" or
// "Greater London" rather than the user's actual town or village.
const ADMIN_CLASSES = new Set(['boundary'])
const ADMIN_TYPES   = new Set([
  'administrative',
  'county',
  'district',
  'region',
  'province',
  'state',
  'municipality',
])

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
    // zoom=14 returns settlement-level detail (village/suburb/town) rather than
    // the administrative district (zoom=10 gives "Wealden" for rural East Sussex
    // because it surfaces the district boundary instead of the nearest place).
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?lat=${lat}&lon=${lng}&format=json&zoom=14&addressdetails=1`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'NexusApp/1.0 (contact@nexus.app)',
        'Accept-Language': 'en',
      },
    })

    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)

    const data = (await res.json()) as NominatimResponse
    if (data.error) throw new Error(data.error)

    const addr         = data.address ?? {}
    const featureType  = data.type  ?? ''
    const featureClass = data.class ?? ''

    // Is the returned top-level feature an administrative boundary rather than
    // an actual settlement? If so, addr.city cannot be trusted as a label.
    const isAdminBoundary =
      ADMIN_CLASSES.has(featureClass) || ADMIN_TYPES.has(featureType)

    const country = addr.country ?? ''

    // Settlement lookup — ordered from most-specific to least-specific.
    // We deliberately skip addr.isolated_dwelling (a farm/building name) because
    // the user wants the nearest named place, not the feature they are standing on.
    //
    // addr.city is only used when the feature is a genuine city (not an admin
    // boundary), so "Wealden" (class=boundary, type=administrative) is ignored.
    const settlement =
      addr.town         ??  // e.g. "Uckfield", "Crowborough", "Eastbourne"
      addr.village      ??  // e.g. "Hartfield", "Nutley", "Argos Hill"
      addr.suburb       ??  // e.g. "Hove" (suburb within a city boundary)
      addr.hamlet       ??  // e.g. "Poundgate"
      addr.municipality ??  // fallback for some non-UK geocoders
      (!isAdminBoundary ? addr.city : null) ?? // real cities only (type=city/place)
      null

    // Build the display address
    let address: string
    if (settlement) {
      address = [settlement, country].filter(Boolean).join(', ')
    } else {
      // Nothing usable in the address block — scan display_name tokens.
      // Skip tokens that match the admin district name or look like admin labels.
      const adminName = addr.city ?? ''
      const tokens = (data.display_name ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const usable = tokens.find(
        t => t !== adminName && !ADMIN_TYPES.has(t.toLowerCase()),
      )
      address = usable
        ? [usable, country].filter(Boolean).join(', ')
        : data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    }

    // `city` in the response keeps the settlement name for callers that use it.
    const city = settlement ?? ''

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
