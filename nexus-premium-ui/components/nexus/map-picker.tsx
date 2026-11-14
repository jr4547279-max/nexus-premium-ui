'use client'

/**
 * Interactive Leaflet map for picking a location by clicking/tapping.
 * Dynamically imported (ssr: false) from location-picker.tsx so Leaflet
 * never runs server-side.
 */

import { useEffect, useRef, useState } from 'react'
import type { Map as LMap, Marker as LMarker } from 'leaflet'
import 'leaflet/dist/leaflet.css'

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
  initialLat = 54.5,
  initialLng = -2.5,
}: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<LMap | null>(null)
  const markerRef    = useRef<LMarker | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    import('leaflet').then((L) => {
      if (!containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current, {
        center:           [initialLat, initialLng],
        zoom:             10,
        zoomControl:      true,
        attributionControl: true,
      })

      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
      }).addTo(map)
      tiles.on('tileerror', () => setMapError('Map tiles are temporarily unavailable. Search or GPS still work.'))
      tiles.on('tileload', () => setMapError(null))

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
    }).catch(() => setMapError('The map could not be loaded. Search or GPS still work.'))

    return () => {
      mapRef.current?.remove()
      mapRef.current  = null
      markerRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <div ref={containerRef} className="h-full w-full" />
      <style jsx global>{`.leaflet-control-zoom a{width:44px!important;height:44px!important;line-height:44px!important;font-size:20px!important}.leaflet-control-attribution{font-size:10px!important;color:#eee!important;background:rgba(0,0,0,.72)!important}.leaflet-control-attribution a{color:#ffd2a1!important}`}</style>
      {mapError && <div role="status" className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-[11px] text-white/80">{mapError}</div>}
    </div>
  )
}
