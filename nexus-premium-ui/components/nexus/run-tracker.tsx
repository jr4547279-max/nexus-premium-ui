'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Nexus — Live Run Tracker
// ─────────────────────────────────────────────────────────────────────────────
// Full-screen GPS run tracking screen.
//
// States:  idle → tracking → paused → finished
//
// Map:     Leaflet / OpenStreetMap (same infra as MapPicker)
//          • Gold polyline  = planned OSRM route
//          • Green polyline = actual GPS trail recorded during run
//          • Pulsing marker = current position
//          • Flag markers   = start / finish waypoints
//
// GPS:     navigator.geolocation.watchPosition — high accuracy
//          • Skips points with accuracy > 50 m
//          • Skips jumps > 200 m between consecutive points (GPS glitch)
//          • Stops tracking when paused or finished
//          • Cleaned up on unmount (no listener leaks)
//
// Stats:   Distance (haversine sum), Time (setInterval), Pace (dist/time),
//          Speed (from GPS speed field if available, else derived),
//          Progress % (nearest-segment projection onto planned route)
//
// Privacy: GPS is never started until the user taps "Start Run".
//          Trail data is session-local only — no Supabase writes.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft, Play, Pause, Square, RotateCcw,
  MapPin, Clock, Zap, TrendingUp, Navigation,
  AlertTriangle, CheckCircle2, Loader2, WifiOff,
  Target, Flag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { GlassCard } from './glass-card'
import type { PlannerResult } from '@/lib/planners/planner-engine'
import {
  haversineKm,
  nearestPointOnRoute,
  formatPace,
  formatRunTime,
} from '@/lib/running/geo'

// ── Types ─────────────────────────────────────────────────────────────────────

type RunState  = 'idle' | 'tracking' | 'paused' | 'finished'
type GpsStatus = 'unsupported' | 'searching' | 'good' | 'weak' | 'denied' | 'error'

interface GpsTrailPoint {
  lat:       number
  lng:       number
  accuracy:  number
  timestamp: number
  speedMs?:  number   // m/s from Geolocation API, if available
}

interface RunSummary {
  distanceKm:     number
  elapsedSeconds: number
  trailPoints:    GpsTrailPoint[]
  progressPercent: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** GPS points further than this from the planned route = "off route" */
const OFF_ROUTE_THRESHOLD_KM = 0.05    // 50 m

/** Skip GPS points with accuracy worse than this */
const MAX_ACCURACY_M = 50

/** Skip GPS jumps larger than this (GPS glitch protection) */
const MAX_JUMP_KM = 0.2                // 200 m between consecutive updates

/** OSM tile layer */
const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

// ── GPS status indicator ───────────────────────────────────────────────────────

function GpsIndicator({ status }: { status: GpsStatus }) {
  const cfg = {
    unsupported: { dot: 'bg-muted-foreground', label: 'GPS Unavailable', text: 'text-muted-foreground' },
    searching:   { dot: 'bg-amber-400 animate-pulse', label: 'GPS Searching',  text: 'text-amber-400' },
    good:        { dot: 'bg-emerald-400',             label: 'GPS Good',       text: 'text-emerald-400' },
    weak:        { dot: 'bg-amber-400',               label: 'GPS Weak',       text: 'text-amber-400' },
    denied:      { dot: 'bg-red-400',                 label: 'GPS Denied',     text: 'text-red-400' },
    error:       { dot: 'bg-red-400',                 label: 'GPS Error',      text: 'text-red-400' },
  }[status]

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', cfg.dot)} />
      <span className={cn('text-[10px] font-medium uppercase tracking-wider', cfg.text)}>
        {cfg.label}
      </span>
    </div>
  )
}

// ── HUD stat cell ──────────────────────────────────────────────────────────────

function HudStat({
  label, value, unit, icon: Icon, highlight,
}: {
  label:      string
  value:      string
  unit?:      string
  icon:       React.ElementType
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon className={cn('w-3.5 h-3.5 mb-0.5', highlight ? 'text-primary' : 'text-muted-foreground')} />
      <div className="flex items-baseline gap-0.5">
        <span className={cn(
          'text-xl font-bold tabular-nums leading-none',
          highlight ? 'text-primary' : 'text-foreground',
        )}>
          {value}
        </span>
        {unit && (
          <span className="text-[10px] text-muted-foreground font-normal">{unit}</span>
        )}
      </div>
      <span className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface RunTrackerProps {
  plan:   PlannerResult
  onBack: () => void
}

export function RunTracker({ plan, onBack }: RunTrackerProps) {
  // ── Stable refs ──────────────────────────────────────────────────────────────
  const mapContainerRef = useRef<HTMLDivElement>(null)

  // Leaflet imperatives
  const mapRef              = useRef<import('leaflet').Map | null>(null)
  const plannedPolyRef      = useRef<import('leaflet').Polyline | null>(null)
  const actualPolyRef       = useRef<import('leaflet').Polyline | null>(null)
  const posMarkerRef        = useRef<import('leaflet').CircleMarker | null>(null)
  const posRingRef          = useRef<import('leaflet').CircleMarker | null>(null)

  // GPS & run lifecycle
  const watchIdRef          = useRef<number | null>(null)
  const timerRef            = useRef<ReturnType<typeof setInterval> | null>(null)
  const runStateRef         = useRef<RunState>('idle')
  const trailRef            = useRef<GpsTrailPoint[]>([])
  const distanceRef         = useRef<number>(0)
  const isFollowingRef      = useRef<boolean>(true)

  // ── React state ───────────────────────────────────────────────────────────────
  const [runState,       setRunState]       = useState<RunState>('idle')
  const [gpsStatus,      setGpsStatus]      = useState<GpsStatus>('unsupported')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [distanceKm,     setDistanceKm]     = useState(0)
  const [speedKmh,       setSpeedKmh]       = useState(0)
  const [progressPercent,setProgressPercent]= useState(0)
  const [isOffRoute,     setIsOffRoute]     = useState(false)
  const [isFollowing,    setIsFollowing]    = useState(true)
  const [permError,      setPermError]      = useState<string | null>(null)
  const [summary,        setSummary]        = useState<RunSummary | null>(null)

  // ── Route geometry ────────────────────────────────────────────────────────────
  // Use full OSRM geometry if available; fall back to sampled waypoint coordinates.
  const routeCoords: Array<[number, number]> = plan.routeGeometry?.length
    ? plan.routeGeometry
    : plan.stops
        .filter(s => s.waypoint)
        .map(s => [s.waypoint!.lng, s.waypoint!.lat])  // [lng, lat] GeoJSON order

  // Start waypoint for initial map centre
  const startWp = plan.stops.find(s => s.waypoint?.waypointType === 'start')?.waypoint
    ?? plan.stops[0]?.waypoint

  // ── Keep runStateRef in sync ──────────────────────────────────────────────────
  useEffect(() => {
    runStateRef.current = runState
  }, [runState])

  // ── Leaflet map initialization ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    // Inject Leaflet CSS once (same pattern as MapPicker)
    if (!document.getElementById('leaflet-css')) {
      const link     = document.createElement('link')
      link.id        = 'leaflet-css'
      link.rel       = 'stylesheet'
      link.href      = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
      link.crossOrigin = ''
      document.head.appendChild(link)
    }

    import('leaflet').then((L) => {
      if (!mapContainerRef.current || mapRef.current) return

      const centre: [number, number] = startWp
        ? [startWp.lat, startWp.lng]
        : [51.505, -0.09]

      const map = L.map(mapContainerRef.current, {
        center:           centre,
        zoom:             15,
        zoomControl:      false,
        attributionControl: true,
      })
      mapRef.current = map

      L.tileLayer(OSM_TILES, { maxZoom: 19 }).addTo(map)

      // ── Planned route polyline (gold) ───────────────────────────────────────
      if (routeCoords.length >= 2) {
        // Convert [lng, lat] → [lat, lng] for Leaflet
        const latlngs = routeCoords.map(([lng, lat]): [number, number] => [lat, lng])
        plannedPolyRef.current = L.polyline(latlngs, {
          color:  '#c9a030',
          weight: 4,
          opacity: 0.85,
          dashArray: undefined,
        }).addTo(map)
      }

      // ── Actual GPS trail polyline (emerald) ─────────────────────────────────
      actualPolyRef.current = L.polyline([], {
        color:  '#34d399',
        weight: 5,
        opacity: 0.9,
      }).addTo(map)

      // ── Start marker ────────────────────────────────────────────────────────
      if (startWp) {
        L.marker([startWp.lat, startWp.lng], {
          icon: L.divIcon({
            html: `<div style="
              width:20px;height:20px;border-radius:50%;
              background:#34d399;border:3px solid white;
              box-shadow:0 2px 8px rgba(0,0,0,0.4);">
            </div>`,
            iconSize:   [20, 20],
            iconAnchor: [10, 10],
            className:  '',
          }),
        }).addTo(map).bindTooltip('Start / Finish', { permanent: false })
      }

      // ── Checkpoint markers ───────────────────────────────────────────────────
      plan.stops
        .filter(s => s.waypoint?.waypointType === 'poi' || s.waypoint?.waypointType === 'checkpoint')
        .forEach(s => {
          if (!s.waypoint) return
          L.marker([s.waypoint.lat, s.waypoint.lng], {
            icon: L.divIcon({
              html: `<div style="
                width:12px;height:12px;border-radius:50%;
                background:#c9a030;border:2px solid white;
                box-shadow:0 1px 4px rgba(0,0,0,0.3);">
              </div>`,
              iconSize:   [12, 12],
              iconAnchor: [6, 6],
              className:  '',
            }),
          }).addTo(map).bindTooltip(s.waypoint.name, { permanent: false })
        })

      // ── Disable auto-follow when user manually pans ─────────────────────────
      map.on('dragstart', () => {
        isFollowingRef.current = false
        setIsFollowing(false)
      })

      // Fit map to planned route bounds
      if (plannedPolyRef.current) {
        const bounds = plannedPolyRef.current.getBounds()
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [40, 40] })
        }
      }

      setTimeout(() => map.invalidateSize(), 200)
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current         = null
      plannedPolyRef.current = null
      actualPolyRef.current  = null
      posMarkerRef.current   = null
      posRingRef.current     = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── GPS position update handler ───────────────────────────────────────────
  const handlePosition = useCallback((pos: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = pos.coords
    const speedMs = pos.coords.speed ?? undefined

    // Update GPS status
    if (accuracy > MAX_ACCURACY_M) {
      setGpsStatus('weak')
    } else {
      setGpsStatus('good')
    }

    // Update position marker (always, not just when tracking)
    if (mapRef.current) {
      import('leaflet').then((L) => {
        if (!mapRef.current) return

        if (posMarkerRef.current) {
          posMarkerRef.current.setLatLng([latitude, longitude])
          posRingRef.current?.setLatLng([latitude, longitude])
        } else {
          // Pulsing outer ring
          posRingRef.current = L.circleMarker([latitude, longitude], {
            radius:      18,
            color:       '#c9a030',
            fillColor:   '#c9a030',
            fillOpacity: 0.15,
            weight:      2,
            opacity:     0.6,
          }).addTo(mapRef.current)

          // Solid inner dot
          posMarkerRef.current = L.circleMarker([latitude, longitude], {
            radius:      8,
            color:       'white',
            fillColor:   '#c9a030',
            fillOpacity: 1,
            weight:      2.5,
          }).addTo(mapRef.current)
        }

        // Auto-follow
        if (isFollowingRef.current) {
          mapRef.current.setView([latitude, longitude], Math.max(mapRef.current.getZoom(), 16), {
            animate: true,
            duration: 0.5,
          })
        }
      })
    }

    // Only add to trail when actively tracking
    if (runStateRef.current !== 'tracking') return

    // Skip poor accuracy points
    if (accuracy > MAX_ACCURACY_M) return

    const trail = trailRef.current
    const prev  = trail[trail.length - 1]

    // GPS glitch filter: skip huge jumps
    if (prev) {
      const jump = haversineKm(prev.lat, prev.lng, latitude, longitude)
      if (jump > MAX_JUMP_KM) return
    }

    const newPoint: GpsTrailPoint = {
      lat:       latitude,
      lng:       longitude,
      accuracy,
      timestamp: pos.timestamp,
      speedMs,
    }

    const newTrail = [...trail, newPoint]
    trailRef.current = newTrail

    // Update actual trail polyline
    if (actualPolyRef.current) {
      actualPolyRef.current.setLatLngs(
        newTrail.map(p => [p.lat, p.lng] as [number, number]),
      )
    }

    // Accumulate distance
    if (prev) {
      const delta = haversineKm(prev.lat, prev.lng, latitude, longitude)
      distanceRef.current += delta
      setDistanceKm(Math.round(distanceRef.current * 1000) / 1000)
    }

    // Current speed
    if (speedMs != null && speedMs >= 0) {
      setSpeedKmh(Math.round(speedMs * 3.6 * 10) / 10)
    } else if (prev && newPoint.timestamp > prev.timestamp) {
      const dtSec  = (newPoint.timestamp - prev.timestamp) / 1000
      const distKm = haversineKm(prev.lat, prev.lng, latitude, longitude)
      const kmh    = dtSec > 0 ? (distKm / dtSec) * 3600 : 0
      setSpeedKmh(Math.round(kmh * 10) / 10)
    }

    // Route progress
    if (routeCoords.length >= 2) {
      const nearest = nearestPointOnRoute(latitude, longitude, routeCoords)
      setProgressPercent(Math.round(nearest.progressFraction * 100))
      setIsOffRoute(nearest.distanceToRouteKm > OFF_ROUTE_THRESHOLD_KM)
    }
  // routeCoords is stable (derived from plan which doesn't change)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGpsError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      setGpsStatus('denied')
      setPermError('Location permission was denied. Please allow location access in your browser settings and try again.')
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      setGpsStatus('error')
    } else {
      setGpsStatus('weak')
    }
  }, [])

  // ── GPS watch lifecycle ───────────────────────────────────────────────────
  const startGpsWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('unsupported')
      setPermError('Your browser does not support GPS/location services.')
      return
    }
    setGpsStatus('searching')
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleGpsError,
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    )
  }, [handlePosition, handleGpsError])

  const stopGpsWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  // ── Timer lifecycle ───────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds(s => s + 1)
    }, 1_000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopGpsWatch()
      stopTimer()
    }
  }, [stopGpsWatch, stopTimer])

  // ── Run controls ──────────────────────────────────────────────────────────
  const handleStartRun = useCallback(() => {
    if (!navigator.geolocation) {
      setPermError('Your browser does not support GPS/location services.')
      return
    }
    // Clear any previous run data
    trailRef.current     = []
    distanceRef.current  = 0
    setDistanceKm(0)
    setElapsedSeconds(0)
    setSpeedKmh(0)
    setProgressPercent(0)
    setIsOffRoute(false)
    setPermError(null)
    if (actualPolyRef.current) actualPolyRef.current.setLatLngs([])

    setRunState('tracking')
    startGpsWatch()
    startTimer()

    // Re-zoom to show planned route
    isFollowingRef.current = true
    setIsFollowing(true)
    if (plannedPolyRef.current && mapRef.current) {
      const bounds = plannedPolyRef.current.getBounds()
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [40, 40], animate: true })
      }
    }
  }, [startGpsWatch, startTimer])

  const handlePause = useCallback(() => {
    setRunState('paused')
    stopTimer()
    // Keep GPS watch alive so position marker stays live, but handlePosition
    // checks runStateRef so no trail points are added while paused.
  }, [stopTimer])

  const handleResume = useCallback(() => {
    setRunState('tracking')
    startTimer()
  }, [startTimer])

  const handleFinish = useCallback(() => {
    stopTimer()
    stopGpsWatch()
    setSummary({
      distanceKm:      distanceRef.current,
      elapsedSeconds,
      trailPoints:     trailRef.current,
      progressPercent,
    })
    setRunState('finished')
    setGpsStatus('searching')  // no longer tracking

    // Zoom to show full route
    if (mapRef.current) {
      const targets: Array<[number, number]> = []
      if (plannedPolyRef.current) {
        const bounds = plannedPolyRef.current.getBounds()
        if (bounds.isValid()) {
          targets.push([bounds.getNorth(), bounds.getWest()])
          targets.push([bounds.getSouth(), bounds.getEast()])
        }
      }
      trailRef.current.forEach(p => targets.push([p.lat, p.lng]))
      if (targets.length > 0 && mapRef.current) {
        import('leaflet').then((L) => {
          if (!mapRef.current) return
          const b = L.latLngBounds(targets)
          if (b.isValid()) {
            mapRef.current.fitBounds(b, { padding: [40, 40], animate: true })
          }
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopTimer, stopGpsWatch, elapsedSeconds, progressPercent])

  const handleReCentre = useCallback(() => {
    isFollowingRef.current = true
    setIsFollowing(true)
    if (posMarkerRef.current && mapRef.current) {
      const ll = posMarkerRef.current.getLatLng()
      mapRef.current.setView(ll, Math.max(mapRef.current.getZoom(), 16), {
        animate: true,
        duration: 0.5,
      })
    }
  }, [])

  // ── Derived stats ─────────────────────────────────────────────────────────
  const paceSecPerKm = distanceKm > 0.05 ? elapsedSeconds / distanceKm : 0
  const plannedDistKm = plan.totalDistanceKm ?? 0
  const remainingKm   = Math.max(0, plannedDistKm - distanceKm)
  const isTracking    = runState === 'tracking'
  const isPaused      = runState === 'paused'
  const isActive      = isTracking || isPaused

  // ── Map height based on state ─────────────────────────────────────────────
  // idle: 280px preview; tracking/paused: flex-1 (full screen); finished: 260px
  const mapHeightClass =
    runState === 'finished' ? 'h-64' :
    isActive               ? 'flex-1' :
                             'h-72'

  // ── Idle state: check geolocation support ─────────────────────────────────
  const isGeolocationAvailable = typeof navigator !== 'undefined' && 'geolocation' in navigator

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={cn(
      'flex flex-col bg-background',
      isActive ? 'h-screen overflow-hidden' : 'min-h-screen overflow-y-auto',
    )}>

      {/* ── Top header ────────────────────────────────────────────────────── */}
      {!isActive && (
        <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 border-b border-border/20 bg-background/95 backdrop-blur-sm flex-shrink-0">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-muted/30 hover:bg-muted/60 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">
              {runState === 'finished' ? '🏃 Run Complete' : '🏃 Live Run Tracker'}
            </h1>
            <p className="text-[10px] text-muted-foreground truncate">{plan.title}</p>
          </div>
          <GpsIndicator status={gpsStatus} />
        </div>
      )}

      {/* ── Overlay header during active run ──────────────────────────────── */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 pt-safe pt-3 pb-2 bg-gradient-to-b from-background/90 to-transparent pointer-events-none">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-background/80 backdrop-blur-sm border border-border/30 pointer-events-auto"
          >
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
          <GpsIndicator status={gpsStatus} />
        </div>
      )}

      {/* ── Map area ──────────────────────────────────────────────────────── */}
      <div className={cn('relative flex-shrink-0', isActive && 'flex-1')}>
        <div
          ref={mapContainerRef}
          className={cn(
            'w-full',
            isActive ? 'absolute inset-0' : mapHeightClass,
          )}
          style={!isActive ? { height: runState === 'finished' ? '260px' : '280px' } : undefined}
        />

        {/* Re-centre button */}
        {!isFollowing && (isActive || runState === 'finished') && (
          <button
            onClick={handleReCentre}
            className="absolute bottom-4 right-4 z-[900] w-10 h-10 flex items-center justify-center rounded-full bg-background/90 backdrop-blur-sm border border-border/40 shadow-lg"
          >
            <RotateCcw className="w-4 h-4 text-foreground" />
          </button>
        )}

        {/* Off-route warning — only during tracking */}
        {isOffRoute && isTracking && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[900] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/90 backdrop-blur-sm text-black text-[11px] font-semibold shadow-lg">
            <AlertTriangle className="w-3 h-3" />
            You&apos;re off route
          </div>
        )}

        {/* Paused overlay on map */}
        {isPaused && (
          <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] z-[800] flex items-center justify-center">
            <div className="px-4 py-2 rounded-full bg-background/90 border border-border/40 text-xs font-semibold text-muted-foreground">
              PAUSED
            </div>
          </div>
        )}
      </div>

      {/* ── IDLE STATE ───────────────────────────────────────────────────── */}
      {runState === 'idle' && (
        <div className="flex-1 px-4 py-4 space-y-4">

          {/* Route summary chip */}
          <div className="flex items-center gap-3 px-4 py-3 bg-muted/10 rounded-xl border border-border/20">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{plan.title}</p>
              <p className="text-[10px] text-muted-foreground">
                {plannedDistKm.toFixed(1)} km · Est. {plan.durationMinutes} min
              </p>
            </div>
          </div>

          {/* Permission explanation */}
          <GlassCard className="p-4">
            <div className="flex items-start gap-3">
              <Navigation className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-foreground mb-1">Location Access</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Nexus uses your device location to track your run and show your position
                  on the route. GPS tracking only begins when you tap{' '}
                  <span className="text-foreground font-medium">Start Run</span>.
                  Your trail is kept locally — not stored to the cloud.
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Error state */}
          {permError && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-400 leading-relaxed">{permError}</p>
            </div>
          )}

          {/* Browser unsupported */}
          {!isGeolocationAvailable && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
              <WifiOff className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-400 leading-relaxed">
                GPS is not available in this browser. Live run tracking requires a browser
                with Geolocation support, typically a mobile browser with location enabled.
              </p>
            </div>
          )}

          {/* Start button */}
          <Button
            onClick={handleStartRun}
            disabled={!isGeolocationAvailable}
            className="w-full h-14 rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg disabled:opacity-40"
          >
            <Play className="w-5 h-5 mr-2 fill-current" />
            Start Run
          </Button>

          <p className="text-[10px] text-muted-foreground text-center pb-4">
            Tap Start Run to request GPS permission and begin tracking
          </p>
        </div>
      )}

      {/* ── ACTIVE HUD (tracking + paused) ───────────────────────────────── */}
      {isActive && (
        <div className="flex-shrink-0 bg-background/95 backdrop-blur-sm border-t border-border/20 px-4 pt-3 pb-safe pb-4">

          {/* Stats grid */}
          <div className="grid grid-cols-5 gap-1 mb-3">
            <HudStat
              icon={MapPin}
              label="Distance"
              value={distanceKm.toFixed(2)}
              unit="km"
              highlight
            />
            <HudStat
              icon={Clock}
              label="Time"
              value={formatRunTime(elapsedSeconds)}
            />
            <HudStat
              icon={TrendingUp}
              label="Pace"
              value={formatPace(paceSecPerKm)}
              unit="/km"
            />
            <HudStat
              icon={Zap}
              label="Speed"
              value={speedKmh.toFixed(1)}
              unit="km/h"
            />
            <HudStat
              icon={Target}
              label="Progress"
              value={`${progressPercent}%`}
            />
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-muted/20 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
          </div>

          {/* Control buttons */}
          <div className="flex gap-2">
            {isTracking && (
              <Button
                onClick={handlePause}
                variant="outline"
                className="flex-1 h-12 rounded-xl text-xs font-semibold border-border/40"
              >
                <Pause className="w-4 h-4 mr-1.5" />
                Pause
              </Button>
            )}
            {isPaused && (
              <Button
                onClick={handleResume}
                className="flex-1 h-12 rounded-xl text-xs font-semibold bg-primary hover:bg-primary/90"
              >
                <Play className="w-4 h-4 mr-1.5 fill-current" />
                Resume
              </Button>
            )}
            <Button
              onClick={handleFinish}
              variant={isPaused ? 'default' : 'outline'}
              className={cn(
                'h-12 rounded-xl text-xs font-semibold',
                isPaused
                  ? 'flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border-red-500/30'
                  : 'px-4 border-red-500/30 text-red-400 hover:bg-red-500/10',
              )}
            >
              <Square className="w-4 h-4 mr-1.5 fill-current" />
              Finish
            </Button>
          </div>
        </div>
      )}

      {/* ── FINISHED: Run Summary ─────────────────────────────────────────── */}
      {runState === 'finished' && summary && (
        <div className="flex-1 px-4 pt-4 pb-safe pb-6 space-y-4">

          {/* Success header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Run Complete</p>
              <p className="text-[10px] text-muted-foreground">
                {summary.trailPoints.length} GPS points recorded
              </p>
            </div>
          </div>

          {/* Summary stats */}
          <GlassCard className="p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Distance</p>
                <p className="text-2xl font-bold text-primary tabular-nums">
                  {summary.distanceKm.toFixed(2)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">km</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Time</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {formatRunTime(summary.elapsedSeconds)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Avg Pace</p>
                <p className="text-lg font-semibold text-foreground tabular-nums">
                  {summary.distanceKm > 0.05
                    ? formatPace(summary.elapsedSeconds / summary.distanceKm)
                    : '--:--'}
                  <span className="text-xs font-normal text-muted-foreground ml-1">/km</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Avg Speed</p>
                <p className="text-lg font-semibold text-foreground tabular-nums">
                  {summary.elapsedSeconds > 0 && summary.distanceKm > 0
                    ? ((summary.distanceKm / summary.elapsedSeconds) * 3600).toFixed(1)
                    : '0.0'}
                  <span className="text-xs font-normal text-muted-foreground ml-1">km/h</span>
                </p>
              </div>
            </div>

            <div className="h-px bg-border/20 my-4" />

            {/* Route completion */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Route Completion</p>
                <p className="text-xs font-semibold text-foreground tabular-nums">
                  {summary.progressPercent}%
                </p>
              </div>
              <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.min(100, summary.progressPercent)}%` }}
                />
              </div>
              {plannedDistKm > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {summary.distanceKm.toFixed(2)} km of {plannedDistKm.toFixed(1)} km planned
                </p>
              )}
            </div>

            {/* Elevation note */}
            <div className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
              <TrendingUp className="w-3 h-3" />
              Elevation data unavailable (OSRM standard API)
            </div>
          </GlassCard>

          {/* Route legend */}
          <div className="flex items-center gap-4 px-1">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-1.5 rounded-full bg-primary/70" />
              <span className="text-[10px] text-muted-foreground">Planned route</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-muted-foreground">Your GPS trail</span>
            </div>
          </div>

          {/* Done button */}
          <Button
            onClick={onBack}
            className="w-full h-12 rounded-xl text-sm font-semibold"
          >
            <Flag className="w-4 h-4 mr-2" />
            Done
          </Button>
        </div>
      )}
    </div>
  )
}
