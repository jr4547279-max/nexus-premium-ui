'use client'

/**
 * world-map-test.tsx — temporary diagnostic component.
 *
 * Starts with the absolute minimum MapLibre v6 style (background layer only)
 * and adds features back one at a time to isolate the step that breaks
 * initialization on mobile.
 *
 * Current step: 0 — background layer only, no terrain, no glyphs, no sky.
 *
 * Navigation: /dev-world-test
 */

import { useEffect, useRef, useState } from 'react'

// ── Step label shown in the overlay ──────────────────────────────────────────
const STEP = 'Step 0 — background only'

// ── Minimal style ─────────────────────────────────────────────────────────────
// version 8 + one background layer.
// The openfreemap vector source is declared so tiles.openfreemap.org/planet
// is reachable, but no vector layers reference it yet.
function buildTestStyle() {
  return {
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
export default function WorldMapTest() {
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

      // Construct the map — no WebGL2 probe so the error event captures the
      // exact message if WebGL is missing instead of silently short-circuiting.
      let map: InstanceType<typeof maplibregl.Map>
      try {
        map = new maplibregl.Map({
          container: containerRef.current!,
          style: buildTestStyle() as never,
          center: [0.27, 50.77],
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

      // Capture every MapLibre error into state
      map.on('error', ((e: unknown) => {
        const msg = (e as { error?: Error })?.error?.message ?? String(e)
        setLastMapError(msg)
        if (msg.toLowerCase().includes('webgl') || msg.toLowerCase().includes('gpu')) {
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

      {/* Debug overlay — visible until ready */}
      {!ready && (
        <div className="absolute inset-0 z-40 bg-[#07101f] flex flex-col items-center justify-center gap-6 px-8">
          <p className="text-[11px] tracking-[0.35em] text-white/40 uppercase">
            {STEP}
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
