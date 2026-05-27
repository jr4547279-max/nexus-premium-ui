/**
 * Phase 5: Google Static Maps proxy — dark, atmospheric "Nexus" basemap.
 *
 * Renders the midpoint of a group's search area plus venue markers on a
 * dark-themed Google static map. Returns the PNG image bytes; the browser
 * embeds it via <img src="/api/places/map?...">.
 *
 * Query params:
 *   lat,lng        — center (default Eastbourne)
 *   zoom           — 1..20 (default 14)
 *   pins           — comma-separated lat,lng,role triples for venues.
 *                    role = "top" → red marker
 *                    role = "fit" → green marker
 *                    Example: pins=50.77,0.29,top|50.76,0.28,fit
 *
 * Requires "Maps Static API" enabled in Google Cloud Console for the same key.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FALLBACK_LAT = 50.7686
const FALLBACK_LNG = 0.2906

// Dark style approximating Nexus' navy basemap. Repeated style= params are
// concatenated by the Static Maps URL builder.
const DARK_STYLE: string[] = [
  'element:geometry|color:0x0b1320',
  'element:labels.text.fill|color:0x8a8e93',
  'element:labels.text.stroke|color:0x0b1320',
  'feature:administrative|element:geometry|color:0x1f2a3a',
  'feature:administrative.locality|element:labels.text.fill|color:0xb0b6bd',
  'feature:poi|visibility:off',
  'feature:road|element:geometry|color:0x1a2434',
  'feature:road|element:labels|visibility:off',
  'feature:road.highway|element:geometry|color:0x29384b',
  'feature:transit|visibility:off',
  'feature:water|element:geometry|color:0x05101c',
]

export async function GET(req: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    return new Response('Missing GOOGLE_PLACES_API_KEY', { status: 500 })
  }

  const url = new URL(req.url)
  const latRaw = Number.parseFloat(url.searchParams.get('lat') ?? '')
  const lngRaw = Number.parseFloat(url.searchParams.get('lng') ?? '')
  const lat = Number.isFinite(latRaw) ? latRaw : FALLBACK_LAT
  const lng = Number.isFinite(lngRaw) ? lngRaw : FALLBACK_LNG
  const zoom = clampInt(url.searchParams.get('zoom'), 1, 20, 14)
  const w = clampInt(url.searchParams.get('w'), 200, 640, 600)
  const h = clampInt(url.searchParams.get('h'), 150, 640, 300)

  // Build markers list.
  // Midpoint: gold/orange marker, labeled "M"
  const params = new URLSearchParams()
  params.set('center', `${lat},${lng}`)
  params.set('zoom', String(zoom))
  params.set('size', `${w}x${h}`)
  params.set('scale', '2')
  params.set('maptype', 'roadmap')
  params.set('key', key)

  for (const s of DARK_STYLE) params.append('style', s)

  // Pins format: "lat,lng,role|lat,lng,role"
  const pinsRaw = url.searchParams.get('pins') ?? ''
  const pinGroups: { color: string; coords: string[] } = { color: '', coords: [] }
  const topPins: string[] = []
  const fitPins: string[] = []
  if (pinsRaw) {
    for (const triple of pinsRaw.split('|')) {
      const [pLat, pLng, role] = triple.split(',')
      if (!pLat || !pLng) continue
      const coord = `${pLat},${pLng}`
      if (role === 'top') topPins.push(coord)
      else fitPins.push(coord)
    }
  }

  if (fitPins.length > 0) {
    params.append('markers', `color:green|size:small|${fitPins.join('|')}`)
  }
  if (topPins.length > 0) {
    params.append('markers', `color:red|size:mid|${topPins.join('|')}`)
  }
  // Midpoint LAST so it draws on top.
  params.append('markers', `color:orange|size:mid|${lat},${lng}`)
  void pinGroups // silence unused

  const upstream = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`

  let res: Response
  try {
    res = await fetch(upstream, { redirect: 'follow' })
  } catch (err) {
    return new Response(`Map fetch failed: ${(err as Error).message}`, { status: 502 })
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    return new Response(text || `Upstream ${res.status}`, { status: res.status })
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'image/png',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}

function clampInt(raw: string | null, min: number, max: number, fallback: number) {
  const n = Number.parseInt(raw ?? '', 10)
  if (Number.isNaN(n)) return fallback
  return Math.max(min, Math.min(max, n))
}
