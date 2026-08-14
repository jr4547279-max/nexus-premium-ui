'use client'

/**
 * ─── NEXUS WORLD 2.0 ────────────────────────────────────────────────────────
 *
 * A living, explorable world built on real geography — not a map.
 *
 * Scope: Eastbourne + the South Downs (single breathtaking prototype).
 *
 * Stack:
 *   • MapLibre GL JS      — WebGL world renderer (vector tiles, 3D terrain,
 *                           3D building extrusion, custom atmospheric style)
 *   • OpenFreeMap         — free OSM vector tiles (buildings, roads, paths,
 *                           parks, water — full OpenStreetMap data)
 *   • AWS Terrarium DEM   — free elevation tiles → real 3D terrain, so the
 *                           South Downs literally rise from the landscape
 *   • Google Places (via existing /nx/places proxy) — living venue data
 *   • OSRM foot routing (via routing.openstreetmap.de) — Golden Paths follow
 *                           real streets and real walking routes
 *
 * Progressive reveal (never render everything at once):
 *   L1 WORLD          z <  11  terrain, coastline, water, major roads only
 *   L2 CITY           z ≥ 11   districts, parks, building footprints
 *   L3 NEIGHBOURHOOD  z ≥ 13   venues emerge as glowing lights, paths revealed
 *   L4 STREET         z ≥ 15   3D buildings rise, path detail, full lighting
 *   L5 DESTINATION    z ≥ 16.5 booking actions, golden window suggestions
 *
 * All LOD gating is done with MapLibre `minzoom` (GPU-side culling — tiles and
 * layers outside the view/zoom are never fetched or drawn), plus debounced
 * on-demand venue fetching for the current viewport only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Map as MLMap, MapLayerMouseEvent } from 'maplibre-gl'
import { Button } from '@/components/ui/button'
import {
  Navigation2, X, Star, Footprints, CalendarCheck, Sparkles,
  MapPin, Clock, Mountain, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Eastbourne / South Downs ──────────────────────────────────────────────────
const EASTBOURNE: [number, number] = [0.2906, 50.7686]
const WORLD_BOUNDS: [number, number, number, number] = [-0.45, 50.52, 0.95, 51.05]

// ── Time-of-day phases ────────────────────────────────────────────────────────
type DayPhase = 'predawn' | 'dawn' | 'day' | 'golden' | 'dusk' | 'night'

function phaseForHour(h: number): DayPhase {
  if (h < 5) return 'predawn'
  if (h < 8) return 'dawn'
  if (h < 17) return 'day'
  if (h < 19) return 'golden'
  if (h < 21) return 'dusk'
  return 'night'
}

const PHASE_LABEL: Record<DayPhase, string> = {
  predawn: 'Pre-dawn', dawn: 'Dawn', day: 'Daylight',
  golden: 'Golden hour', dusk: 'Dusk', night: 'Night',
}

/** Atmosphere overlay gradients per phase (CSS backgrounds, GPU-composited). */
const PHASE_ATMOSPHERE: Record<DayPhase, string> = {
  predawn: 'linear-gradient(to bottom, rgba(8,12,28,0.42), rgba(10,14,30,0.18) 45%, rgba(30,20,60,0.10))',
  dawn:    'linear-gradient(to bottom, rgba(40,45,90,0.24), rgba(220,140,60,0.10) 60%, rgba(255,170,80,0.16))',
  day:     'linear-gradient(to bottom, rgba(120,160,220,0.07), rgba(255,255,255,0.02) 55%, rgba(180,200,230,0.04))',
  golden:  'linear-gradient(to bottom, rgba(80,60,120,0.14), rgba(255,150,50,0.13) 55%, rgba(255,120,40,0.22))',
  dusk:    'linear-gradient(to bottom, rgba(25,20,70,0.34), rgba(90,50,110,0.16) 55%, rgba(200,90,60,0.12))',
  night:   'linear-gradient(to bottom, rgba(4,8,24,0.46), rgba(6,10,26,0.20) 50%, rgba(10,16,40,0.14))',
}

/** Sky colour fed into MapLibre's own sky/fog for horizon blending. */
const PHASE_SKY: Record<DayPhase, { sky: string; fog: string; horizon: string }> = {
  predawn: { sky: '#060a18', fog: '#0a1226', horizon: '#141c3a' },
  dawn:    { sky: '#1a2350', fog: '#3a2f4e', horizon: '#c97b3a' },
  day:     { sky: '#28436e', fog: '#3d5878', horizon: '#7d97b8' },
  golden:  { sky: '#2a2148', fog: '#5c3a2e', horizon: '#e8944a' },
  dusk:    { sky: '#131034', fog: '#2a1e44', horizon: '#8a4a56' },
  night:   { sky: '#04081a', fog: '#080e22', horizon: '#101a38' },
}

// ── LOD levels ────────────────────────────────────────────────────────────────
type LodLevel = 1 | 2 | 3 | 4 | 5
function lodForZoom(z: number): LodLevel {
  if (z < 11) return 1
  if (z < 13) return 2
  if (z < 15) return 3
  if (z < 16.5) return 4
  return 5
}
const LOD_LABEL: Record<LodLevel, string> = {
  1: 'WORLD', 2: 'CITY', 3: 'NEIGHBOURHOOD', 4: 'STREET', 5: 'DESTINATION',
}

// ── Venue model (matches /nx/places response) ────────────────────────────────
interface WorldVenue {
  name: string
  rating: number | null
  rating_count: number | null
  open_now: boolean | null
  address: string | null
  category: string | null
  distance_km: number | null
  lat: number | null
  lng: number | null
  photo_url: string | null
}

interface PathSelection {
  kind: 'path'
  distanceKm: number
  elevationHint: string
  estMinutes: number
  pathClass: string
}
interface VenueSelection {
  kind: 'venue'
  venue: WorldVenue
}
type Selection = PathSelection | VenueSelection | null

// ── The Nexus World style ─────────────────────────────────────────────────────
// Built from scratch — no Google/Apple design language. Deep-space navy world,
// warm sodium-lamp roads, parks as dark emerald, gold venue lights.
function buildWorldStyle(): Record<string, unknown> {
  return {
    version: 8,
    name: 'Nexus World',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sky: {},
    sources: {
      world: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      // Free global elevation tiles (Terrarium encoding) — real 3D terrain.
      dem: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 13,
        attribution: 'Terrain: Mapzen/AWS',
      },
    },
    layers: [
      // ── L1 WORLD — always visible ──────────────────────────────────────────
      { id: 'bg', type: 'background', paint: { 'background-color': '#07101f' } },
      {
        id: 'hillshade', type: 'hillshade', source: 'dem',
        paint: {
          'hillshade-shadow-color': '#020610',
          'hillshade-highlight-color': '#1d3050',
          'hillshade-accent-color': '#0c1830',
          'hillshade-exaggeration': 0.55,
        },
      },
      {
        id: 'landcover-green', type: 'fill', source: 'world', 'source-layer': 'landcover',
        filter: ['match', ['get', 'class'], ['grass', 'wood', 'forest', 'scrub'], true, false],
        paint: { 'fill-color': '#0a1a12', 'fill-opacity': 0.65 },
      },
      {
        id: 'park', type: 'fill', source: 'world', 'source-layer': 'park',
        paint: { 'fill-color': '#0c1e14', 'fill-opacity': 0.8 },
      },
      {
        id: 'landuse-park', type: 'fill', source: 'world', 'source-layer': 'landuse',
        filter: ['match', ['get', 'class'], ['park', 'grass', 'recreation_ground', 'pitch', 'garden', 'cemetery'], true, false],
        paint: { 'fill-color': '#0c1e14', 'fill-opacity': 0.75 },
      },
      {
        id: 'water', type: 'fill', source: 'world', 'source-layer': 'water',
        paint: { 'fill-color': '#03101f' },
      },
      {
        id: 'waterway', type: 'line', source: 'world', 'source-layer': 'waterway',
        paint: { 'line-color': '#0a2136', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 2.5] },
      },
      // Major roads — the world's arteries (visible from L1)
      {
        id: 'road-major', type: 'line', source: 'world', 'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false],
        paint: {
          'line-color': '#243a56',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 0.8, 13, 2.6, 17, 8],
        },
      },
      // ── L2 CITY (z ≥ 11) ───────────────────────────────────────────────────
      {
        id: 'road-secondary', type: 'line', source: 'world', 'source-layer': 'transportation',
        minzoom: 11,
        filter: ['match', ['get', 'class'], ['secondary', 'tertiary'], true, false],
        paint: {
          'line-color': '#1b2c44',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 11, 1, 15, 3, 18, 7],
        },
      },
      {
        id: 'building-footprint', type: 'fill', source: 'world', 'source-layer': 'building',
        minzoom: 11, maxzoom: 15,
        paint: {
          'fill-color': '#0e1c30',
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.35, 14, 0.85],
          'fill-outline-color': '#1a2c46',
        },
      },
      // ── L3 NEIGHBOURHOOD (z ≥ 13) ──────────────────────────────────────────
      {
        id: 'road-minor', type: 'line', source: 'world', 'source-layer': 'transportation',
        minzoom: 13,
        filter: ['match', ['get', 'class'], ['minor', 'residential', 'service'], true, false],
        paint: {
          'line-color': '#15233a',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 13, 0.5, 16, 2, 19, 5],
        },
      },
      // Running & walking paths — revealed as glowing gold threads
      {
        id: 'path-walk', type: 'line', source: 'world', 'source-layer': 'transportation',
        minzoom: 13,
        filter: ['match', ['get', 'class'], ['path', 'footway', 'pedestrian', 'track', 'cycleway'], true, false],
        paint: {
          'line-color': '#b8912e',
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.6, 17, 1.8],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.25, 15, 0.55],
          'line-dasharray': [1.2, 2.2],
        },
      },
      // Sodium-lamp glow bleeding out of major streets (night ambience)
      {
        id: 'street-glow', type: 'line', source: 'world', 'source-layer': 'transportation',
        minzoom: 13,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false],
        paint: {
          'line-color': '#c9a030',
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 4, 17, 14],
          'line-opacity': 0.05,
          'line-blur': 6,
        },
      },
      // ── L4 STREET (z ≥ 15) — the city rises into 3D ────────────────────────
      {
        id: 'building-3d', type: 'fill-extrusion', source: 'world', 'source-layer': 'building',
        minzoom: 15,
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6],
            0, '#0d1a2c', 12, '#122238', 30, '#182c48', 80, '#1f3758',
          ],
          'fill-extrusion-height': [
            // LOD: buildings grow out of the ground as you cross into L4
            'interpolate', ['linear'], ['zoom'],
            15, 0,
            15.6, ['coalesce', ['get', 'render_height'], 6],
          ],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.92,
        },
      },
      // Illuminated windows: thin gold caps on taller buildings at street level
      {
        id: 'building-crown', type: 'fill-extrusion', source: 'world', 'source-layer': 'building',
        minzoom: 15.5,
        filter: ['>', ['coalesce', ['get', 'render_height'], 0], 14],
        paint: {
          'fill-extrusion-color': '#8a6b1e',
          'fill-extrusion-height': ['+', ['coalesce', ['get', 'render_height'], 14], 0.6],
          'fill-extrusion-base': ['coalesce', ['get', 'render_height'], 14],
          'fill-extrusion-opacity': 0.45,
        },
      },
      // ── Labels — restrained, luxurious ─────────────────────────────────────
      {
        id: 'label-place', type: 'symbol', source: 'world', 'source-layer': 'place',
        filter: ['match', ['get', 'class'], ['city', 'town', 'village', 'suburb'], true, false],
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10.5, 13, 14],
          'text-letter-spacing': 0.15,
          'text-transform': 'uppercase',
        },
        paint: {
          'text-color': '#93a3b8',
          'text-halo-color': '#060e1c',
          'text-halo-width': 1.4,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.75, 15, 0.35],
        },
      },
      {
        id: 'label-park', type: 'symbol', source: 'world', 'source-layer': 'park',
        minzoom: 12,
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Noto Sans Italic'],
          'text-size': 10.5,
          'text-letter-spacing': 0.08,
        },
        paint: { 'text-color': '#4e7a5e', 'text-halo-color': '#060e1c', 'text-halo-width': 1.2 },
      },
    ],
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface WorldMapProps {
  onBack?: () => void
  onNavigate?: (screen: string) => void
}

export function WorldMap({ onNavigate }: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const rafRef = useRef<number>(0)
  const starsRef = useRef<HTMLCanvasElement>(null)
  const venuesRef = useRef<WorldVenue[]>([])
  const fetchSeqRef = useRef(0)
  const routeSeqRef = useRef(0)
  const disposedRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [ready, setReady] = useState(false)
  const [webglError, setWebglError] = useState(false)
  const [lod, setLod] = useState<LodLevel>(2)
  const [phase, setPhase] = useState<DayPhase>(() => phaseForHour(new Date().getHours()))
  const [selection, setSelection] = useState<Selection>(null)
  const [goldenPathActive, setGoldenPathActive] = useState(false)
  const [fetchingVenues, setFetchingVenues] = useState(false)
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))

  // ── Day/night cycle — react to real local time, refresh every 30 s ─────────
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setPhase(phaseForHour(now.getHours()))
      setClock(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    }
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  // ── Night stars — lightweight canvas, drawn once, twinkle via CSS ──────────
  useEffect(() => {
    const canvas = starsRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * w
      const y = Math.random() * h * 0.5 // upper half only
      const r = Math.random() * 1.1 + 0.2
      const a = Math.random() * 0.5 + 0.15
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(220,228,255,${a})`
      ctx.fill()
    }
  }, [])

  // ── Venue fetch for current viewport (on-demand, debounced, deduped) ──────
  const fetchVenuesForView = useCallback(async (map: MLMap) => {
    if (map.getZoom() < 13) return // L1/L2 — no venues in the world yet
    const c = map.getCenter()
    const seq = ++fetchSeqRef.current
    setFetchingVenues(true)
    try {
      // Two vibes gives a richer world: food + drinks around the viewport.
      const [food, drinks] = await Promise.all([
        fetch(`/nx/places?vibe=food&lat=${c.lat.toFixed(4)}&lng=${c.lng.toFixed(4)}&radius=2500&limit=10`).then(r => r.json()),
        fetch(`/nx/places?vibe=drinks&lat=${c.lat.toFixed(4)}&lng=${c.lng.toFixed(4)}&radius=2500&limit=10`).then(r => r.json()),
      ])
      if (seq !== fetchSeqRef.current || disposedRef.current) return // stale — superseded or unmounted
      const seen = new Set<string>()
      const all: WorldVenue[] = []
      for (const v of [...(food.venues ?? []), ...(drinks.venues ?? [])]) {
        if (v.lat == null || v.lng == null) continue
        const key = `${v.name}|${v.lat.toFixed(5)}`
        if (seen.has(key)) continue
        seen.add(key)
        all.push(v)
      }
      venuesRef.current = all
      const src = map.getSource('venues') as { setData?: (d: unknown) => void } | undefined
      src?.setData?.({
        type: 'FeatureCollection',
        features: all.map((v, i) => ({
          type: 'Feature',
          id: i,
          geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
          properties: {
            idx: i,
            name: v.name,
            category: v.category ?? '',
            open: v.open_now === true ? 1 : 0,
            rating: v.rating ?? 0,
          },
        })),
      })
    } catch {
      // Non-fatal — the world simply stays quiet here
    } finally {
      if (seq === fetchSeqRef.current && !disposedRef.current) setFetchingVenues(false)
    }
  }, [])

  // ── Golden Path — an illuminated route along real streets ─────────────────
  const drawGoldenPath = useCallback(async (map: MLMap, to: [number, number]) => {
    const from = map.getCenter()
    const seq = ++routeSeqRef.current
    try {
      const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/` +
        `${from.lng},${from.lat};${to[0]},${to[1]}?overview=full&geometries=geojson`
      const res = await fetch(url)
      const json = await res.json()
      // Stale guard: a newer route request, a close, or unmount supersedes us.
      if (seq !== routeSeqRef.current || disposedRef.current || mapRef.current !== map) return
      const coords: [number, number][] = json?.routes?.[0]?.geometry?.coordinates
      if (!coords?.length) return
      const src = map.getSource('golden-path') as { setData?: (d: unknown) => void } | undefined
      src?.setData?.({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      })
      setGoldenPathActive(true)

      // Gentle pulse: animate dash offset via line-dasharray cycling
      let step = 0
      const dashSeq = [
        [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5],
        [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5],
      ]
      cancelAnimationFrame(rafRef.current)
      let lastT = 0
      const animate = (t: number) => {
        // Stop permanently if superseded or torn down
        if (seq !== routeSeqRef.current || disposedRef.current || mapRef.current !== map) return
        if (t - lastT > 90) {
          step = (step + 1) % dashSeq.length
          try {
            map.setPaintProperty('golden-path-core', 'line-dasharray', dashSeq[step])
          } catch { /* layer removed mid-animation */ }
          lastT = t
        }
        rafRef.current = requestAnimationFrame(animate)
      }
      rafRef.current = requestAnimationFrame(animate)
    } catch {
      // Routing unavailable — draw nothing rather than a fake straight line
    }
  }, [])

  const clearGoldenPath = useCallback((map: MLMap | null) => {
    routeSeqRef.current++ // invalidate any in-flight route + its animation loop
    cancelAnimationFrame(rafRef.current)
    setGoldenPathActive(false)
    const src = map?.getSource('golden-path') as { setData?: (d: unknown) => void } | undefined
    src?.setData?.({ type: 'FeatureCollection', features: [] })
  }, [])

  // ── Map bootstrap ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false
    disposedRef.current = false // reset after Strict Mode remount

    import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !containerRef.current || mapRef.current) return

      // MapLibre CSS (once)
      if (!document.getElementById('maplibre-css')) {
        const link = document.createElement('link')
        link.id = 'maplibre-css'
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css'
        document.head.appendChild(link)
      }

      // WebGL2 capability check — do NOT call loseContext() since that can
      // exhaust the shared context pool on mobile before MapLibre creates its own.
      const probeCanvas = document.createElement('canvas')
      const probe = probeCanvas.getContext('webgl2')
      if (!probe) {
        setWebglError(true)
        return
      }

      // MapLibre's GPUInitializationError is thrown asynchronously during
      // internal painter setup, so a try/catch around the constructor is not
      // sufficient. We install an 'error' listener first, then construct.
      let map: MLMap
      try {
        map = new maplibregl.Map({
          container: containerRef.current!,
          style: buildWorldStyle() as never,
          center: EASTBOURNE,
          zoom: 12.4,
          pitch: 52,
          bearing: -14,
          maxBounds: WORLD_BOUNDS,
          minZoom: 9,
          maxZoom: 18.5,
          attributionControl: false,
          maxPitch: 70,
          fadeDuration: 450,
        })
      } catch (err) {
        console.error('[world] Map constructor failed:', (err as Error).message)
        setWebglError(true)
        return
      }

      // Catch async GPU errors (e.g. GPUInitializationError fired after construction).
      // Use unknown + cast because MapLibre v6's Event type doesn't expose `.error`.
      map.once('error', ((e: unknown) => {
        const msg = (e as { error?: Error })?.error?.message ?? ''
        if (msg.toLowerCase().includes('webgl') || msg.toLowerCase().includes('gpu')) {
          setWebglError(true)
          try { map.remove() } catch { /* already dead */ }
          mapRef.current = null
        }
      }) as Parameters<typeof map.once>[1])

      mapRef.current = map

      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

      map.on('load', () => {
        if (cancelled) return

        // ── Real 3D terrain: the South Downs rise from the landscape ────────
        try {
          map.setTerrain({ source: 'dem', exaggeration: 1.35 })
        } catch { /* terrain unsupported → hillshade still conveys relief */ }

        // Horizon fog + sky — atmospheric depth at pitch
        const sky = PHASE_SKY[phaseForHour(new Date().getHours())]
        try {
          map.setSky({
            'sky-color': sky.sky,
            'horizon-color': sky.horizon,
            'fog-color': sky.fog,
            'sky-horizon-blend': 0.6,
            'horizon-fog-blend': 0.65,
            'fog-ground-blend': 0.72,
          } as never)
        } catch { /* older maplibre — fine without sky */ }

        // ── Venue constellation: glowing lights, not pins ────────────────────
        map.addSource('venues', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        // Outer glow halo
        map.addLayer({
          id: 'venue-glow', type: 'circle', source: 'venues', minzoom: 13,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 7, 16, 16, 18, 26],
            'circle-color': ['case', ['==', ['get', 'open'], 1], '#c9a030', '#5a6f8f'],
            'circle-opacity': 0.16,
            'circle-blur': 1,
          },
        })
        // Light core
        map.addLayer({
          id: 'venue-core', type: 'circle', source: 'venues', minzoom: 13,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.4, 16, 4.5, 18, 7],
            'circle-color': ['case', ['==', ['get', 'open'], 1], '#e8c04a', '#8fa3bd'],
            'circle-opacity': 0.95,
            'circle-stroke-width': 1,
            'circle-stroke-color': 'rgba(255,235,180,0.35)',
          },
        })
        // Venue names surface only at L4+ — discovery, not clutter
        map.addLayer({
          id: 'venue-name', type: 'symbol', source: 'venues', minzoom: 15.2,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 10.5,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
            'text-max-width': 9,
            'text-optional': true,
          },
          paint: {
            'text-color': '#d8c78e',
            'text-halo-color': '#060e1c',
            'text-halo-width': 1.3,
          },
        })

        // ── Golden Path source + layers ──────────────────────────────────────
        map.addSource('golden-path', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: 'golden-path-halo', type: 'line', source: 'golden-path',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#c9a030', 'line-width': 10, 'line-opacity': 0.18, 'line-blur': 6 },
        })
        map.addLayer({
          id: 'golden-path-core', type: 'line', source: 'golden-path',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#f0cf6a', 'line-width': 2.6, 'line-opacity': 0.95,
            'line-dasharray': [0, 4, 3],
          },
        })

        // ── Interactions ─────────────────────────────────────────────────────
        map.on('click', 'venue-core', (e: MapLayerMouseEvent) => {
          const idx = Number(e.features?.[0]?.properties?.idx ?? -1)
          const v = venuesRef.current[idx]
          if (v) {
            setSelection({ kind: 'venue', venue: v })
            if (v.lat != null && v.lng != null) {
              map.easeTo({ center: [v.lng, v.lat], zoom: Math.max(map.getZoom(), 16), duration: 900 })
            }
          }
        })
        map.on('click', 'venue-glow', (e: MapLayerMouseEvent) => {
          const idx = Number(e.features?.[0]?.properties?.idx ?? -1)
          const v = venuesRef.current[idx]
          if (v) setSelection({ kind: 'venue', venue: v })
        })

        // Tap a golden thread (path) → running-route intelligence
        map.on('click', 'path-walk', (e: MapLayerMouseEvent) => {
          const f = e.features?.[0]
          if (!f?.geometry || f.geometry.type !== 'LineString') return
          const coords = f.geometry.coordinates as [number, number][]
          let dKm = 0
          for (let i = 1; i < coords.length; i++) {
            const [x1, y1] = coords[i - 1]
            const [x2, y2] = coords[i]
            const dx = (x2 - x1) * 111.32 * Math.cos((y1 * Math.PI) / 180)
            const dy = (y2 - y1) * 110.57
            dKm += Math.sqrt(dx * dx + dy * dy)
          }
          const cls = String(f.properties?.class ?? 'path')
          setSelection({
            kind: 'path',
            distanceKm: Math.max(dKm, 0.05),
            elevationHint: 'follows local terrain',
            estMinutes: Math.round((dKm / 9) * 60), // ~9 km/h easy run
            pathClass: cls,
          })
        })

        // Cursor affordances
        for (const layer of ['venue-core', 'venue-glow', 'path-walk']) {
          map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
        }

        // ── Progressive reveal driver ────────────────────────────────────────
        map.on('zoom', () => setLod(lodForZoom(map.getZoom())))
        setLod(lodForZoom(map.getZoom()))

        // On-demand venue loading, debounced on moveend
        map.on('moveend', () => {
          clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => fetchVenuesForView(map), 450)
        })
        fetchVenuesForView(map)

        setReady(true)

        // Cinematic entrance: drift down toward the town like arriving from altitude
        map.easeTo({ zoom: 13.6, pitch: 58, bearing: -8, duration: 3800 })
      })
    })

    return () => {
      cancelled = true
      disposedRef.current = true
      fetchSeqRef.current++   // invalidate in-flight venue fetches
      routeSeqRef.current++   // invalidate in-flight route + animation loop
      clearTimeout(debounceRef.current)
      cancelAnimationFrame(rafRef.current)
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update sky colours when the day phase changes (map already loaded)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const sky = PHASE_SKY[phase]
    try {
      map.setSky({
        'sky-color': sky.sky,
        'horizon-color': sky.horizon,
        'fog-color': sky.fog,
        'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.65,
        'fog-ground-blend': 0.72,
      } as never)
    } catch { /* older maplibre */ }
  }, [phase, ready])

  const handleFlyHome = useCallback(() => {
    mapRef.current?.flyTo({ center: EASTBOURNE, zoom: 13.6, pitch: 58, bearing: -8, duration: 2200 })
  }, [])

  const handleSouthDowns = useCallback(() => {
    // Beachy Head / the Downs — terrain showcase
    mapRef.current?.flyTo({ center: [0.244, 50.740], zoom: 12.6, pitch: 66, bearing: 40, duration: 2600 })
  }, [])

  const closeSelection = useCallback(() => {
    setSelection(null)
    clearGoldenPath(mapRef.current)
  }, [clearGoldenPath])

  const isNightish = phase === 'night' || phase === 'predawn' || phase === 'dusk'

  return (
    <div className="nexus-world fixed inset-0 overflow-hidden bg-[#07101f]">
      {/* ── The world ── */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* ── Star field (night only) ── */}
      <canvas
        ref={starsRef}
        className={cn(
          'absolute inset-0 w-full h-full transition-opacity duration-[3000ms] world-stars',
          isNightish ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* ── Atmosphere — day/night colour grade ── */}
      <div
        className="absolute inset-0 transition-[background] duration-[3000ms]"
        style={{ background: PHASE_ATMOSPHERE[phase], pointerEvents: 'none' }}
        data-decorative
      />

      {/* ── Drifting clouds ── */}
      <div className="absolute inset-0 overflow-hidden" style={{ pointerEvents: 'none' }} data-decorative>
        {[
          { top: '6%', scale: 1.15, dur: '95s',  delay: '0s',   op: 0.10 },
          { top: '14%', scale: 0.8, dur: '140s', delay: '-40s', op: 0.08 },
          { top: '3%',  scale: 1.4, dur: '120s', delay: '-75s', op: 0.07 },
          { top: '22%', scale: 0.65, dur: '170s', delay: '-20s', op: 0.06 },
        ].map((c, i) => (
          <div
            key={i}
            className="world-cloud absolute"
            style={{
              top: c.top,
              animationDuration: c.dur,
              animationDelay: c.delay,
              opacity: phase === 'day' || phase === 'dawn' ? c.op * 1.8 : c.op,
              transform: `scale(${c.scale})`,
            }}
          >
            <svg width="340" height="90" viewBox="0 0 340 90" fill="none">
              <ellipse cx="80" cy="58" rx="80" ry="26" fill="white" />
              <ellipse cx="160" cy="44" rx="95" ry="32" fill="white" />
              <ellipse cx="250" cy="56" rx="85" ry="26" fill="white" />
            </svg>
          </div>
        ))}
      </div>

      {/* ── Top HUD ── */}
      <div className="absolute top-0 left-0 right-0 z-20 px-4 pt-4 pointer-events-none">
        <div className="flex items-start justify-between">
          <div className="glass-card rounded-2xl px-3.5 py-2.5">
            <p className="text-[10px] tracking-[0.3em] text-primary font-semibold">NEXUS WORLD</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <p className="text-[10px] text-muted-foreground tracking-widest">{LOD_LABEL[lod]}</p>
              {fetchingVenues && <Loader2 className="w-2.5 h-2.5 text-muted-foreground animate-spin" />}
            </div>
          </div>
          <div className="glass-card rounded-2xl px-3.5 py-2.5 text-right">
            <p className="text-xs font-semibold text-foreground">{clock}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{PHASE_LABEL[phase]}</p>
          </div>
        </div>
      </div>

      {/* ── Discovery hint (only before first selection, L1–L2) ── */}
      {ready && lod <= 2 && !selection && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-10 pointer-events-none animate-fade-in-up">
          <p className="text-[11px] text-foreground/60 tracking-wide glass-card rounded-full px-4 py-1.5">
            Drift closer — the town will reveal itself
          </p>
        </div>
      )}

      {/* ── World controls ── */}
      <div className="absolute right-3 bottom-36 z-20 flex flex-col gap-2">
        <button
          onClick={handleFlyHome}
          className="w-11 h-11 rounded-full glass-card flex items-center justify-center hover:border-primary/40 transition-colors"
          aria-label="Return to Eastbourne"
        >
          <Navigation2 className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
        </button>
        <button
          onClick={handleSouthDowns}
          className="w-11 h-11 rounded-full glass-card flex items-center justify-center hover:border-primary/40 transition-colors"
          aria-label="Fly to the South Downs"
        >
          <Mountain className="w-4.5 h-4.5 text-foreground/80" style={{ width: 18, height: 18 }} />
        </button>
      </div>

      {/* ── Selection panel — contextual actions, not info cards ── */}
      {selection && (
        <div className="absolute bottom-20 left-0 right-0 z-30 px-3 animate-fade-in-up">
          <div className="glass-card rounded-3xl p-4 max-w-md mx-auto border-primary/20">
            {selection.kind === 'venue' ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{selection.venue.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {selection.venue.category && (
                        <span className="text-[10px] text-muted-foreground">{selection.venue.category}</span>
                      )}
                      {selection.venue.rating && (
                        <span className="flex items-center gap-0.5 text-[10px] text-primary">
                          <Star className="w-2.5 h-2.5 fill-current" />
                          {selection.venue.rating.toFixed(1)}
                        </span>
                      )}
                      {selection.venue.open_now === true && (
                        <span className="text-[10px] text-emerald-400">Open now</span>
                      )}
                    </div>
                  </div>
                  <button onClick={closeSelection} className="p-1.5 rounded-full hover:bg-muted/40 -mt-1 -mr-1">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                {/* The Golden Window whisper */}
                <div className="mt-3 flex items-center gap-2 bg-primary/8 border border-primary/15 rounded-2xl px-3 py-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                  <p className="text-[11px] text-foreground/80">
                    {selection.venue.open_now === true
                      ? "This matches your group's Golden Window."
                      : 'Saturday evening looks ideal for your group.'}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => onNavigate?.('groups')}
                    className="h-10 rounded-xl bg-primary text-primary-foreground text-xs glow-gold"
                  >
                    <CalendarCheck className="w-3.5 h-3.5 mr-1.5" />
                    Book for Saturday?
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const v = selection.venue
                      if (v.lat != null && v.lng != null && mapRef.current) {
                        drawGoldenPath(mapRef.current, [v.lng, v.lat])
                      }
                    }}
                    className="h-10 rounded-xl border-primary/30 text-xs"
                  >
                    <MapPin className="w-3.5 h-3.5 mr-1.5" />
                    {goldenPathActive ? 'Path illuminated' : 'Light the way'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/12 border border-primary/25 flex items-center justify-center">
                      <Footprints className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground capitalize">
                        {selection.pathClass === 'cycleway' ? 'Cycle path' : 'Walking & running path'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">A golden thread through the world</p>
                    </div>
                  </div>
                  <button onClick={closeSelection} className="p-1.5 rounded-full hover:bg-muted/40 -mt-1 -mr-1">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-muted/12 border border-border/25 p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Segment</p>
                    <p className="text-sm font-semibold text-foreground">{selection.distanceKm.toFixed(1)} km</p>
                  </div>
                  <div className="rounded-xl bg-muted/12 border border-border/25 p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Est. run</p>
                    <p className="text-sm font-semibold text-foreground">
                      {selection.estMinutes < 1 ? '<1' : selection.estMinutes} min
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/12 border border-border/25 p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Elevation</p>
                    <p className="text-[11px] font-medium text-foreground/80 leading-tight mt-0.5">Terrain-true</p>
                  </div>
                </div>

                <Button
                  onClick={() => onNavigate?.('groups')}
                  className="mt-3 w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs glow-gold"
                >
                  <Clock className="w-3.5 h-3.5 mr-1.5" />
                  Plan a group run here
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── WebGL unavailable fallback ── */}
      {webglError && (
        <div className="absolute inset-0 z-40 bg-[#07101f] flex flex-col items-center justify-center gap-4 px-8 text-center">
          <Mountain className="w-8 h-8 text-primary/60" />
          <p className="text-sm font-medium text-foreground">This world needs WebGL2</p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
            Your browser doesn&apos;t support 3D rendering. Try a modern browser
            like Chrome, Safari, or Firefox to enter Nexus World.
          </p>
        </div>
      )}

      {/* ── Loading veil ── */}
      {!ready && !webglError && (
        <div className="absolute inset-0 z-40 bg-[#07101f] flex flex-col items-center justify-center gap-4">
          <div className="w-14 h-14 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
          <p className="text-[11px] tracking-[0.35em] text-muted-foreground">ENTERING NEXUS WORLD</p>
        </div>
      )}
    </div>
  )
}
