'use client'

import { useEffect, useRef } from 'react'

export default function MapboxTestPage() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    let map: import('leaflet').Map | null = null
    let cancelled = false

    // Inject Leaflet CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id   = 'leaflet-css'
      link.rel  = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return

      map = L.map(containerRef.current, {
        center:           [50.7700, 0.2767], // Eastbourne
        zoom:             13,
        zoomControl:      true,
        attributionControl: false,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map)
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
