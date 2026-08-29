'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed, Navigation, Rotate3D, Sparkles } from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchVenues, VIBE_LABEL, type Venue, type Vibe } from '@/lib/venue-service'
import { VenueDetailSheet } from './venue-detail-sheet'

interface WorldMapProps { onNavigate: (screen: string) => void }
type MapInstance = import('maplibre-gl').Map
const START = { lat: 50.7700, lng: 0.2767 }
const VIBES: Vibe[] = ['pub', 'drinks', 'food', 'coffee', 'activity']
const VIBE_ICON: Record<Vibe, string> = { pub: '🍺', drinks: '✦', food: '🍴', coffee: '☕', activity: '◆' }
const VIBE_TONE: Record<Vibe, string> = { pub: '#f59e0b', drinks: '#fbbf24', food: '#fb7185', coffee: '#c084fc', activity: '#34d399' }
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark'
const VENUE_SOURCE = 'nexus-venues'
const VENUE_HIT = 'nexus-venue-hit'
const VENUE_CIRCLE = 'nexus-venue-circles'
const VENUE_ICON = 'nexus-venue-icons'
const VENUE_LABEL = 'nexus-venue-labels'

function venueKey(venue: Venue) {
  return venue.id ?? `${venue.name}|${venue.lat}|${venue.lng}`
}

function venueGeoJson(venues: Venue[]) {
  return { type: 'FeatureCollection' as const, features: venues.flatMap((venue) => {
    if (!Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) return []
    return [{ type: 'Feature' as const, properties: { key: venueKey(venue), name: venue.name }, geometry: { type: 'Point' as const, coordinates: [Number(venue.lng), Number(venue.lat)] as [number, number] } }]
  }) }
}

export function WorldMap({ onNavigate: _onNavigate }: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapInstance | null>(null)
  const venuesRef = useRef<Venue[]>([])
  const locationRef = useRef(START)
  const requestIdRef = useRef(0)
  const [vibe, setVibe] = useState<Vibe>('drinks')
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [locating, setLocating] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [vote, setVote] = useState<1 | -1 | 0>(0)
  const [weatherLabel, setWeatherLabel] = useState('Atmosphere online')
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [venueError, setVenueError] = useState<string | null>(null)
  const [is3D, setIs3D] = useState(false)

  const loadVenues = useCallback(async (lat: number, lng: number, selectedVibe: Vibe) => {
    const requestId = ++requestIdRef.current; setLoading(true); setVenueError(null)
    try {
      const result = await fetchVenues({ vibe: selectedVibe, lat, lng, radius: 5000, limit: 18 })
      if (requestId !== requestIdRef.current) return
      const valid = result.venues.filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng))
      venuesRef.current = valid; setVenues(valid); setVenueError(result.error ?? null)
    } catch { if (requestId === requestIdRef.current) setVenueError('Venue search is temporarily unavailable.') }
    finally { if (requestId === requestIdRef.current) setLoading(false) }
  }, [])

  const flyToLocation = useCallback((lat: number, lng: number, zoom = 13) => {
    locationRef.current = { lat, lng }
    mapRef.current?.flyTo({ center: [lng, lat], zoom, pitch: is3D ? 42 : 0, bearing: 0, duration: 1000, essential: true })
  }, [is3D])

  const selectVenue = useCallback((venue: Venue) => {
    const map = mapRef.current
    if (!map) return
    setTransitioning(true)
    map.flyTo({ center: [Number(venue.lng), Number(venue.lat)], zoom: 16.8, pitch: is3D ? 42 : 0, bearing: 0, duration: 700, essential: true })
    map.once('moveend', () => { setTransitioning(false); setVote(0); setSelectedVenue(venue) })
  }, [is3D])

  const getUserLocation = useCallback(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition((position) => {
      const next = { lat: position.coords.latitude, lng: position.coords.longitude }
      flyToLocation(next.lat, next.lng); void loadVenues(next.lat, next.lng, vibe); setLocating(false)
    }, () => setLocating(false), { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 })
  }, [flyToLocation, loadVenues, vibe])

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false; let map: MapInstance | null = null; let resizeObserver: ResizeObserver | null = null
    const initTimeout = window.setTimeout(() => { if (!cancelled) setMapError('The world map is taking too long to initialise. Check your connection and try again.') }, 12000)
    import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !containerRef.current) return
      maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')
      try {
        map = new maplibregl.Map({ container: containerRef.current, style: MAP_STYLE, center: [START.lng, START.lat], zoom: 12.4, pitch: 0, bearing: 0, attributionControl: { compact: true }, maxPitch: 55, fadeDuration: 120, cooperativeGestures: false, dragRotate: false, touchPitch: false, touchZoomRotate: true })
        mapRef.current = map
        const resize = () => { map?.resize() }
        resizeObserver = new ResizeObserver(resize); resizeObserver.observe(containerRef.current); requestAnimationFrame(resize)
        map.setRenderWorldCopies(false)
        map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), 'bottom-right')
        map.on('load', () => {
          if (!map) return
          window.clearTimeout(initTimeout); resize()
          map.addSource(VENUE_SOURCE, { type: 'geojson', data: venueGeoJson([]) })
          map.addLayer({ id: VENUE_HIT, type: 'circle', source: VENUE_SOURCE, paint: { 'circle-radius': 22, 'circle-color': '#000000', 'circle-opacity': 0 } })
          map.addLayer({ id: VENUE_CIRCLE, type: 'circle', source: VENUE_SOURCE, paint: { 'circle-radius': 9, 'circle-color': VIBE_TONE[vibe], 'circle-stroke-color': '#fff7d6', 'circle-stroke-width': 2, 'circle-opacity': 0.98, 'circle-blur': 0.05 } })
          map.addLayer({ id: VENUE_ICON, type: 'symbol', source: VENUE_SOURCE, layout: { 'text-field': VIBE_ICON[vibe], 'text-size': 12, 'text-anchor': 'center', 'text-allow-overlap': true, 'text-ignore-placement': true } })
          map.addLayer({ id: VENUE_LABEL, type: 'symbol', source: VENUE_SOURCE, layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-anchor': 'top', 'text-offset': [0, 1.15], 'text-max-width': 12, 'text-allow-overlap': false }, paint: { 'text-color': '#f8fafc', 'text-halo-color': '#02040a', 'text-halo-width': 1.5, 'text-opacity': 0.88 }, minzoom: 13 })

          const handleVenueClick = (event: import('maplibre-gl').MapMouseEvent) => {
            const features = map?.queryRenderedFeatures(event.point, { layers: [VENUE_HIT, VENUE_CIRCLE, VENUE_ICON, VENUE_LABEL] }) ?? []
            const feature = features[0]
            const key = feature?.properties?.key
            if (!key) return
            const venue = venuesRef.current.find((item) => String(venueKey(item)) === String(key))
            if (venue) selectVenue(venue)
          }
          const setPointer = () => { if (map) map.getCanvas().style.cursor = 'pointer' }
          const clearPointer = () => { if (map) map.getCanvas().style.cursor = '' }
          map.on('click', handleVenueClick)
          map.on('mouseenter', VENUE_HIT, setPointer); map.on('mouseleave', VENUE_HIT, clearPointer)
          map.on('mouseenter', VENUE_CIRCLE, setPointer); map.on('mouseleave', VENUE_CIRCLE, clearPointer)
          map.on('mouseenter', VENUE_ICON, setPointer); map.on('mouseleave', VENUE_ICON, clearPointer)
          map.on('mouseenter', VENUE_LABEL, setPointer); map.on('mouseleave', VENUE_LABEL, clearPointer)

          setMapReady(true); setMapError(null); void loadVenues(locationRef.current.lat, locationRef.current.lng, vibe)
          navigator.geolocation?.getCurrentPosition((position) => { const next = { lat: position.coords.latitude, lng: position.coords.longitude }; flyToLocation(next.lat, next.lng); void loadVenues(next.lat, next.lng, vibe) }, () => undefined, { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 })
        })
        map.on('error', (event) => { if (!mapReady) setMapError(event.error?.message ?? 'The world map encountered a rendering error.') })
      } catch { window.clearTimeout(initTimeout); setMapError('The world map could not initialise on this device.') }
    }).catch(() => { window.clearTimeout(initTimeout); setMapError('The map renderer could not load.') })
    return () => { cancelled = true; window.clearTimeout(initTimeout); resizeObserver?.disconnect(); map?.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (mapReady) void loadVenues(locationRef.current.lat, locationRef.current.lng, vibe) }, [vibe, mapReady, loadVenues])
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapReady) return
    const source = map.getSource(VENUE_SOURCE) as import('maplibre-gl').GeoJSONSource | undefined
    source?.setData(venueGeoJson(venues))
    if (map.getLayer(VENUE_CIRCLE)) map.setPaintProperty(VENUE_CIRCLE, 'circle-color', VIBE_TONE[vibe])
    if (map.getLayer(VENUE_ICON)) map.setLayoutProperty(VENUE_ICON, 'text-field', VIBE_ICON[vibe])
  }, [venues, vibe, mapReady])
  useEffect(() => { const map = mapRef.current; if (map && mapReady) { map.setPitch(is3D ? 42 : 0); map.setBearing(0); map.resize() } }, [is3D, mapReady])
  useEffect(() => { let cancelled = false; const { lat, lng } = locationRef.current; fetch(`/nx/weather?lat=${lat}&lng=${lng}`).then((r) => r.ok ? r.json() : null).then((data) => { if (cancelled) return; const text = data?.current?.condition ?? data?.condition ?? data?.current?.weather ?? ''; if (typeof text === 'string' && text) setWeatherLabel(text) }).catch(() => undefined); return () => { cancelled = true } }, [selectedVenue])

  const focusOut = useCallback(() => { const map = mapRef.current; if (!map) return; setSelectedVenue(null); setTransitioning(true); map.flyTo({ center: [locationRef.current.lng, locationRef.current.lat], zoom: 12.4, pitch: is3D ? 42 : 0, bearing: 0, duration: 800, essential: true }); map.once('moveend', () => setTransitioning(false)) }, [is3D])
  const countLabel = useMemo(() => `${venues.length} ${VIBE_LABEL[vibe].toLowerCase()} ${venues.length === 1 ? 'spot' : 'spots'}`, [venues.length, vibe])

  return <div className="nexus-world-root"><style jsx global>{`.nexus-world-root{position:fixed;inset:0;width:100vw;height:100dvh;min-height:100svh;overflow:hidden;background:#02040a;isolation:isolate;z-index:0}.nexus-map-host{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;overflow:hidden}.nexus-map-host .maplibregl-map,.nexus-map-host .maplibregl-canvas-container,.nexus-map-host canvas{width:100%!important;height:100%!important}.nexus-map-host .maplibregl-canvas{position:absolute!important;inset:0!important}`}</style>
    <div ref={containerRef} className="nexus-map-host" /><div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_45%,transparent_30%,rgba(2,4,10,.12)_70%,rgba(2,4,10,.5)_100%)]" />
    <div className="absolute left-4 right-4 top-5 z-30 flex items-start justify-between gap-3 pt-[env(safe-area-inset-top)]"><div className="rounded-3xl border border-amber-300/15 bg-[#05080f]/85 px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,.35)] backdrop-blur-xl"><div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.32em] text-amber-200"><Sparkles className="h-4 w-4" />NEXUS WORLD</div><div className="mt-1 text-sm text-white/70">{loading ? 'Finding nearby places…' : `${countLabel} · ${weatherLabel}`}</div></div><button type="button" onClick={getUserLocation} disabled={locating} aria-label="Use my location" className="pointer-events-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#05080f]/80 text-white/80 shadow-xl backdrop-blur-xl disabled:opacity-50"><LocateFixed className={`h-5 w-5 ${locating ? 'animate-pulse' : ''}`} /></button></div>
    <div className="pointer-events-auto absolute left-4 right-4 top-36 z-30 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">{VIBES.map((item) => { const active = item === vibe; return <button key={item} type="button" onClick={() => setVibe(item)} className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-medium backdrop-blur-xl transition-all ${active ? 'border-amber-300/50 bg-amber-300/15 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,.14)]' : 'border-white/10 bg-[#05080f]/75 text-white/65'}`}><span className="mr-2">{VIBE_ICON[item]}</span>{VIBE_LABEL[item]}</button> })}</div>
    {venueError && <div className="absolute left-4 right-4 top-52 z-30 rounded-2xl border border-rose-300/20 bg-rose-950/55 px-4 py-3 text-xs text-rose-100 backdrop-blur-xl">{venueError}</div>}{transitioning && <div className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-300/20 bg-black/60 px-4 py-2 text-[11px] tracking-widest text-amber-100 backdrop-blur-xl">LOCKING LOCATION</div>}
    {mapError && !mapReady && <div className="absolute inset-x-5 top-1/2 z-40 -translate-y-1/2 rounded-3xl border border-amber-300/20 bg-[#05080f]/90 p-5 text-center backdrop-blur-xl"><p className="text-sm font-medium text-white">Nexus World could not load</p><p className="mt-2 text-xs text-white/55">{mapError}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs text-amber-100">Retry</button></div>}
    <div className="pointer-events-auto absolute bottom-24 left-4 z-30 flex items-center gap-2 rounded-full border border-white/10 bg-[#05080f]/80 p-1.5 backdrop-blur-xl"><button type="button" onClick={() => setIs3D((value) => !value)} className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-medium transition-colors ${is3D ? 'bg-amber-300/15 text-amber-100' : 'text-white/60'}`}><Rotate3D className="h-4 w-4" />{is3D ? '2D view' : '3D view'}</button><button type="button" onClick={focusOut} className="flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-medium text-white/60"><Navigation className="h-4 w-4" />Overview</button></div>
    <VenueDetailSheet venue={selectedVenue} vibe={vibe} midpointFallback={false} vote={vote} onVote={(dir) => setVote((current) => current === dir ? 0 : dir)} onClose={() => setSelectedVenue(null)} />
  </div>
}
