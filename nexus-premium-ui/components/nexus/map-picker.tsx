'use client'

/**
 * Interactive Leaflet map for picking a location by clicking/tapping.
 * Dynamically imported (ssr: false) from location-picker.tsx so Leaflet
 * never runs server-side.
 */

import { useEffect, useRef } from 'react'
import type { Map as LMap, Marker as LMarker } from 'leaflet'

interface MapPickerProps {
  onLocationSelect: (lat: number, lng: number) => void
  initialLat?: number
  initialLng?: number
}

// Nexus-gold SVG pin — avoids Leaflet's default-icon webpack asset issues
const PIN_HTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
  <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22S28 24.5 28 14C28 6.268 21.732 0 14 0z"
        fill="#c9a030"/>
  <circle cx="14" cy="14" r="6" fill="white"/>
</svg>`

export default function MapPicker({
  onLocationSelect,
  initialLat = 51.505,
  initialLng = -0.09,
}: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<LMap | null>(null)
  const markerRef    = useRef<LMarker | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Inject Leaflet CSS once
    if (!document.getElementById('leaflet-css')) {
      const link  = document.createElement('link')
      link.id     = 'leaflet-css'
      link.rel    = 'stylesheet'
      link.href   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
      link.crossOrigin = ''
      document.head.appendChild(link)
    }

    import('leaflet').then((L) => {
      if (!containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current, {
        center:           [initialLat, initialLng],
        zoom:             10,
        zoomControl:      true,
        attributionControl: false,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map)

      const icon = L.divIcon({
        html:       PIN_HTML,
        iconSize:   [28, 36],
        iconAnchor: [14, 36],
        className:  '',
      })

      map.on('click', (e) => {
        const { lat, lng } = e.latlng
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        } else {
          markerRef.current = L.marker([lat, lng], { icon }).addTo(map)
        }
        onLocationSelect(lat, lng)
      })

      mapRef.current = map

      // Force a size recalculation after mount (fixes blank-tile issue in sheets)
      setTimeout(() => map.invalidateSize(), 200)
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current  = null
      markerRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
      className="rounded-xl overflow-hidden"
    />
  )
}
