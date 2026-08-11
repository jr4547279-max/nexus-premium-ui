/**
 * Google Places (New) Autocomplete + Place Details proxy.
 * Keeps GOOGLE_PLACES_API_KEY server-side.
 *
 * GET /nx/places/autocomplete?q={query}
 *   → { suggestions: [{ placeId, mainText, secondaryText }] }
 *
 * GET /nx/places/autocomplete?placeId={id}
 *   → { placeId, latitude, longitude, formattedAddress }
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PLACES_BASE = 'https://places.googleapis.com/v1'
const apiKey = process.env.GOOGLE_PLACES_API_KEY ?? ''

function noKey() {
  return NextResponse.json(
    { error: 'Google Places API key is not configured' },
    { status: 503 },
  )
}

export async function GET(req: Request) {
  if (!apiKey) return noKey()

  const { searchParams } = new URL(req.url)
  const q       = searchParams.get('q')
  const placeId = searchParams.get('placeId')

  // ── Place Details ───────────────────────────────────────────────────────────
  if (placeId) {
    try {
      const url = `${PLACES_BASE}/places/${encodeURIComponent(placeId)}`
      const res = await fetch(url, {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'id,location,formattedAddress,displayName',
        },
        next: { revalidate: 3600 },
      })
      if (!res.ok) {
        const body = await res.text()
        console.error('[autocomplete] place details error', res.status, body)
        return NextResponse.json({ error: 'Place details unavailable' }, { status: 502 })
      }
      const data = await res.json() as {
        id?: string
        location?: { latitude: number; longitude: number }
        formattedAddress?: string
        displayName?: { text?: string }
      }
      return NextResponse.json({
        placeId:          data.id ?? placeId,
        latitude:         data.location?.latitude  ?? null,
        longitude:        data.location?.longitude ?? null,
        formattedAddress: data.formattedAddress ?? data.displayName?.text ?? '',
      })
    } catch (err) {
      console.error('[autocomplete] place details fetch failed', err)
      return NextResponse.json({ error: 'Failed to fetch place details' }, { status: 500 })
    }
  }

  // ── Autocomplete suggestions ─────────────────────────────────────────────────
  if (!q?.trim()) {
    return NextResponse.json({ suggestions: [] })
  }

  // Optional device-GPS bias: when the client passes lat/lng, we tell Google
  // Places to prefer results near that position. This prevents ambiguous names
  // (e.g. "Willingdon") from silently resolving to a different country.
  // The bias does not hard-exclude distant places; it only re-ranks them.
  const biasLat = searchParams.get('lat')
  const biasLng = searchParams.get('lng')
  const locationBias =
    biasLat && biasLng
      ? {
          circle: {
            center: {
              latitude:  parseFloat(biasLat),
              longitude: parseFloat(biasLng),
            },
            // 150 km radius — broad enough to be helpful, tight enough to
            // strongly prefer the correct country when GPS is available.
            radius: 150_000,
          },
        }
      : undefined

  try {
    const body: Record<string, unknown> = { input: q.trim(), languageCode: 'en' }
    if (locationBias) body.locationBias = locationBias

    const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('[autocomplete] suggestions error', res.status, body)
      return NextResponse.json({ suggestions: [] })
    }
    const data = await res.json() as {
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string
          text?: { text?: string }
          structuredFormat?: {
            mainText?: { text?: string }
            secondaryText?: { text?: string }
          }
        }
      }>
    }

    const suggestions = (data.suggestions ?? [])
      .filter(s => s.placePrediction?.placeId)
      .slice(0, 6)
      .map(s => ({
        placeId:       s.placePrediction!.placeId!,
        mainText:      s.placePrediction!.structuredFormat?.mainText?.text
                    ?? s.placePrediction!.text?.text
                    ?? '',
        secondaryText: s.placePrediction!.structuredFormat?.secondaryText?.text ?? '',
      }))

    return NextResponse.json({ suggestions })
  } catch (err) {
    console.error('[autocomplete] fetch failed', err)
    return NextResponse.json({ suggestions: [] })
  }
}
