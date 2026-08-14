'use client'

import { useEffect, useRef } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'

export default function MapTestPage() {
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
        center: [0.2767, 50.7700],
        zoom: 12,
        attributionControl: false,
      })

      map.on('style.load', () => console.log('[TEST] style.load'))
      map.on('load',       () => console.log('[TEST] load'))
      map.on('idle',       () => console.log('[TEST] idle'))
      map.on('error',      (e) => console.log('[TEST] error', e))
    })

    return () => {
      cancelled = true
      if (map) {
        try { map.remove() } catch { /* ok */ }
        map = null
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', inset: 0 }}
    />
  )
}
