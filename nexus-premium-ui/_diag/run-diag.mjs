// ── Nexus OSRM diagnostic runner ──────────────────────────────────────────────
// Replicates osrm-route-provider.ts exactly.
// Run: node nexus-premium-ui/_diag/run-diag.mjs
//
// Brighton city centre: 50.8225, -0.1372
// Activity: walking  Profile: foot  Target: 5 km
// ─────────────────────────────────────────────────────────────────────────────

// ── Constants (must match osrm-route-provider.ts) ─────────────────────────────
const BATCH_CONCURRENCY = 8
const BATCH_DELAY_MS    = 500
const MASTER_TIMEOUT_MS = 15_000
const TIMEOUT_MS        = 10_000
const DIST_TOLERANCE    = 0.60
const MIN_ROUTE_KM      = 0.3
const LOOP_MAX_RETRACE  = 0.20
const LOOP_MIN_QUALITY  = 0.08
const STARTFINISH_KM    = 0.15
const RETRACE_GRID_M    = 30
const EARTH_KM          = 6371
const DEG               = Math.PI / 180
const RAD               = 180  / Math.PI

const BEARINGS = [
  { bearing: 0,   label: 'North'      },
  { bearing: 45,  label: 'North-East' },
  { bearing: 90,  label: 'East'       },
  { bearing: 135, label: 'South-East' },
  { bearing: 180, label: 'South'      },
  { bearing: 225, label: 'South-West' },
  { bearing: 270, label: 'West'       },
  { bearing: 315, label: 'North-West' },
]
const LEG_SIZES = [0.22, 0.35]

// ── Search parameters ─────────────────────────────────────────────────────────
const LAT      = 50.8225
const LNG      = -0.1372
const TARGET_KM = 5
const PROFILE  = 'foot'
const ACTIVITY = 'walking'

// ── Geo helpers ───────────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * DEG
  const dLng = (lng2 - lng1) * DEG
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLng / 2) ** 2
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function destinationPoint(lat, lng, distKm, bearingDeg) {
  const latR  = lat  * DEG
  const lngR  = lng  * DEG
  const bearR = bearingDeg * DEG
  const d     = distKm / EARTH_KM
  const lat2R = Math.asin(
    Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(bearR),
  )
  const lng2R = lngR + Math.atan2(
    Math.sin(bearR) * Math.sin(d) * Math.cos(latR),
    Math.cos(d) - Math.sin(latR) * Math.sin(lat2R),
  )
  return { lat: lat2R * RAD, lng: lng2R * RAD }
}

// ── Route metrics ─────────────────────────────────────────────────────────────
function computeRetraceRatio(coords) {
  if (coords.length < 4) return 0
  const [lng0, lat0] = coords[0]
  const cosLat = Math.cos(lat0 * DEG)
  const cells  = new Map()
  let prevKey  = ''
  for (const [lng, lat] of coords) {
    const cx  = Math.round((lng - lng0) * 111_320 * cosLat / RETRACE_GRID_M)
    const cy  = Math.round((lat - lat0) * 110_540 / RETRACE_GRID_M)
    const key = `${cx},${cy}`
    if (key === prevKey) continue
    prevKey = key
    cells.set(key, (cells.get(key) ?? 0) + 1)
  }
  const total = cells.size
  const dup   = [...cells.values()].filter(v => v > 1).length
  return total > 0 ? dup / total : 0
}

function computeLoopQuality(coords, totalDistKm) {
  if (coords.length < 6 || totalDistKm < MIN_ROUTE_KM) return 0
  const [lng0, lat0] = coords[0]
  const cosLat = Math.cos(lat0 * DEG)
  let area = 0
  for (let i = 0; i < coords.length; i++) {
    const [lngA, latA] = coords[i]
    const [lngB, latB] = coords[(i + 1) % coords.length]
    const xA = (lngA - lng0) * 111_320 * cosLat
    const yA = (latA - lat0) * 110_540
    const xB = (lngB - lng0) * 111_320 * cosLat
    const yB = (latB - lat0) * 110_540
    area += xA * yB - xB * yA
  }
  const polyAreaKm2  = Math.abs(area) / 2 / 1e6
  const maxCircleKm2 = (totalDistKm ** 2) / (4 * Math.PI)
  return maxCircleKm2 > 0 ? Math.min(1, polyAreaKm2 / maxCircleKm2) : 0
}

function classifyRoute(coords, totalDistKm, retraceRatio, loopQuality) {
  const [lng0, lat0] = coords[0]
  const [lngN, latN] = coords[coords.length - 1]
  const sfKm = haversineKm(lat0, lng0, latN, lngN)
  if (sfKm >= STARTFINISH_KM) return 'linear'
  if (retraceRatio < LOOP_MAX_RETRACE && loopQuality > LOOP_MIN_QUALITY) return 'loop'
  return 'out_and_back'
}

// ── Batched runner ────────────────────────────────────────────────────────────
async function runBatched(fns, concurrency, delayMs, signal) {
  const results = []
  for (let i = 0; i < fns.length; i += concurrency) {
    if (signal?.aborted) break
    const batch = fns.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(batch.map(fn => fn()))
    results.push(...batchResults)
    if (i + concurrency < fns.length && !signal?.aborted) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  return results
}

// ── OSRM query ────────────────────────────────────────────────────────────────
async function queryOsrm(waypoints, candidateId, targetKm, profile, stats, log) {
  stats.sent++
  const coordStr = waypoints
    .map(({ lat, lng }) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
    .join(';')
  const base = profile === 'bike'
    ? 'https://routing.openstreetmap.de/routed-bike'
    : 'https://routing.openstreetmap.de/routed-foot'
  const url =
    `${base}/route/v1/${profile}/${coordStr}` +
    `?overview=full&geometries=geojson&steps=true&continue_straight=false`

  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  const t0    = Date.now()

  try {
    const res = await fetch(url, {
      signal:  ac.signal,
      headers: { Accept: 'application/json' },
    })
    const ms = Date.now() - t0

    if (!res.ok) {
      if (res.status === 429) {
        stats.http429++
        log.push(`  429  ${candidateId}  (${ms}ms)`)
      } else if (res.status >= 500) {
        stats.http5xx++
        log.push(`  5xx(${res.status})  ${candidateId}  (${ms}ms)`)
      } else {
        stats.httpOther++
        log.push(`  HTTP ${res.status}  ${candidateId}  (${ms}ms)`)
      }
      return null
    }

    stats.http200++
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.length) {
      log.push(`  NoRoute(code=${data.code})  ${candidateId}  (${ms}ms)`)
      return null
    }

    const route  = data.routes[0]
    const coords = route.geometry.coordinates
    if (coords.length < 2) return null

    const distKm = Math.round((route.distance / 1000) * 100) / 100
    if (distKm < MIN_ROUTE_KM) return null

    const retrace   = computeRetraceRatio(coords)
    const loopQ     = computeLoopQuality(coords, distKm)
    const routeType = classifyRoute(coords, distKm, retrace, loopQ)

    stats.generated++
    log.push(`  200✓  ${candidateId}  ${distKm}km ${routeType} retrace=${retrace.toFixed(2)} lq=${loopQ.toFixed(2)}  (${ms}ms)`)
    return { candidateId, distKm, routeType, retrace, loopQ }
  } catch (err) {
    if (err?.name === 'AbortError') {
      stats.timeouts++
      log.push(`  TIMEOUT  ${candidateId}  (>${TIMEOUT_MS}ms)`)
    } else {
      log.push(`  ERR  ${candidateId}  ${err?.message}`)
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const stats = { sent: 0, http200: 0, http429: 0, http5xx: 0, httpOther: 0, timeouts: 0, generated: 0 }
  const perRequestLog = []
  const queries = []

  for (const { bearing, label } of BEARINGS) {
    for (const legFrac of LEG_SIZES) {
      const legKm = TARGET_KM * legFrac
      const via1  = destinationPoint(LAT, LNG, legKm, bearing)
      const via2L = destinationPoint(via1.lat, via1.lng, legKm, bearing + 90)
      const via2R = destinationPoint(via1.lat, via1.lng, legKm, bearing - 90)

      queries.push(() => queryOsrm(
        [{ lat: LAT, lng: LNG }, via1, via2L, { lat: LAT, lng: LNG }],
        `osrm-tri-${bearing}-L-${legFrac}`, TARGET_KM, PROFILE, stats, perRequestLog,
      ))
      queries.push(() => queryOsrm(
        [{ lat: LAT, lng: LNG }, via1, via2R, { lat: LAT, lng: LNG }],
        `osrm-tri-${bearing}-R-${legFrac}`, TARGET_KM, PROFILE, stats, perRequestLog,
      ))
    }
  }

  const searchTimestamp = new Date().toISOString()
  console.log(`[NEXUS DIAG] Starting ${queries.length} queries at ${searchTimestamp}`)
  console.log(`             Profile=${PROFILE}  Target=${TARGET_KM}km  Location=${LAT},${LNG}`)
  console.log(`             Batch=${BATCH_CONCURRENCY}  Delay=${BATCH_DELAY_MS}ms  MasterTimeout=${MASTER_TIMEOUT_MS}ms\n`)

  const t0             = Date.now()
  const masterAC       = new AbortController()
  const masterTimer    = setTimeout(() => {
    console.log('[NEXUS DIAG] ⚠ master timeout fired — stopping remaining batches')
    masterAC.abort()
  }, MASTER_TIMEOUT_MS)

  const settled = await runBatched(queries, BATCH_CONCURRENCY, BATCH_DELAY_MS, masterAC.signal)
  clearTimeout(masterTimer)

  const totalMs = Date.now() - t0

  const all = settled
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)

  // Distance filter
  const lo = TARGET_KM * (1 - DIST_TOLERANCE)
  const hi = TARGET_KM * (1 + DIST_TOLERANCE)
  const filtered         = all.filter(c => c.distKm >= lo && c.distKm <= hi)
  const distFilterRejected = all.length - filtered.length
  const pool             = filtered.length > 0 ? filtered : all

  // Dedup by direction-type key (keep best score)
  function score(c) {
    const distFit   = Math.max(0, 1 - Math.abs(c.distKm - TARGET_KM) / TARGET_KM)
    const loopBonus = c.routeType === 'loop' ? c.loopQ * 0.5 : 0
    const retracePen = c.retrace * 0.5
    return distFit + loopBonus - retracePen
  }
  const bestByKey = new Map()
  for (const c of pool) {
    const bearing  = c.candidateId.match(/osrm-tri-(\d+)-/)?.[1] ?? '?'
    const bearLabel = BEARINGS.find(b => String(b.bearing) === bearing)?.label ?? 'Unknown'
    const key      = `${bearLabel}-${c.routeType}`
    const existing = bestByKey.get(key)
    if (!existing || score(c) > score(existing)) bestByKey.set(key, c)
  }

  const byScore = [...bestByKey.values()].sort((a, b) => {
    if (a.routeType === 'loop' && b.routeType !== 'loop') return -1
    if (b.routeType === 'loop' && a.routeType !== 'loop') return 1
    return score(b) - score(a)
  })

  const finalDeduped = []
  for (const c of byScore) {
    const isDup = finalDeduped.some(e =>
      e.routeType === c.routeType &&
      Math.abs(e.distKm - c.distKm) / Math.max(e.distKm, 0.1) < 0.08,
    )
    if (!isDup) finalDeduped.push(c)
  }

  const MAX_ROUTES  = 3
  const finalResult = finalDeduped.slice(0, MAX_ROUTES)
  const dedupRejected = pool.length - finalDeduped.length

  // ── Print diagnostic ──────────────────────────────────────────────────────
  console.log('═'.repeat(60))
  console.log(`[NEXUS DIAG] ${ACTIVITY.toUpperCase()} — ${searchTimestamp} (${totalMs}ms)`)
  console.log('═'.repeat(60))
  console.log(`  Activity:          ${ACTIVITY}`)
  console.log(`  OSRM profile:      ${PROFILE}`)
  console.log(`  Target distance:   ${TARGET_KM} km (±${DIST_TOLERANCE * 100}% = ${lo.toFixed(1)}–${hi.toFixed(1)} km)`)
  console.log(`  Location:          ${LAT}, ${LNG}`)
  console.log('')
  console.log(`  ── HTTP ──`)
  console.log(`  Requests sent:     ${stats.sent}`)
  console.log(`  HTTP 200:          ${stats.http200}`)
  console.log(`  HTTP 429:          ${stats.http429}${stats.http429 > 0 ? '  ← rate-limited' : ''}`)
  console.log(`  HTTP 5xx:          ${stats.http5xx}`)
  console.log(`  HTTP other:        ${stats.httpOther}`)
  console.log(`  Timeouts:          ${stats.timeouts}`)
  console.log(`  No-route / error:  ${stats.http200 - stats.generated}  (200 OK but OSRM returned no usable route)`)
  console.log('')
  console.log(`  ── Candidates ──`)
  console.log(`  Generated:         ${stats.generated}  (valid RouteCandidate objects)`)
  console.log(`  Dist filter −:     ${distFilterRejected}  (outside ${lo.toFixed(1)}–${hi.toFixed(1)} km; fallback used=${filtered.length === 0})`)
  console.log(`  Dedup −:           ${dedupRejected}  (direction-type + near-identical-distance)`)
  console.log(`  Final returned:    ${finalResult.length}${finalResult.length === 0 ? '  ← NO ROUTES — see failure point above' : ''}`)
  if (finalResult.length > 0) {
    finalResult.forEach((c, i) =>
      console.log(`    [${i + 1}] ${c.candidateId}  ${c.distKm}km ${c.routeType} retrace=${c.retrace.toFixed(2)} lq=${c.loopQ.toFixed(2)}`),
    )
  }
  console.log('')
  console.log(`  ── Per-request log ──`)
  perRequestLog.forEach(l => console.log(l))
  console.log('═'.repeat(60))
}

main().catch(err => {
  console.error('DIAG SCRIPT ERROR:', err)
  process.exit(1)
})
