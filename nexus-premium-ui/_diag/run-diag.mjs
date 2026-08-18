// ── Nexus OSRM diagnostic runner — v2 (queue + early exit + retry) ────────────
// Mirrors the NEW osrm-route-provider.ts strategy exactly.
// Run: node nexus-premium-ui/_diag/run-diag.mjs
// ─────────────────────────────────────────────────────────────────────────────

const CONCURRENCY     = 4
const MAX_RETRIES     = 3
const RETRY_BASE_MS   = 1_000
const MASTER_TIMEOUT_MS = 30_000
const TIMEOUT_MS      = 8_000
const DIST_TOLERANCE  = 0.60
const MIN_ROUTE_KM    = 0.3
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

const LAT       = 50.8225
const LNG       = -0.1372
const TARGET_KM = 5
const PROFILE   = 'foot'
const ACTIVITY  = 'walking'
const MAX_ROUTES = 3

// ── Geo helpers ───────────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * DEG, dLng = (lng2 - lng1) * DEG
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*DEG)*Math.cos(lat2*DEG)*Math.sin(dLng/2)**2
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
function destinationPoint(lat, lng, distKm, bearingDeg) {
  const latR=lat*DEG, lngR=lng*DEG, bearR=bearingDeg*DEG, d=distKm/EARTH_KM
  const lat2R=Math.asin(Math.sin(latR)*Math.cos(d)+Math.cos(latR)*Math.sin(d)*Math.cos(bearR))
  const lng2R=lngR+Math.atan2(Math.sin(bearR)*Math.sin(d)*Math.cos(latR),Math.cos(d)-Math.sin(latR)*Math.sin(lat2R))
  return { lat: lat2R*RAD, lng: lng2R*RAD }
}

// ── Route metrics ─────────────────────────────────────────────────────────────
function computeRetraceRatio(coords) {
  if (coords.length < 4) return 0
  const [lng0,lat0]=coords[0], cosLat=Math.cos(lat0*DEG), cells=new Map()
  let prevKey=''
  for (const [lng,lat] of coords) {
    const cx=Math.round((lng-lng0)*111_320*cosLat/RETRACE_GRID_M)
    const cy=Math.round((lat-lat0)*110_540/RETRACE_GRID_M), key=`${cx},${cy}`
    if (key===prevKey) continue; prevKey=key; cells.set(key,(cells.get(key)??0)+1)
  }
  const total=cells.size, dup=[...cells.values()].filter(v=>v>1).length
  return total>0?dup/total:0
}
function computeLoopQuality(coords, totalDistKm) {
  if (coords.length<6||totalDistKm<MIN_ROUTE_KM) return 0
  const [lng0,lat0]=coords[0], cosLat=Math.cos(lat0*DEG)
  let area=0
  for (let i=0;i<coords.length;i++) {
    const [lngA,latA]=coords[i],[lngB,latB]=coords[(i+1)%coords.length]
    area+=(lngA-lng0)*111_320*cosLat*(latB-lat0)*110_540-(lngB-lng0)*111_320*cosLat*(latA-lat0)*110_540
  }
  return Math.min(1,(Math.abs(area)/2/1e6)/((totalDistKm**2)/(4*Math.PI)))
}
function classifyRoute(coords, totalDistKm, retraceRatio, loopQuality) {
  const [lng0,lat0]=coords[0],[lngN,latN]=coords[coords.length-1]
  if (haversineKm(lat0,lng0,latN,lngN)>=STARTFINISH_KM) return 'linear'
  return (retraceRatio<LOOP_MAX_RETRACE&&loopQuality>LOOP_MIN_QUALITY)?'loop':'out_and_back'
}

// ── Dedup pipeline (mirrors deduplicateCandidates) ────────────────────────────
function score(c) {
  const distFit=Math.max(0,1-Math.abs(c.distKm-TARGET_KM)/TARGET_KM)
  return distFit+(c.routeType==='loop'?c.loopQ*0.5:0)-c.retrace*0.5
}
function deduplicateCandidates(all) {
  const lo=TARGET_KM*(1-DIST_TOLERANCE), hi=TARGET_KM*(1+DIST_TOLERANCE)
  const filtered=all.filter(c=>c.distKm>=lo&&c.distKm<=hi)
  const pool=filtered.length>0?filtered:all

  // Fix: use `-${bearing}-` pattern to avoid partial-number false matches
  const bestByKey=new Map()
  for (const c of pool) {
    const bearing=c.id.match(/osrm-tri-(\d+)-/)?.[1]??'?'
    const dirLabel=BEARINGS.find(b=>c.id.includes(`-${b.bearing}-`))?.label??'Unknown'
    const key=`${dirLabel}-${c.routeType}`
    const existing=bestByKey.get(key)
    if (!existing||score(c)>score(existing)) bestByKey.set(key,c)
  }

  const byScore=[...bestByKey.values()].sort((a,b)=>{
    if (a.routeType==='loop'&&b.routeType!=='loop') return -1
    if (b.routeType==='loop'&&a.routeType!=='loop') return 1
    return score(b)-score(a)
  })

  const finalDeduped=[]
  for (const c of byScore) {
    const isDup=finalDeduped.some(e=>e.routeType===c.routeType&&Math.abs(e.distKm-c.distKm)/Math.max(e.distKm,0.1)<0.08)
    if (!isDup) finalDeduped.push(c)
  }
  return finalDeduped
}

// ── OSRM query with retry ─────────────────────────────────────────────────────
async function queryOsrm(waypoints, candidateId, targetKm, profile, stats, log) {
  const coordStr=waypoints.map(({lat,lng})=>`${lng.toFixed(6)},${lat.toFixed(6)}`).join(';')
  const base=profile==='bike'?'https://routing.openstreetmap.de/routed-bike':'https://routing.openstreetmap.de/routed-foot'
  const url=`${base}/route/v1/${profile}/${coordStr}?overview=full&geometries=geojson&steps=true&continue_straight=false`

  for (let attempt=0; attempt<=MAX_RETRIES; attempt++) {
    if (attempt>0) {
      const delayMs=RETRY_BASE_MS*(2**(attempt-1))
      log.push(`  ↻ retry ${attempt}/${MAX_RETRIES} — ${candidateId} — waiting ${delayMs}ms`)
      stats.retries++
      await new Promise(r=>setTimeout(r,delayMs))
    }

    stats.sent++
    const ac=new AbortController(), timer=setTimeout(()=>ac.abort(),TIMEOUT_MS), t0=Date.now()
    try {
      const res=await fetch(url,{signal:ac.signal,headers:{Accept:'application/json'}})
      const ms=Date.now()-t0

      if (!res.ok) {
        if (res.status===429) {
          stats.http429++
          const willRetry=attempt<MAX_RETRIES
          log.push(`  429 — ${candidateId} (attempt ${attempt+1})${willRetry?' — retrying':' — giving up'}`)
          if (willRetry) continue
          return null
        }
        res.status>=500?stats.http5xx++:stats.httpOther++
        log.push(`  HTTP ${res.status} — ${candidateId} (${ms}ms)`)
        return null
      }

      stats.http200++
      const data=await res.json()
      if (data.code!=='Ok'||!data.routes?.length) { log.push(`  NoRoute(${data.code}) — ${candidateId}`); return null }

      const route=data.routes[0], coords=route.geometry.coordinates
      if (coords.length<2) return null
      const distKm=Math.round((route.distance/1000)*100)/100
      if (distKm<MIN_ROUTE_KM) return null

      const retrace=computeRetraceRatio(coords), loopQ=computeLoopQuality(coords,distKm)
      const routeType=classifyRoute(coords,distKm,retrace,loopQ)

      stats.generated++
      log.push(`  200✓ ${candidateId}  ${distKm}km ${routeType} retrace=${retrace.toFixed(2)} lq=${loopQ.toFixed(2)}  (${ms}ms)`)
      return { id:candidateId, distKm, routeType, retrace, loopQ }
    } catch(err) {
      if (err?.name==="AbortError") { stats.timeouts++; log.push(`  TIMEOUT — ${candidateId} (>${TIMEOUT_MS}ms)`) } else { log.push(`  CONN_ERR — ${candidateId} — ${err?.message??String(err)}`) }
      return null
    } finally { clearTimeout(timer) }
  }
  return null
}

// ── Queue runner with early exit ──────────────────────────────────────────────
async function runQueue(thunks, stats, log, signal) {
  const pending=[...thunks], accumulated=[]
  let activeCount=0, resolved=false

  return new Promise(resolve=>{
    function finish(reason) {
      if (resolved) return; resolved=true
      const result=deduplicateCandidates(accumulated).slice(0,MAX_ROUTES)
      log.push(`  ▶ done (${reason}) — ${result.length} routes from ${accumulated.length} candidates, ${pending.length} pending thunks discarded`)
      resolve(result)
    }
    function onResult(candidate) {
      activeCount--
      if (resolved){pump();return}
      if (candidate){
        accumulated.push(candidate)
        if (deduplicateCandidates(accumulated).length>=MAX_ROUTES){finish(`${MAX_ROUTES} unique routes found`);return}
      }
      pump()
    }
    function pump() {
      if (resolved) return
      if (signal.aborted){finish('master timeout');return}
      while (activeCount<CONCURRENCY&&pending.length>0&&!resolved){
        const thunk=pending.shift(); activeCount++
        thunk().then(onResult,()=>{activeCount--;if(!resolved)pump()})
      }
      if (activeCount===0&&pending.length===0&&!resolved) finish('all thunks exhausted')
    }
    pump()
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const stats={sent:0,http200:0,http429:0,http5xx:0,httpOther:0,timeouts:0,retries:0,generated:0}
  const log=[]
  const thunks=[]

  for (const {bearing,label} of BEARINGS) {
    for (const legFrac of LEG_SIZES) {
      const legKm=TARGET_KM*legFrac, via1=destinationPoint(LAT,LNG,legKm,bearing)
      const via2L=destinationPoint(via1.lat,via1.lng,legKm,bearing+90)
      const via2R=destinationPoint(via1.lat,via1.lng,legKm,bearing-90)
      thunks.push(()=>queryOsrm([{lat:LAT,lng:LNG},via1,via2L,{lat:LAT,lng:LNG}],`osrm-tri-${bearing}-L-${legFrac}`,TARGET_KM,PROFILE,stats,log))
      thunks.push(()=>queryOsrm([{lat:LAT,lng:LNG},via1,via2R,{lat:LAT,lng:LNG}],`osrm-tri-${bearing}-R-${legFrac}`,TARGET_KM,PROFILE,stats,log))
    }
  }

  const searchTimestamp=new Date().toISOString()
  console.log(`[NEXUS DIAG v2] Starting ${thunks.length} thunks at ${searchTimestamp}`)
  console.log(`                Profile=${PROFILE}  Target=${TARGET_KM}km  Location=${LAT},${LNG}`)
  console.log(`                Concurrency=${CONCURRENCY}  MaxRetries=${MAX_RETRIES}  RetryBase=${RETRY_BASE_MS}ms\n`)

  const t0=Date.now()
  const masterAC=new AbortController()
  const masterTimer=setTimeout(()=>{log.push('  ⚠ master timeout fired');masterAC.abort()},MASTER_TIMEOUT_MS)
  const finalResult=await runQueue(thunks,stats,log,masterAC.signal)
  clearTimeout(masterTimer)
  const totalMs=Date.now()-t0

  const lo=TARGET_KM*(1-DIST_TOLERANCE), hi=TARGET_KM*(1+DIST_TOLERANCE)

  console.log('═'.repeat(60))
  console.log(`[NEXUS DIAG v2] ${ACTIVITY.toUpperCase()} — ${searchTimestamp} (${totalMs}ms)`)
  console.log('═'.repeat(60))
  console.log(`  Activity:        ${ACTIVITY}`)
  console.log(`  OSRM profile:    ${PROFILE}`)
  console.log(`  Target:          ${TARGET_KM} km (±${DIST_TOLERANCE*100}% = ${lo.toFixed(1)}–${hi.toFixed(1)} km)`)
  console.log(`  Concurrency:     ${CONCURRENCY}  MaxRetries: ${MAX_RETRIES}  RetryBase: ${RETRY_BASE_MS}ms`)
  console.log('')
  console.log(`  ── HTTP ──`)
  console.log(`  Requests sent:   ${stats.sent}${stats.retries>0?` (incl. ${stats.retries} retries)`:''}`)
  console.log(`  HTTP 200:        ${stats.http200}`)
  console.log(`  HTTP 429:        ${stats.http429}${stats.http429>0?'  ← rate-limited':''}`)
  console.log(`  HTTP 5xx:        ${stats.http5xx}`)
  console.log(`  HTTP other:      ${stats.httpOther}`)
  console.log(`  Timeouts:        ${stats.timeouts}`)
  console.log(`  Retries:         ${stats.retries}`)
  console.log(`  No-route/err:    ${stats.http200-stats.generated}`)
  console.log('')
  console.log(`  ── Candidates ──`)
  console.log(`  Generated:       ${stats.generated}`)
  console.log(`  Accepted:        ${finalResult.length}`)
  console.log(`  Rejected:        ${stats.generated-finalResult.length}  (distance filter + dedup)`)
  if (finalResult.length>0) finalResult.forEach((c,i)=>console.log(`    [${i+1}] ${c.id}  ${c.distKm}km ${c.routeType}`))
  else console.log('  ← NO ROUTES')
  console.log('')
  console.log(`  ── Request log ──`)
  log.forEach(l=>console.log(l))
  console.log('═'.repeat(60))
}

main().catch(err=>{console.error('DIAG SCRIPT ERROR:',err);process.exit(1)})
