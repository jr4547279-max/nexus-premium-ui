import { NextResponse } from 'next/server'
import { buildCommonsApiUrl, normalizeCommonsFileTitle, normalizeCommonsImageResponse } from '@/lib/commons-photo.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800, stale-if-error=604800'

/** Lazy image metadata resolver: only Commons files linked directly from an OSM venue are eligible. */
export async function GET(req: Request) {
  const fileTitle = normalizeCommonsFileTitle(new URL(req.url).searchParams.get('file') ?? '')
  if (!fileTitle) {
    return NextResponse.json({ photo: null, error: 'A verified Commons file reference is required.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const endpoint = buildCommonsApiUrl(fileTitle)
  if (!endpoint) return NextResponse.json({ photo: null }, { status: 404, headers: { 'Cache-Control': 'no-store' } })

  const lookupStartedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NexusSocialPlanner/1.0 (+https://nexus-web-dev.jayrussell99999.workers.dev)',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      console.warn('[api/places/image] lookup failed', {
        provider: 'Wikimedia Commons',
        status: response.status,
        elapsedMs: Date.now() - lookupStartedAt,
        category: 'upstream_http_error',
      })
      return NextResponse.json({ photo: null, error: 'Image details are temporarily unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
    }
    const data: unknown = await response.json()
    const photo = normalizeCommonsImageResponse(data, fileTitle)
    console.info('[api/places/image] lookup completed', {
      provider: 'Wikimedia Commons',
      status: response.status,
      elapsedMs: Date.now() - lookupStartedAt,
      outcome: photo ? 'verified_image' : 'no_usable_licensed_image',
    })
    return NextResponse.json({ photo }, { headers: { 'Cache-Control': CACHE_CONTROL } })
  } catch {
    console.warn('[api/places/image] lookup failed', {
      provider: 'Wikimedia Commons',
      status: null,
      elapsedMs: Date.now() - lookupStartedAt,
      category: controller.signal.aborted ? 'timeout' : 'network_error',
    })
    return NextResponse.json({ photo: null, error: 'Image details are temporarily unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  } finally {
    clearTimeout(timeout)
  }
}
