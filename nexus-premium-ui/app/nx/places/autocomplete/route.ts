/**
 * Google Places (New) Autocomplete + Place Details proxy.
 * Keeps GOOGLE_PLACES_API_KEY server-side.
 *
 * GET /nx/places/autocomplete?q={query}
 *   → { suggestions: [{ placeId, mainText, secondaryText }] }
 *   → { suggestions: [], error: { kind, message } }   on failure
 *
 * GET /nx/places/autocomplete?q={query}&lat={lat}&lng={lng}
 *   → biased toward device GPS position; falls back to unbiased on any API error
 *   GPS is ONLY a ranking hint — it never overrides what the user explicitly selects.
 *
 * GET /nx/places/autocomplete?placeId={id}
 *   → { placeId, latitude, longitude, formattedAddress }
 *
 * Error kinds returned to the client (never silently swallowed):
 *   'no_results'       — API returned 200 but zero predictions
 *   'api_error'        — Google returned a non-200 / error body
 *   'quota'            — RESOURCE_EXHAUSTED or similar billing issue
 *   'invalid_key'      — REQUEST_DENIED (key missing, invalid, or not enabled)
 *   'parse_error'      — response was unparseable JSON
 *   'no_key_configured'— GOOGLE_PLACES_API_KEY env var not set
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PLACES_BASE = 'https://places.googleapis.com/v1'
const apiKey = process.env.GOOGLE_PLACES_API_KEY ?? ''

// Google Places (New) API hard maximum for circle bias radius.
const MAX_BIAS_RADIUS_M = 50_000   // 50 km

// ── Error helpers ─────────────────────────────────────────────────────────────

function noKey() {
  console.error('[autocomplete] GOOGLE_PLACES_API_KEY is not set')
  return NextResponse.json(
    { suggestions: [], error: { kind: 'no_key_configured', message: 'Google Places API key is not configured on the server.' } },
    { status: 503 },
  )
}

function classifyGoogleError(status: string): 'quota' | 'invalid_key' | 'api_error' {
  if (status === 'RESOURCE_EXHAUSTED' || status === 'QUOTA_EXCEEDED') return 'quota'
  if (status === 'REQUEST_DENIED' || status === 'UNAUTHENTICATED')     return 'invalid_key'
  return 'api_error'
}

// ── Autocomplete fetch ────────────────────────────────────────────────────────

interface AutocompleteOk {
  ok: true
  suggestions: Array<{ placeId: string; mainText: string; secondaryText: string }>
}
interface AutocompleteErr {
  ok: false
  kind: 'quota' | 'invalid_key' | 'api_error' | 'parse_error'
  message: string
  httpStatus?: number
  googleStatus?: string
}
type AutocompleteResult = AutocompleteOk | AutocompleteErr

async function fetchSuggestions(
  q: string,
  bias?: { lat: number; lng: number },
): Promise<AutocompleteResult> {
  const body: Record<string, unknown> = { input: q.trim(), languageCode: 'en' }

  if (bias) {
    body.locationBias = {
      circle: {
        center: { latitude: bias.lat, longitude: bias.lng },
        // Google Places (New) enforces a hard maximum of 50,000 m.
        // The bias is a re-ranking hint only — it does not exclude distant results.
        radius: MAX_BIAS_RADIUS_M,
      },
    }
  }

  let res: Response
  try {
    res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (networkErr) {
    console.error('[autocomplete] network error calling Google Places', networkErr)
    return { ok: false, kind: 'api_error', message: 'Network error contacting Google Places API.' }
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    const raw = await res.text().catch(() => '')
    console.error('[autocomplete] Google Places returned unparseable JSON', res.status, raw.slice(0, 200))
    return { ok: false, kind: 'parse_error', message: 'Unparseable response from Google Places API.', httpStatus: res.status }
  }

  if (!res.ok) {
    const err = (data as { error?: { status?: string; message?: string } }).error ?? {}
    const googleStatus = err.status ?? 'UNKNOWN'
    const googleMessage = err.message ?? `HTTP ${res.status}`
    const kind = classifyGoogleError(googleStatus)
    console.error('[autocomplete] Google Places error', res.status, googleStatus, googleMessage, bias ? '(with bias)' : '(no bias)')
    return { ok: false, kind, message: googleMessage, httpStatus: res.status, googleStatus }
  }

  const typed = data as {
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

  const suggestions = (typed.suggestions ?? [])
    .filter(s => s.placePrediction?.placeId)
    .slice(0, 6)
    .map(s => ({
      placeId:       s.placePrediction!.placeId!,
      mainText:      s.placePrediction!.structuredFormat?.mainText?.text
                  ?? s.placePrediction!.text?.text
                  ?? '',
      secondaryText: s.placePrediction!.structuredFormat?.secondaryText?.text ?? '',
    }))

  return { ok: true, suggestions }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!apiKey) return noKey()

  const { searchParams } = new URL(req.url)
  const q       = searchParams.get('q')
  const placeId = searchParams.get('placeId')

  // ── Place Details ────────────────────────────────────────────────────────────
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
        console.error('[autocomplete] place details error', res.status, body.slice(0, 200))
        return NextResponse.json(
          { error: { kind: 'api_error', message: `Google Places returned ${res.status}` } },
          { status: 502 },
        )
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
      return NextResponse.json(
        { error: { kind: 'api_error', message: 'Failed to fetch place details.' } },
        { status: 500 },
      )
    }
  }

  // ── Autocomplete suggestions ──────────────────────────────────────────────────
  if (!q?.trim()) {
    return NextResponse.json({ suggestions: [] })
  }

  // Parse optional GPS bias coords.
  // Validation: both must be present and finite numbers within WGS-84 bounds.
  const rawLat = searchParams.get('lat')
  const rawLng = searchParams.get('lng')
  let bias: { lat: number; lng: number } | undefined

  if (rawLat && rawLng) {
    const lat = parseFloat(rawLat)
    const lng = parseFloat(rawLng)
    if (
      Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
      Number.isFinite(lng) && lng >= -180 && lng <= 180
    ) {
      bias = { lat, lng }
    } else {
      console.warn('[autocomplete] invalid bias coords ignored', { rawLat, rawLng })
    }
  }

  // If we have a GPS bias, try biased first. If Google rejects it for any
  // reason (malformed, quota, etc.), fall back to unbiased automatically.
  // GPS is a ranking hint — it must never be the reason a search fails.
  if (bias) {
    const biasedResult = await fetchSuggestions(q, bias)
    if (biasedResult.ok) {
      return NextResponse.json({ suggestions: biasedResult.suggestions })
    }

    // Log the bias failure; fall back to unbiased
    console.warn(
      '[autocomplete] biased request failed — retrying without bias.',
      `kind=${biasedResult.kind}, message=${biasedResult.message}`,
    )
    // Fall through to unbiased attempt below.
  }

  // Unbiased request (or fallback after bias failure)
  const result = await fetchSuggestions(q)

  if (!result.ok) {
    // Return a structured error — never silently return empty suggestions on failure.
    console.error('[autocomplete] unbiased request also failed', result)
    return NextResponse.json(
      {
        suggestions: [],
        error: {
          kind:    result.kind,
          message: result.message,
        },
      },
      // 4xx/5xx at the proxy level so the client can distinguish from "zero results"
      { status: result.kind === 'quota' ? 503 : result.kind === 'invalid_key' ? 503 : 502 },
    )
  }

  return NextResponse.json({ suggestions: result.suggestions })
}
