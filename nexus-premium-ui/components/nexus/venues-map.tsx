'use client'

import { useEffect, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Venue } from '@/lib/venue-service'

type MapInstance = import('maplibre-gl').Map
type MapMarker = import('maplibre-gl').Marker

interface Props {
  center: { lat: number; lng: number }
  venues: Venue[]
  selectedId?: string | null
  onSelect: (venue: Venue) => void
}

const STYLE_URL = process.env.NEXT_PUBLIC_NEXUS_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/dark'
const keyOf = (venue: Venue) => venue.id ?? `${venue.name}|${venue.lat}|${venue.lng}`

export default function VenuesMap({ center, venues, selectedId, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapInstance | null>(null)
  const markersRef = useRef<MapMarker[]>([])
  const onSelectRef = useRef(onSelect)
  const [error, setError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!hostRef.current) return
    let cancelled = false
    let map: MapInstance | null = null
    import('maplibre-gl').then((libre) => {
      if (cancelled || !hostRef.current) return
      libre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')
      try {
        map = new libre.Map({
          container: hostRef.current,
          style: STYLE_URL,
          center: [center.lng, center.lat],
          zoom: 13,
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
          touchPitch: false,
          touchZoomRotate: true,
        })
        mapRef.current = map
        map.addControl(new libre.NavigationControl({ showCompass: false }), 'top-right')
        const resize = () => map?.resize()
        const observer = new ResizeObserver(resize)
        observer.observe(hostRef.current)
        requestAnimationFrame(resize)
        map.on('error', (event) => {
          if (event.error) setError('Map tiles could not load. Venue results are still available below.')
        })
        map.once('load', () => { setError(null); setMapReady(true) })
        map.on('remove', () => observer.disconnect())
      } catch {
        setError('The map could not be opened on this device. Venue results are still available below.')
      }
    }).catch(() => setError('Map tools could not load. Venue results are still available below.'))
    return () => {
      cancelled = true
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      map?.remove()
      mapRef.current = null
    }
    // Map creation is stable for this component lifetime; center updates use flyTo below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    mapRef.current?.flyTo({ center: [center.lng, center.lat], zoom: 13, duration: 450 })
  }, [center.lat, center.lng])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []
    import('maplibre-gl').then((libre) => {
      if (map !== mapRef.current) return
      markersRef.current = venues.flatMap((venue) => {
        if (venue.lat == null || venue.lng == null || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) return []
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'nexus-venue-marker'
        button.setAttribute('aria-label', `Show ${venue.name} on map`)
        button.title = venue.name
        button.dataset.selected = String(keyOf(venue) === selectedId)
        button.addEventListener('click', () => onSelectRef.current(venue))
        const marker = new libre.Marker({ element: button, anchor: 'bottom' }).setLngLat([venue.lng, venue.lat]).addTo(map)
        return [marker]
      })
    }).catch(() => setError('Map markers could not load. Venue results are still available below.'))
  }, [venues, selectedId, mapReady])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#080a0d]">
      <div ref={hostRef} className="h-[240px] w-full" aria-label="Map of nearby venues" />
      <style jsx global>{`
        .nexus-venue-marker { width: 28px; height: 28px; border: 2px solid #ffe8b3; border-radius: 50% 50% 50% 2px; transform: rotate(-45deg); background: #e76b34; box-shadow: 0 0 18px rgba(231,107,52,.7); cursor: pointer; touch-action: manipulation; }
        .nexus-venue-marker::after { content: ''; display: block; width: 8px; height: 8px; margin: 8px; border-radius: 50%; background: #fff6e6; }
        .nexus-venue-marker[data-selected="true"] { background: #ff8a47; width: 34px; height: 34px; }
        .maplibregl-ctrl-attrib { color: #e6dfd6 !important; background: rgba(5,7,9,.82) !important; }
        .maplibregl-ctrl-attrib a { color: #ffd2a1 !important; }
        .maplibregl-ctrl-group { background: #111 !important; }
        .maplibregl-ctrl-group button { filter: invert(1); }
      `}</style>
      {error && <div role="status" className="absolute inset-x-2 bottom-10 rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-xs text-white/75">{error}</div>}
      <div className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/65 px-2.5 py-1 text-[10px] text-white/75">OpenStreetMap · MapLibre</div>
    </div>
  )
}
