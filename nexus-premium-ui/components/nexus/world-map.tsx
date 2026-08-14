'use client'

/**
 * world-map.tsx — PHASE 1
 *
 * Smallest possible working MapLibre implementation.
 * Hosted Liberty style URL. No custom layers, sources, overlays, or panels.
 */

import { useEffect, useRef } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'

interface WorldMapProps {
  onNavigate: (screen: string) => void
}

export function WorldMap({ onNavigate: _onNavigate }: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    let map: import('maplibre-gl').Map | null = null
    let cancelled = false

    import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !containerRef.current) return

      map = new maplibregl.Map({
        container: containerRef.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [0.2767, 50.7700], // Eastbourne
        zoom: 12,
        attributionControl: false,
      })

      console.log('[MAP] constructed')

      map.on('style.load', () => console.log('[MAP] style.load'))
      map.on('load',       () => console.log('[MAP] load'))
      map.on('idle',       () => console.log('[MAP] idle'))
      map.on('error', (e) => {
        const err = (e as unknown as { error?: Error }).error
        console.log('[MAP] error', err?.message ?? String(e))
      })
    })

    return () => {
      cancelled = true
      if (map) {
        try { map.remove() } catch { /* ok */ }
        map = null
      }
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
