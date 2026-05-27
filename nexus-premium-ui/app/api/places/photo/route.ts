/**
 * Phase 5: Google Places photo proxy.
 *
 * The browser hits /api/places/photo?name=<photoResourceName>&w=&h=. We tack
 * the API key on server-side and stream the JPEG back, so the key never
 * reaches the browser.
 *
 * Google Places photo resource names look like:
 *   places/ChIJ.../photos/AcJlx_M...
 *
 * The Places (New) photo media endpoint is:
 *   GET https://places.googleapis.com/v1/{name}/media?key=KEY&maxHeightPx=...
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_HEADER = 'public, max-age=86400, s-maxage=86400, immutable'

export async function GET(req: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    return new Response('Missing GOOGLE_PLACES_API_KEY', { status: 500 })
  }

  const url = new URL(req.url)
  const name = url.searchParams.get('name')
  if (!name || !name.startsWith('places/')) {
    return new Response('Bad photo name', { status: 400 })
  }
  const w = clampInt(url.searchParams.get('w'), 80, 1200, 200)
  const h = clampInt(url.searchParams.get('h'), 80, 1200, 200)

  const upstream =
    `https://places.googleapis.com/v1/${name}/media` +
    `?key=${encodeURIComponent(key)}` +
    `&maxWidthPx=${w}&maxHeightPx=${h}`

  let res: Response
  try {
    res = await fetch(upstream, { redirect: 'follow' })
  } catch (err) {
    return new Response(`Photo fetch failed: ${(err as Error).message}`, { status: 502 })
  }
  if (!res.ok || !res.body) {
    return new Response(`Upstream ${res.status}`, { status: res.status })
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': CACHE_HEADER,
    },
  })
}

function clampInt(raw: string | null, min: number, max: number, fallback: number) {
  const n = Number.parseInt(raw ?? '', 10)
  if (Number.isNaN(n)) return fallback
  return Math.max(min, Math.min(max, n))
}
