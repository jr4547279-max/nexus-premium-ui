'use client'

/**
 * world-map.tsx — Phase 1: bare-minimum map
 *
 * Contains only:
 *   - OpenFreeMap vector source
 *   - Full-screen map container
 *   - Map initialisation
 *   - Load event
 *   - Zoom controls (NavigationControl)
 *
 * Nothing else. No terrain, DEM, sky, clouds, buildings,
 * venues, paths, animations, markers, or overlays.
 */

import { useEffect, useRef, useState } from 'react'

// ── Props ─────────────────────────────────────────────────────────────────────
interface WorldMapProps {
  onNavigate: (screen: string) => void
}

// ── Minimal style ─────────────────────────────────────────────────────────────
// Fill and line layers only — no glyphs key, no sprite key, no symbol layers.
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
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<unknown>(null)

  // ── Debug state ─────────────────────────────────────────────────────────────
  const [mounted,             setMounted]             = useState(false)
  const [constructorExecuted, setConstructorExecuted] = useState(false)
  const [mapLoaded,           setMapLoaded]           = useState(false)
  const [webglSupported,      setWebglSupported]      = useState(false)
  const [containerWidth,      setContainerWidth]      = useState(0)
  const [containerHeight,     setContainerHeight]     = useState(0)
  const [mapError,            setMapError]            = useState('')
  // New: event-listener state
  const [styleLoadFired,      setStyleLoadFired]      = useState(false)
  const [sourcesCount,        setSourcesCount]        = useState(0)
  const [errors,              setErrors]              = useState<string[]>([])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    console.log('[MAP] Component mounted')
    setMounted(true)
    setContainerWidth(containerRef.current.offsetWidth)
    setContainerHeight(containerRef.current.offsetHeight)

    let cancelled = false

    import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !containerRef.current) return

      // Check WebGL2 support
      const canvas = document.createElement('canvas')
      setWebglSupported(!!canvas.getContext('webgl2'))

      // Inject MapLibre CSS once per page
      if (!document.getElementById('maplibre-css')) {
        const link = document.createElement('link')
        link.id   = 'maplibre-css'
        link.rel  = 'stylesheet'
        link.href = 'https://unpkg.com/maplibre-gl@6.3.0/dist/maplibre-gl.css'
        document.head.appendChild(link)
      }

      // Construct map
      let map: InstanceType<typeof maplibregl.Map>
      try {
        map = new maplibregl.Map({
          container: containerRef.current!,
          style: STYLE as never,
          center: [0.27, 50.77], // Eastbourne, East Sussex
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

      // Zoom / pitch controls
      map.addControl(new maplibregl.NavigationControl(), 'top-right')

      // ── map.on('error') ───────────────────────────────────────────────────
      map.on('error', ((e: unknown) => {
        const msg = (e as { error?: Error })?.error?.message ?? String(e)
        console.log(`[MAP] Error: ${msg}`)
        setMapError(msg)
        setErrors(prev => [...prev, msg])
      }) as Parameters<typeof map.on>[1])

      // ── map.on('style.load') ──────────────────────────────────────────────
      map.on('style.load', () => {
        console.log('[MAP] style.load fired')
        setStyleLoadFired(true)
      })

      // ── map.on('sourcedata') ──────────────────────────────────────────────
      // Tracks every unique source that reaches isSourceLoaded:true.
      const loadedSourceIds = new Set<string>()
      let sourceLogged = false
      map.on('sourcedata', ((e: unknown) => {
        const ev = e as { dataType?: string; isSourceLoaded?: boolean; sourceId?: string }
        if (ev.dataType === 'source' && ev.isSourceLoaded && ev.sourceId) {
          if (!loadedSourceIds.has(ev.sourceId)) {
            loadedSourceIds.add(ev.sourceId)
            setSourcesCount(loadedSourceIds.size)
          }
          if (!sourceLogged) {
            sourceLogged = true
            console.log('[MAP] Source loaded')
          }
        }
      }) as Parameters<typeof map.on>[1])

      // ── map.on('load') ────────────────────────────────────────────────────
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

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />

      {/* ── On-screen debug panel ── */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.82)',
          color: '#e2e8f0',
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: 1.7,
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.1)',
          maxWidth: 340,
          pointerEvents: 'none',
        }}
      >
        <div style={{ marginBottom: 6, letterSpacing: '0.1em', color: '#94a3b8', fontSize: 10 }}>
          MAP DEBUG
        </div>

        {/* Boolean flags */}
        <BoolRow label="Map component mounted"    value={mounted}             />
        <BoolRow label="Map constructor executed" value={constructorExecuted} />
        <BoolRow label="Map loaded"               value={mapLoaded}           />
        <BoolRow label="WebGL supported"          value={webglSupported}      />
        <BoolRow label="style.load fired"         value={styleLoadFired}      />

        {/* Divider */}
        <div style={{ margin: '6px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }} />

        {/* Dimensions */}
        <TextRow label="Container"   value={`${containerWidth} × ${containerHeight}`} />

        {/* Style URL */}
        <TextRow label="Style URL" value="(inline object)" />

        {/* Sources */}
        <TextRow label="Sources loaded" value={String(sourcesCount)} />

        {/* Errors */}
        {errors.length > 0 && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ color: '#94a3b8', marginBottom: 2 }}>
              Errors ({errors.length})
            </div>
            {errors.map((msg, i) => (
              <div key={i} style={{ color: '#fbbf24', wordBreak: 'break-word', marginBottom: 2 }}>
                {msg}
              </div>
            ))}
          </div>
        )}
        {/* Legacy single-error field kept for compatibility */}
        {mapError && errors.length === 0 && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', color: '#fbbf24', wordBreak: 'break-word' }}>
            <span style={{ color: '#94a3b8' }}>Error: </span>{mapError}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Debug row helpers ─────────────────────────────────────────────────────────
function BoolRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ color: value ? '#34d399' : '#f87171', fontWeight: 'bold' }}>
        {String(value)}
      </span>
    </div>
  )
}

function TextRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span>{value}</span>
    </div>
  )
}
