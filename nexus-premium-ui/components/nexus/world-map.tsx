'use client'

/**
 * world-map.tsx — Phase 1 + full diagnostic instrumentation
 *
 * All 10 investigation phases wired:
 *   P1  every map event listener (load, error, style.load, styledata,
 *       sourcedata, render, idle)
 *   P2  programmatic state checks after style.load
 *   P3  direct fetch of the TileJSON URL
 *   P4  every layer logged (id, type, source, source-layer)
 *   P5  TileJSON reachability + tile URL
 *   P6  container getBoundingClientRect
 *   P7  canvas size
 *   P8  WebGL context probe
 *   P9  second test map (OpenFreeMap hosted style URL)
 *   P10 full panel visible on screen
 *
 * No existing logs removed. No existing logic changed.
 */

import { useEffect, useRef, useState } from 'react'

// ── Props ─────────────────────────────────────────────────────────────────────
interface WorldMapProps {
  onNavigate: (screen: string) => void
}

// ── Minimal style (unchanged) ─────────────────────────────────────────────────
const STYLE = {
  version: 8 as const,
  sources: {
    world: {
      type: 'vector' as const,
      url: 'https://tiles.openfreemap.org/planet',
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background' as const,
      paint: { 'background-color': '#07101f' },
    },
    {
      id: 'water',
      type: 'fill' as const,
      source: 'world',
      'source-layer': 'water',
      paint: { 'fill-color': '#0a1f3c' },
    },
    {
      id: 'landcover',
      type: 'fill' as const,
      source: 'world',
      'source-layer': 'landcover',
      paint: { 'fill-color': '#0d1c2e', 'fill-opacity': 0.8 },
    },
    {
      id: 'park',
      type: 'fill' as const,
      source: 'world',
      'source-layer': 'park',
      paint: { 'fill-color': '#0f2318', 'fill-opacity': 0.9 },
    },
    {
      id: 'road-major',
      type: 'line' as const,
      source: 'world',
      'source-layer': 'transportation',
      filter: ['in', 'class', 'primary', 'secondary', 'tertiary', 'trunk', 'motorway'],
      paint: {
        'line-color': '#243d5c',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 2.5, 17, 5],
      },
    },
    {
      id: 'road-minor',
      type: 'line' as const,
      source: 'world',
      'source-layer': 'transportation',
      filter: ['in', 'class', 'minor', 'service', 'track'],
      minzoom: 13,
      paint: {
        'line-color': '#1a2d45',
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 17, 2],
      },
    },
  ],
}

// ── Component ─────────────────────────────────────────────────────────────────
export function WorldMap({ onNavigate: _onNavigate }: WorldMapProps) {
  // ── Existing refs ────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<unknown>(null)

  // ── Existing debug state (unchanged) ─────────────────────────────────────────
  const [mounted,             setMounted]             = useState(false)
  const [constructorExecuted, setConstructorExecuted] = useState(false)
  const [mapLoaded,           setMapLoaded]           = useState(false)
  const [webglSupported,      setWebglSupported]      = useState(false)
  const [containerWidth,      setContainerWidth]      = useState(0)
  const [containerHeight,     setContainerHeight]     = useState(0)
  const [mapError,            setMapError]            = useState('')
  const [styleLoadFired,      setStyleLoadFired]      = useState(false)
  const [sourcesCount,        setSourcesCount]        = useState(0)
  const [errors,              setErrors]              = useState<string[]>([])

  // ── P1 new event counters ────────────────────────────────────────────────────
  const [styleDataCount,  setStyleDataCount]  = useState(0)
  const [renderCount,     setRenderCount]     = useState(0)
  const [idleFired,       setIdleFired]       = useState(false)

  // P1 – sourcedata log: every unique (dataType, sourceId, isSourceLoaded) triple
  const [sourcedataLog,   setSourcedataLog]   = useState<string[]>([])

  // ── P2 post-style.load programmatic checks ───────────────────────────────────
  const [postChecks,      setPostChecks]      = useState<string[]>([])

  // ── P3/P5 TileJSON direct fetch ──────────────────────────────────────────────
  const [tileJsonStatus,  setTileJsonStatus]  = useState('not fetched')
  const [tileJsonUrl,     setTileJsonUrl]     = useState('')

  // ── P6/P7 container + canvas geometry ───────────────────────────────────────
  const [rectInfo,        setRectInfo]        = useState('')
  const [canvasInfo,      setCanvasInfo]      = useState('')

  // ── P9 second test map ───────────────────────────────────────────────────────
  const testContainerRef  = useRef<HTMLDivElement>(null)
  const testMapRef        = useRef<unknown>(null)
  const [testLoaded,      setTestLoaded]      = useState(false)
  const [testError,       setTestError]       = useState('')
  const [testConstructed, setTestConstructed] = useState(false)

  // render count via ref — avoids re-rendering every frame
  const renderCountRef = useRef(0)

  // ── Main map useEffect ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // ── Existing logs (unchanged) ─────────────────────────────────────────────
    console.log('[MAP] Component mounted')
    console.log('[MAP] style.version:', STYLE.version)
    console.log('[MAP] style.sources keys:', Object.keys(STYLE.sources))
    console.log('[MAP] style.sources:', JSON.stringify(STYLE.sources, null, 2))
    console.log('[MAP] style.layers.length:', STYLE.layers.length)

    setMounted(true)
    setContainerWidth(containerRef.current.offsetWidth)
    setContainerHeight(containerRef.current.offsetHeight)

    // ── P4 layer inspection ───────────────────────────────────────────────────
    STYLE.layers.forEach((layer) => {
      const l = layer as {
        id: string; type: string;
        source?: string; 'source-layer'?: string;
        minzoom?: number; maxzoom?: number
      }
      console.log(
        `[MAP] Layer: id=${l.id} type=${l.type}` +
        ` source=${l.source ?? '—'} source-layer=${l['source-layer'] ?? '—'}` +
        ` minzoom=${l.minzoom ?? '—'} maxzoom=${l.maxzoom ?? '—'}`,
      )
    })

    // ── P3/P5 direct TileJSON fetch ───────────────────────────────────────────
    setTileJsonStatus('fetching…')
    fetch('https://tiles.openfreemap.org/planet')
      .then((r) => {
        const status = `HTTP ${r.status}`
        console.log('[MAP] TileJSON fetch status:', status)
        return r.json().then((data) => {
          const firstTile = (data as { tiles?: string[] }).tiles?.[0] ?? '(none)'
          console.log('[MAP] TileJSON first tile URL:', firstTile)
          setTileJsonStatus(status + ' ✓')
          setTileJsonUrl(firstTile)
        })
      })
      .catch((err: Error) => {
        console.log('[MAP] TileJSON fetch error:', err.message)
        setTileJsonStatus('FETCH ERROR: ' + err.message)
      })

    let cancelled = false

    import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !containerRef.current) return

      // ── P8 WebGL probe ──────────────────────────────────────────────────────
      const probe = document.createElement('canvas')
      const webgl2 = !!probe.getContext('webgl2')
      setWebglSupported(webgl2)
      console.log('[MAP] WebGL2 supported:', webgl2)

      // Inject MapLibre CSS once per page
      if (!document.getElementById('maplibre-css')) {
        const link = document.createElement('link')
        link.id   = 'maplibre-css'
        link.rel  = 'stylesheet'
        link.href = 'https://unpkg.com/maplibre-gl@6.3.0/dist/maplibre-gl.css'
        document.head.appendChild(link)
      }

      // ── Construct map (unchanged) ───────────────────────────────────────────
      let map: InstanceType<typeof maplibregl.Map>
      try {
        map = new maplibregl.Map({
          container: containerRef.current!,
          style: STYLE as never,
          center: [0.27, 50.77],
          zoom: 12,
          attributionControl: false,
        })
      } catch (err) {
        const msg = (err as Error).message ?? String(err)
        console.log(`[MAP] Error: ${msg}`)
        setMapError(msg)
        setErrors(prev => [...prev, msg])
        return
      }
      console.log('[MAP] Map constructor executed')
      setConstructorExecuted(true)
      mapRef.current = map

      // ── P6/P7 container + canvas geometry ──────────────────────────────────
      const container = map.getContainer()
      const rect = container.getBoundingClientRect()
      const rectStr = `${Math.round(rect.width)}×${Math.round(rect.height)} left:${Math.round(rect.left)} top:${Math.round(rect.top)}`
      console.log('[MAP] Container rect:', rectStr)
      setRectInfo(rectStr)

      const mapCanvas = container.querySelector('canvas')
      if (mapCanvas) {
        const ci = `${mapCanvas.width}×${mapCanvas.height} css:${mapCanvas.style.width || '(unset)'}×${mapCanvas.style.height || '(unset)'}`
        console.log('[MAP] Canvas:', ci)
        setCanvasInfo(ci)
      } else {
        console.log('[MAP] Canvas: not found in DOM')
        setCanvasInfo('not found')
      }

      // Zoom controls
      map.addControl(new maplibregl.NavigationControl(), 'top-right')

      // ── P1 map.on('error') (existing, unchanged) ────────────────────────────
      map.on('error', ((e: unknown) => {
        const msg = (e as { error?: Error })?.error?.message ?? String(e)
        console.log(`[MAP] Error: ${msg}`)
        setMapError(msg)
        setErrors(prev => [...prev, msg])
      }) as Parameters<typeof map.on>[1])

      // ── P1 map.on('style.load') + P2 programmatic checks ───────────────────
      map.on('style.load', () => {
        console.log('[MAP] style.load fired')
        setStyleLoadFired(true)

        // P2 — run all programmatic checks immediately after style loads
        const checks: string[] = []
        try {
          const style      = map.getStyle()
          const src        = map.getSource('world')
          const srcLoaded  = map.isSourceLoaded('world')
          const tilesReady = map.areTilesLoaded()
          const isLoaded   = map.loaded()

          checks.push(`getStyle layers: ${style?.layers?.length ?? 'null'}`)
          checks.push(`getStyle sources: ${Object.keys(style?.sources ?? {}).join(', ')}`)
          checks.push(`getSource('world'): ${src ? (src as { type: string }).type : 'null'}`)
          checks.push(`isSourceLoaded('world'): ${srcLoaded}`)
          checks.push(`areTilesLoaded(): ${tilesReady}`)
          checks.push(`map.loaded(): ${isLoaded}`)
          checks.forEach(c => console.log('[MAP P2]', c))
        } catch (err) {
          const msg = 'P2 error: ' + (err as Error).message
          checks.push(msg)
          console.log('[MAP]', msg)
        }
        setPostChecks(checks)
      })

      // ── P1 map.on('styledata') ──────────────────────────────────────────────
      map.on('styledata', (() => {
        setStyleDataCount(prev => {
          const next = prev + 1
          if (next <= 3) console.log('[MAP] styledata event #' + next)
          return next
        })
      }) as Parameters<typeof map.on>[1])

      // ── P1 map.on('sourcedata') — log EVERY event, not just isSourceLoaded ──
      const loadedSourceIds = new Set<string>()
      const seenKeys = new Set<string>()
      map.on('sourcedata', ((e: unknown) => {
        const ev = e as {
          dataType?: string; isSourceLoaded?: boolean
          sourceId?: string; tile?: unknown
        }
        const key = `dataType=${ev.dataType} sourceId=${ev.sourceId} isLoaded=${ev.isSourceLoaded}`
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          console.log('[MAP] sourcedata:', key)
          setSourcedataLog(prev => [...prev.slice(-9), key])
        }

        // existing logic — count unique fully-loaded sources
        if (ev.dataType === 'source' && ev.isSourceLoaded && ev.sourceId) {
          if (!loadedSourceIds.has(ev.sourceId)) {
            loadedSourceIds.add(ev.sourceId)
            setSourcesCount(loadedSourceIds.size)
            console.log('[MAP] Source loaded:', ev.sourceId)
          }
        }
      }) as Parameters<typeof map.on>[1])

      // ── P1 map.on('render') — count only, no per-frame console spam ─────────
      map.on('render', () => {
        renderCountRef.current++
        const n = renderCountRef.current
        if (n === 1 || n === 5 || n % 50 === 0) {
          console.log('[MAP] render #' + n)
          setRenderCount(n)
        }
      })

      // ── P1 map.on('idle') ────────────────────────────────────────────────────
      map.on('idle', () => {
        console.log('[MAP] idle fired')
        setIdleFired(true)
        // Re-check state when map goes idle
        try {
          console.log('[MAP idle] isSourceLoaded("world"):', map.isSourceLoaded('world'))
          console.log('[MAP idle] areTilesLoaded():', map.areTilesLoaded())
          console.log('[MAP idle] loaded():', map.loaded())
        } catch (err) {
          console.log('[MAP idle] check error:', (err as Error).message)
        }
      })

      // ── P1 map.on('load') (existing, unchanged) ──────────────────────────────
      map.on('load', () => {
        if (cancelled) return
        console.log('[MAP] Map loaded successfully')
        setMapLoaded(true)
      })
    })

    return () => {
      cancelled = true
      const m = mapRef.current as { remove?: () => void } | null
      if (m?.remove) { try { m.remove() } catch { /* ok */ } }
      mapRef.current = null
    }
  }, [])

  // ── P9 second test map (hosted style URL) ─────────────────────────────────
  useEffect(() => {
    if (!testContainerRef.current || testMapRef.current) return
    let cancelled = false

    import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !testContainerRef.current) return

      let testMap: InstanceType<typeof maplibregl.Map>
      try {
        testMap = new maplibregl.Map({
          container: testContainerRef.current!,
          // hosted style — no inline style object, just a URL
          style: 'https://tiles.openfreemap.org/styles/liberty' as never,
          center: [0.27, 50.77],
          zoom: 10,
          attributionControl: false,
          interactive: false,
        })
      } catch (err) {
        const msg = (err as Error).message ?? String(err)
        console.log('[TEST MAP] constructor error:', msg)
        setTestError(msg)
        return
      }
      console.log('[TEST MAP] constructor executed')
      setTestConstructed(true)
      testMapRef.current = testMap

      testMap.on('error', ((e: unknown) => {
        const msg = (e as { error?: Error })?.error?.message ?? String(e)
        console.log('[TEST MAP] error:', msg)
        setTestError(msg)
      }) as Parameters<typeof testMap.on>[1])

      testMap.on('load', () => {
        if (cancelled) return
        console.log('[TEST MAP] loaded successfully')
        setTestLoaded(true)
      })
    })

    return () => {
      cancelled = true
      const m = testMapRef.current as { remove?: () => void } | null
      if (m?.remove) { try { m.remove() } catch { /* ok */ } }
      testMapRef.current = null
    }
  }, [])

  return (
    <div className="relative w-full h-full">
      {/* Main map canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* ── P10 on-screen debug panel (scrollable) ─────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.88)',
          color: '#e2e8f0',
          fontFamily: 'monospace',
          fontSize: 11,
          lineHeight: 1.65,
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.12)',
          width: 'calc(100vw - 80px)',
          maxWidth: 360,
          maxHeight: '70vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          pointerEvents: 'auto',
        }}
      >
        <Hdr>MAP DEBUG</Hdr>

        {/* Existing booleans */}
        <BoolRow label="component mounted"    value={mounted}             />
        <BoolRow label="constructor executed" value={constructorExecuted} />
        <BoolRow label="map loaded"           value={mapLoaded}           />
        <BoolRow label="WebGL supported"      value={webglSupported}      />
        <BoolRow label="style.load fired"     value={styleLoadFired}      />
        <BoolRow label="idle fired"           value={idleFired}           />

        <Sep />

        {/* Geometry */}
        <TextRow label="container"     value={`${containerWidth}×${containerHeight}`} />
        <TextRow label="rect"          value={rectInfo || '—'}  />
        <TextRow label="canvas"        value={canvasInfo || '—'} />

        <Sep />

        {/* Style */}
        <TextRow label="style.version"       value={String(STYLE.version)} />
        <TextRow label="style.sources"       value={Object.keys(STYLE.sources).join(', ')} />
        <TextRow label="style.layers"        value={String(STYLE.layers.length)} />
        <TextRow label="sources loaded"      value={String(sourcesCount)} />
        <TextRow label="styledata events"    value={String(styleDataCount)} />
        <TextRow label="render frames"       value={String(renderCount)} />

        <Sep />

        {/* TileJSON */}
        <Hdr>TILEJSON FETCH</Hdr>
        <TextRow label="status"    value={tileJsonStatus} />
        <div style={{ color: '#94a3b8', wordBreak: 'break-all', fontSize: 10 }}>
          {tileJsonUrl || '—'}
        </div>

        <Sep />

        {/* P2 post style.load checks */}
        <Hdr>POST style.load CHECKS</Hdr>
        {postChecks.length === 0
          ? <div style={{ color: '#64748b' }}>waiting for style.load…</div>
          : postChecks.map((c, i) => (
            <div key={i} style={{ color: '#e2e8f0', wordBreak: 'break-word' }}>{c}</div>
          ))
        }

        <Sep />

        {/* sourcedata log */}
        <Hdr>SOURCEDATA EVENTS (unique)</Hdr>
        {sourcedataLog.length === 0
          ? <div style={{ color: '#64748b' }}>none yet</div>
          : sourcedataLog.map((e, i) => (
            <div key={i} style={{ color: '#a5b4fc', fontSize: 10, wordBreak: 'break-word' }}>{e}</div>
          ))
        }

        <Sep />

        {/* Errors */}
        <Hdr>ERRORS</Hdr>
        {errors.length === 0
          ? <div style={{ color: '#64748b' }}>none</div>
          : errors.map((msg, i) => (
            <div key={i} style={{ color: '#fbbf24', wordBreak: 'break-word' }}>{msg}</div>
          ))
        }

        <Sep />

        {/* P9 test map status */}
        <Hdr>TEST MAP (liberty style URL)</Hdr>
        <BoolRow label="constructed" value={testConstructed} />
        <BoolRow label="loaded"      value={testLoaded}      />
        {testError && (
          <div style={{ color: '#fbbf24', wordBreak: 'break-word', fontSize: 10 }}>
            {testError}
          </div>
        )}
      </div>

      {/* ── P9 test map container (bottom-right corner) ─────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 72,
          right: 8,
          width: 160,
          height: 120,
          zIndex: 9998,
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.2)',
        }}
      >
        <div
          style={{
            position: 'absolute', top: 0, left: 0,
            fontSize: 8, color: '#94a3b8', padding: '2px 4px', zIndex: 1,
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          TEST (hosted style)
        </div>
        <div ref={testContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}

// ── Panel helpers ─────────────────────────────────────────────────────────────
function Hdr({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ letterSpacing: '0.08em', color: '#94a3b8', fontSize: 9,
                  marginTop: 2, marginBottom: 1 }}>
      {children}
    </div>
  )
}
function Sep() {
  return <div style={{ margin: '5px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
}
function BoolRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ color: value ? '#34d399' : '#f87171', fontWeight: 'bold' }}>
        {String(value)}
      </span>
    </div>
  )
}
function TextRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12,
                  flexWrap: 'wrap' }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}
