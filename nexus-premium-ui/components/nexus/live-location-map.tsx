'use client'

import { useEffect, useRef } from 'react'
import type { Map as LMap, Marker as LMarker, CircleMarker } from 'leaflet'
import type { LatestLocation } from '@/lib/live-event-types'

interface LiveLocationMapProps {
  locations: LatestLocation[]
  memberNames: Map<string, string>
  destination?: { lat: number; lng: number; name: string } | null
}

const LOCATION_CSS_ID = 'nexus-live-location-leaflet-css'

function ageMinutes(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
}

function memberPin(name: string, stale: boolean) {
  const safeName = name.replace(/[&<>\"']/g, '')
  const opacity = stale ? 0.55 : 1
  return `<div style="display:flex;flex-direction:column;align-items:center;opacity:${opacity};filter:drop-shadow(0 3px 8px rgba(0,0,0,.45))"><div style="width:38px;height:38px;border-radius:50%;background:#111827;border:2px solid #c9a030;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;box-shadow:0 0 0 4px rgba(201,160,48,.15)">${safeName.slice(0,2).toUpperCase()}</div><div style="margin-top:3px;padding:2px 6px;border-radius:8px;background:rgba(8,12,20,.9);color:white;font-size:10px;white-space:nowrap;border:1px solid rgba(201,160,48,.25)">${safeName}</div></div>`
}

export default function LiveLocationMap({ locations, memberNames, destination }: LiveLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LMap | null>(null)
  const markersRef = useRef<Map<string, LMarker | CircleMarker>>(new Map())
  const destinationRef = useRef<LMarker | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    if (!document.getElementById(LOCATION_CSS_ID)) {
      const link = document.createElement('link')
      link.id = LOCATION_CSS_ID
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
      link.crossOrigin = ''
      document.head.appendChild(link)
    }

    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return
      const first = locations[0]
      const center: [number, number] = destination
        ? [destination.lat, destination.lng]
        : first
          ? [first.latitude, first.longitude]
          : [50.768, 0.29]

      const map = L.map(containerRef.current, { center, zoom: first || destination ? 14 : 12, zoomControl: false, attributionControl: false })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      mapRef.current = map
      setTimeout(() => map.invalidateSize(), 150)
      syncMarkers(L)
    })

    return () => {
      cancelled = true
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current.clear()
      destinationRef.current?.remove()
      destinationRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
    // The map is intentionally initialised once; marker data is synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const syncMarkers = (L: typeof import('leaflet')) => {
    const map = mapRef.current
    if (!map) return

    const liveIds = new Set(locations.map((loc) => loc.user_id))
    markersRef.current.forEach((marker, userId) => {
      if (!liveIds.has(userId)) {
        marker.remove()
        markersRef.current.delete(userId)
      }
    })

    locations.forEach((loc) => {
      const stale = ageMinutes(loc.recorded_at) > 2
      const name = memberNames.get(loc.user_id) ?? 'Member'
      const icon = L.divIcon({ html: memberPin(name, stale), className: '', iconSize: [90, 66], iconAnchor: [45, 22] })
      const existing = markersRef.current.get(loc.user_id)
      if (existing && 'setLatLng' in existing && 'setIcon' in existing) {
        existing.setLatLng([loc.latitude, loc.longitude])
        existing.setIcon(icon)
      } else {
        const marker = L.marker([loc.latitude, loc.longitude], { icon }).addTo(map)
        marker.bindPopup(`<strong>${name.replace(/[&<>\"']/g, '')}</strong><br/>Updated ${stale ? 'over 2 minutes ago' : 'just now'}`)
        markersRef.current.set(loc.user_id, marker)
      }
    })

    if (destination) {
      const destinationIcon = L.divIcon({ html: '<div style="width:30px;height:30px;border-radius:10px;background:#c9a030;color:#111;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid white;box-shadow:0 3px 12px rgba(0,0,0,.4)">★</div>', className: '', iconSize: [30, 30], iconAnchor: [15, 15] })
      if (destinationRef.current) {
        destinationRef.current.setLatLng([destination.lat, destination.lng])
        destinationRef.current.setIcon(destinationIcon)
      } else {
        destinationRef.current = L.marker([destination.lat, destination.lng], { icon: destinationIcon }).addTo(map)
        destinationRef.current.bindPopup(`<strong>${destination.name.replace(/[&<>\"']/g, '')}</strong><br/>Current meetup stop`)
      }
    }
  }

  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then(syncMarkers)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, memberNames, destination])

  return <div ref={containerRef} className="h-full w-full bg-slate-950" />
}
