'use client'

/**
 * world-map.tsx — Phase 1
 *
 * Smallest possible MapLibre v6 map that renders on a real device.
 *
 * What's in:
 *   - OpenFreeMap vector tiles (background, water, roads)
 *   - Debug overlay (visible until map fires 'load')
 *
 * What's NOT in (added phase by phase):
 *   - terrain / DEM
 *   - sky / atmosphere
 *   - clouds
 *   - 3D buildings
 *   - running paths
 *   - venue discovery
 *   - Golden Path animation
 */

import { useEffect, useRef, useState } from 'react'

// ── Props ─────────────────────────────────────────────────────────────────────
interface WorldMapProps {
  onNavigate: (screen: string) => void
}

// ── Phase 1 style ─────────────────────────────────────────────────────────────
// Only fill + line layers — no glyphs key, no sprite key, no symbol layers.
function buildStyle() {
  return {
    version: 8 as const,
    sources: {
      world: {
        type: 'vector' as const,
        url: 'https://tiles.openfreemap.org/planet',
      },
    },
    layers: [
      // ── Base ─────────────────────────────────────────────────────────────
      {
        id: 'background',
        type: 'background' as const,
        paint: { 'background-color': '#07101f' },
      },
      // ── Water ────────────────────────────────────────────────────────────
      {
        id: 'water',
        type: 'fill' as const,
        source: 'world',
        'source-layer': 'water',
        paint: { 'fill-color': '#0a1f3c' },
      },
      // ── Land cover ───────────────────────────────────────────────────────
      {
        id: 'landcover',
        type: 'fill' as const,
        source: 'world',
        'source-layer': 'landcover',
        paint: { 'fill-color': '#0d1c2e', 'fill-opacity': 0.8 },
      },
      // ── Parks ────────────────────────────────────────────────────────────
      {
        id: 'park',
        type: 'fill' as const,
        source: 'world',
        'source-layer': 'park',
        paint: { 'fill-color': '#0f2318', 'fill-opacity': 0.9 },
      },
      // ── Roads ────────────────────────────────────────────────────────────
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
    ],
  }
}

// ── Debug row ─────────────────────────────────────────────────────────────────
function Row({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex justify-between gap-8">
      <span className="text-slate-400">{label}</span>
      <span className={value ? 'text-emerald-400 font-bold' : 'text-red-400'}>
        {String(value)}
      </span>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export function WorldMap({ onNavigate: _onNavigate }: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<unknown>(null)

  const [mounted,            setMounted]            = useState(false)
  const [constructorCreated, setConstructorCreated] = useState(false)
  const [loadEventFired,     setLoadEventFired]     = useState(false)
  const [ready,              setReady]              = useState(false)
  const [webglError,         setWebglError]         = useState(false)
  const [lastMapError,       setLastMapError]       = useState('')

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    setMounted(true)
    let cancelled = false

    import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !containerRef.current) return

      // Inject MapLibre CSS once
      if (!document.getElementById('maplibre-css')) {
        const link = document.createElement('link')
        link.id    = 'maplibre-css'
        link.rel   = 'stylesheet'
        link.href  = 'https://unpkg.com/maplibre-gl@6.3.0/dist/maplibre-gl.css'
        document.head.appendChild(link)
      }

      // Construct map — GPUInitializationError fires as an event, not a throw,
      // so we install the error listener immediately after construction.
      let map: InstanceType<typeof maplibregl.Map>
      try {
        map = new maplibregl.Map({
          container: containerRef.current!,
          style: buildStyle() as never,
          center: [0.27, 50.77], // Eastbourne, East Sussex
          zoom: 12,
          attributionControl: false,
        })
      } catch (err) {
        setLastMapError((err as Error).message ?? String(err))
        setWebglError(true)
        return
      }
      setConstructorCreated(true)
      mapRef.current = map

      // Capture every MapLibre error into visible state
      map.on('error', ((e: unknown) => {
        const msg = (e as { error?: Error })?.error?.message ?? String(e)
        setLastMapError(msg)
        if (
          msg.toLowerCase().includes('webgl') ||
          msg.toLowerCase().includes('gpu')
        ) {
          setWebglError(true)
        }
      }) as Parameters<typeof map.on>[1])

      map.on('load', () => {
        if (cancelled) return
        setLoadEventFired(true)
        setReady(true)
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
    <div className="relative w-full h-full bg-[#07101f]">
      {/* Map canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Debug overlay — stays until map fires 'load' */}
      {!ready && (
        <div className="absolute inset-0 z-40 bg-[#07101f] flex flex-col items-center justify-center gap-6 px-8">
          <p className="text-[11px] tracking-[0.35em] text-white/40 uppercase">
            Phase 1 — base map
          </p>
          <div className="font-mono text-xs bg-black/50 rounded-xl px-6 py-4 border border-white/10 min-w-[260px] space-y-2">
            <Row label="mounted"            value={mounted} />
            <Row label="constructorCreated" value={constructorCreated} />
            <Row label="loadEventFired"     value={loadEventFired} />
            <Row label="ready"              value={ready} />
            <Row label="webglError"         value={webglError} />
            <div className="pt-1 border-t border-white/10">
              <span className="text-slate-400">lastMapError</span>
              <p className="text-yellow-400 break-all mt-1">
                {lastMapError || '—'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
