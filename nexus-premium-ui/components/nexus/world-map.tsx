'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed, Navigation, Rotate3D, Sparkles, X } from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchVenues, VIBE_LABEL, type Venue, type Vibe } from '@/lib/venue-service'
import { VenueDetailSheet } from './venue-detail-sheet'

interface WorldMapProps { onNavigate: (screen: string) => void }
type MapInstance = import('maplibre-gl').Map
type MapLibre = typeof import('maplibre-gl')
type MarkerEntry = { marker: import('maplibre-gl').Marker; venue: Venue }

const START = { lat: 50.7700, lng: 0.2767 }
const VIBES: Vibe[] = ['pub', 'drinks', 'food', 'coffee', 'activity']
const VIBE_ICON: Record<Vibe, string> = { pub: '🍺', drinks: '✦', food: '🍴', coffee: '☕', activity: '◆' }
const VIBE_TONE: Record<Vibe, string> = { pub: '#f59e0b', drinks: '#fbbf24', food: '#fb7185', coffee: '#c084fc', activity: '#34d399' }
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark'

export function WorldMap({ onNavigate: _onNavigate }: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapInstance | null>(null)
  const libRef = useRef<MapLibre | null>(null)
  const markersRef = useRef<MarkerEntry[]>([])
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

  const loadVenues = useCallback(async (lat: number, lng: number, selectedVibe: Vibe) => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setVenueError(null)
    try {
      const result = await fetchVenues({ vibe: selectedVibe, lat, lng, radius: 5000, limit: 18 })
      if (requestId !== requestIdRef.current) return
      setVenues(result.venues.filter((v) => v.lat != null && v.lng != null))
      setVenueError(result.error ?? null)
    } catch {
      if (requestId === requestIdRef.current) setVenueError('Venue search is temporarily unavailable.')
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  const getUserLocation = useCallback(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition((position) => {
      const next = { lat: position.coords.latitude, lng: position.coords.longitude }
      locationRef.current = next
      mapRef.current?.flyTo({ center: [next.lng, next.lat], zoom: 13, pitch: 42, bearing: 0, duration: 1400, essential: true })
      void loadVenues(next.lat, next.lng, vibe)
      setLocating(false)
    }, () => setLocating(false), { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 })
  }, [loadVenues, vibe])

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let map: MapInstance | null = null
    const initTimeout = window.setTimeout(() => {
      if (!cancelled && !mapReady) setMapError('The world map is taking too long to initialise. Check your connection and try again.')
    }, 12000)

    import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !containerRef.current) return
      libRef.current = maplibregl
      maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

      try {
        map = new maplibregl.Map({
          container: containerRef.current,
          style: MAP_STYLE,
          center: [START.lng, START.lat],
          zoom: 3.4,
          pitch: 18,
          bearing: 0,
          attributionControl: { compact: true },
          maxPitch: 72,
          canvasContextAttributes: { antialias: true, powerPreference: 'high-performance' },
          fadeDuration: 200,
          cooperativeGestures: false,
        })
        mapRef.current = map
        map.setRenderWorldCopies(false)
        try { map.setProjection({ type: 'globe' }) } catch { /* progressive enhancement */ }
        map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: true }), 'bottom-right')

        map.on('load', () => {
          if (!map) return
          window.clearTimeout(initTimeout)
          const sourceId = 'openmaptiles'
          if (map.getSource(sourceId) && !map.getLayer('nexus-3d-buildings')) {
            const symbolLayer = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id
            try {
              map.addLayer({
                id: 'nexus-3d-buildings',
                source: sourceId,
                'source-layer': 'building',
                type: 'fill-extrusion',
                minzoom: 14,
                filter: ['!=', ['get', 'hide_3d'], true],
                paint: {
                  'fill-extrusion-color': ['interpolate', ['linear'], ['zoom'], 14, '#111a29', 17, '#1b2a40', 20, '#263a55'],
                  'fill-extrusion-opacity': 0.94,
                  'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 16, ['coalesce', ['get', 'render_height'], 9], 20, ['coalesce', ['get', 'render_height'], 12]],
                  'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                  'fill-extrusion-vertical-gradient': true,
                },
              }, symbolLayer)
            } catch (error) {
              console.warn('[NEXUS WORLD] 3D building layer unavailable', error)
            }
          }
          setMapReady(true)
          setMapError(null)
          void loadVenues(locationRef.current.lat, locationRef.current.lng, vibe)
          navigator.geolocation?.getCurrentPosition((position) => {
            locationRef.current = { lat: position.coords.latitude, lng: position.coords.longitude }
            void loadVenues(position.coords.latitude, position.coords.longitude, vibe)
          }, () => undefined, { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 })
        })

        map.on('error', (event) => {
          const message = event.error?.message ?? 'The world map encountered a rendering error.'
          console.warn('[NEXUS WORLD]', message)
          if (!mapReady) setMapError(message)
        })
      } catch (error) {
        window.clearTimeout(initTimeout)
        console.error('[NEXUS WORLD] Map initialisation failed', error)
        setMapError('The 3D world could not initialise on this device.')
      }
    }).catch((error) => {
      window.clearTimeout(initTimeout)
      console.error('[NEXUS WORLD] MapLibre import failed', error)
      setMapError('The map renderer could not load.')
    })

    return () => {
      cancelled = true
      window.clearTimeout(initTimeout)
      markersRef.current.forEach(({ marker }) => marker.remove())
      markersRef.current = []
      map?.remove()
      mapRef.current = null
      libRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (mapReady) void loadVenues(locationRef.current.lat, locationRef.current.lng, vibe)
  }, [vibe, mapReady, loadVenues])

  useEffect(() => {
    let cancelled = false
    const { lat, lng } = locationRef.current
    fetch(`/nx/weather?lat=${lat}&lng=${lng}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled) return
        const text = data?.current?.condition ?? data?.condition ?? data?.current?.weather ?? ''
        if (typeof text === 'string' && text) setWeatherLabel(text)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [selectedVenue])

  useEffect(() => {
    const map = mapRef.current
    const lib = libRef.current
    if (!map || !lib || !mapReady) return
    markersRef.current.forEach(({ marker }) => marker.remove())
    markersRef.current = []

    venues.forEach((venue) => {
      if (venue.lat == null || venue.lng == null) return
      const tone = VIBE_TONE[vibe]
      const el = document.createElement('button')
      el.type = 'button'
      el.setAttribute('aria-label', `Open ${venue.name}`)
      el.className = 'nexus-venue-marker'
      el.innerHTML = `<span class="nexus-marker-pulse"></span><span class="nexus-marker-core" style="--marker-tone:${tone}">${VIBE_ICON[vibe]}</span><span class="nexus-marker-label">${escapeHtml(venue.name)}</span>`
      el.onclick = (event) => {
        event.stopPropagation()
        setTransitioning(true)
        setSelectedVenue(null)
        map.stop()
        map.flyTo({ center: [venue.lng as number, venue.lat as number], zoom: 17.2, pitch: 66, bearing: -18, duration: 1850, essential: true })
        map.once('moveend', () => {
          setTransitioning(false)
          setVote(0)
          setSelectedVenue(venue)
        })
      }
      const marker = new lib.Marker({ element: el, anchor: 'bottom' }).setLngLat([venue.lng, venue.lat]).addTo(map)
      markersRef.current.push({ marker, venue })
    })

    return () => {
      markersRef.current.forEach(({ marker }) => marker.remove())
      markersRef.current = []
    }
  }, [venues, vibe, mapReady])

  const focusOut = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    setSelectedVenue(null)
    setTransitioning(true)
    map.flyTo({ center: [locationRef.current.lng, locationRef.current.lat], zoom: 12.4, pitch: 32, bearing: 0, duration: 1300, essential: true })
    map.once('moveend', () => setTransitioning(false))
  }, [])

  const countLabel = useMemo(() => `${venues.length} ${VIBE_LABEL[vibe].toLowerCase()} ${venues.length === 1 ? 'spot' : 'spots'}`, [venues.length, vibe])

  return (
    <div className="nexus-world relative h-full w-full overflow-hidden bg-[#02040a]">
      <style jsx global>{`
        .nexus-venue-marker{position:relative;width:34px;height:48px;border:0;background:transparent;padding:0;cursor:pointer;display:flex;align-items:flex-end;justify-content:center;filter:drop-shadow(0 0 10px rgba(251,191,36,.55));}
        .nexus-marker-core{position:relative;width:28px;height:28px;border-radius:999px;background:radial-gradient(circle at 35% 30%,#fff 0 8%,var(--marker-tone) 25%,rgba(0,0,0,.88) 72%);border:1px solid color-mix(in srgb,var(--marker-tone) 80%,white 20%);box-shadow:0 0 10px var(--marker-tone),0 0 28px color-mix(in srgb,var(--marker-tone) 55%,transparent),inset 0 0 10px rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:12px;color:white;z-index:2;}
        .nexus-marker-pulse{position:absolute;bottom:0;width:38px;height:38px;border-radius:999px;background:var(--marker-tone);opacity:.2;animation:nexusPulse 1.9s ease-out infinite;}
        .nexus-marker-label{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis;padding:4px 8px;border-radius:999px;background:rgba(3,7,14,.78);border:1px solid rgba(255,255,255,.10);backdrop-filter:blur(10px);color:rgba(255,255,255,.88);font-size:9px;font-weight:600;opacity:0;transition:opacity .18s;pointer-events:none;}
        .nexus-venue-marker:hover .nexus-marker-label,.nexus-venue-marker:focus-visible .nexus-marker-label{opacity:1;}
        @keyframes nexusPulse{0%{transform:scale(.45);opacity:.42}70%{transform:scale(1.25);opacity:0}100%{transform:scale(1.25);opacity:0}}
        @keyframes nexusCloud{0%{transform:translate3d(-10%,0,0)}50%{transform:translate3d(5%,4px,0)}100%{transform:translate3d(110%,0,0)}}
      `}</style>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden mix-blend-screen opacity-60">
        <div className="absolute -left-1/4 top-[18%] h-24 w-[58%] rounded-full bg-white/[0.055] blur-2xl" style={{ animation: 'nexusCloud 28s linear infinite' }} />
        <div className="absolute -left-1/3 top-[35%] h-32 w-[70%] rounded-full bg-slate-200/[0.045] blur-3xl" style={{ animation: 'nexusCloud 38s linear 4s infinite' }} />
        <div className="absolute -left-1/4 top-[52%] h-20 w-[55%] rounded-full bg-amber-100/[0.025] blur-2xl" style={{ animation: 'nexusCloud 31s linear 9s infinite' }} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,transparent_0%,rgba(2,4,10,.05)_45%,rgba(2,4,10,.7)_100%)]" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#02040a] via-[#02040a]/65 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#02040a] via-[#02040a]/70 to-transparent" />

      <div className="absolute left-4 right-4 top-4 z-20 flex items-start justify-between gap-3">
        <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/45 p-3 shadow-2xl backdrop-blur-xl"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-300" /><div><p className="text-[10px] font-semibold tracking-[.28em] text-amber-200/90">NEXUS WORLD</p><p className="mt-0.5 text-[11px] text-white/55">{loading ? 'Finding nearby places…' : `${countLabel} · ${weatherLabel}`}</p></div></div></div>
        <button type="button" onClick={getUserLocation} disabled={locating} className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/80 backdrop-blur-xl transition hover:border-amber-300/40 hover:text-amber-200 disabled:opacity-50" aria-label="Use my location"><LocateFixed className={`h-4 w-4 ${locating ? 'animate-pulse' : ''}`} /></button>
      </div>

      <div className="absolute left-4 right-4 top-[92px] z-20 pointer-events-auto overflow-x-auto pb-1 [scrollbar-width:none]"><div className="flex w-max gap-2">{VIBES.map((item) => { const active = item === vibe; return <button key={item} type="button" onClick={() => setVibe(item)} className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-semibold backdrop-blur-xl transition-all ${active ? 'border-amber-300/60 bg-amber-300/15 text-amber-100 shadow-[0_0_22px_rgba(251,191,36,.16)]' : 'border-white/10 bg-black/40 text-white/65 hover:border-white/20 hover:text-white'}`}><span>{VIBE_ICON[item]}</span>{VIBE_LABEL[item]}</button> })}</div></div>

      {!mapReady && !mapError && <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-300/20 bg-black/60 px-4 py-2 text-[11px] text-amber-100/80 backdrop-blur-xl"><span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-300" />Building the world…</div>}
      {mapError && <div className="absolute left-4 right-4 top-[145px] z-30 rounded-xl border border-rose-300/20 bg-black/70 px-3 py-2.5 text-[10px] text-white/75 backdrop-blur-xl"><span className="font-semibold text-rose-200">World renderer:</span> {mapError}</div>}
      {loading && mapReady && <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-300/20 bg-black/55 px-4 py-2 text-[11px] text-amber-100/80 backdrop-blur-xl"><span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-300" />Scanning the area</div>}
      {venueError && !loading && <div className="absolute left-4 right-4 top-[145px] z-20 rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-[10px] text-white/60 backdrop-blur-xl">{venueError}</div>}
      {transitioning && <div className="absolute left-1/2 top-[46%] z-30 -translate-x-1/2 rounded-full border border-amber-300/25 bg-black/55 px-4 py-2 text-[11px] font-medium tracking-wide text-amber-100 backdrop-blur-xl shadow-[0_0_35px_rgba(251,191,36,.18)]"><Rotate3D className="mr-2 inline-block h-3.5 w-3.5 animate-pulse" />Entering street level…</div>}

      <div className="absolute bottom-24 left-4 right-4 z-20 flex items-end justify-between gap-3 pointer-events-none"><div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/45 px-3 py-2.5 backdrop-blur-xl"><div className="flex items-center gap-2 text-[10px] text-white/55"><span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_10px_#fbbf24]" />Live venues<span className="text-white/20">·</span><span className="inline-flex items-center gap-1"><Navigation className="h-3 w-3" /> 3D view</span></div></div><button type="button" onClick={focusOut} className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3.5 py-2.5 text-[10px] font-medium text-white/75 backdrop-blur-xl hover:border-amber-300/30 hover:text-amber-100"><X className="h-3.5 w-3.5" /> Overview</button></div>

      <VenueDetailSheet venue={selectedVenue} vibe={vibe} midpointFallback={false} vote={vote} onVote={(direction) => setVote((current) => current === direction ? 0 : direction)} onClose={() => setSelectedVenue(null)} />
    </div>
  )
}

function escapeHtml(value: string) { return value.replace(/[&<>\'\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char)) }
