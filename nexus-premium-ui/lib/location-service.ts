/**
 * Location Service (Phase 1A)
 *
 * Browser-side only (uses navigator.geolocation). Never import this on the
 * server — call sites are in 'use client' hooks only.
 *
 * Responsibilities:
 *  - Permission detection / request
 *  - watchPosition with configurable throttle (5–10 s, default 7 s)
 *  - Minimum-distance gate to avoid redundant DB writes
 *  - Store GPS fixes via the upsert_live_location RPC
 *  - Haversine distance calculation
 *  - Latest-locations query (used by the hook)
 */

import { supabase } from './supabase'
import type {
  LiveLocation,
  LatestLocation,
  LocationPermissionStatus,
  LocationTrackingOptions,
} from './live-event-types'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS   = 7_000   // 7 s between server writes
const DEFAULT_MIN_DISTANCE  = 10      // metres; skip update if barely moved
const DEFAULT_HIGH_ACCURACY = true

// ─────────────────────────────────────────────────────────────────────────────
// Haversine distance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the great-circle distance between two WGS-84 coordinates in metres.
 */
export function haversineMetres(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R  = 6_371_000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a  =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current Geolocation permission status without prompting.
 * Falls back to 'unknown' if the Permissions API is unavailable.
 */
export async function getLocationPermission(): Promise<LocationPermissionStatus> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return 'unavailable'
  }
  if (!('permissions' in navigator)) return 'unknown'

  try {
    const result = await navigator.permissions.query({ name: 'geolocation' })
    const map: Record<PermissionState, LocationPermissionStatus> = {
      granted: 'granted',
      denied:  'denied',
      prompt:  'unknown',
    }
    return map[result.state] ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Request location permission by triggering a one-shot getCurrentPosition.
 * Resolves to 'granted' or 'denied'.
 */
export async function requestLocationPermission(): Promise<LocationPermissionStatus> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return 'unavailable'
  }

  return new Promise<LocationPermissionStatus>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) resolve('denied')
        else resolve('unknown')
      },
      { timeout: 10_000, maximumAge: 60_000 },
    )
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tracking state (module-level singleton; one active watcher per session)
// ─────────────────────────────────────────────────────────────────────────────

interface TrackingState {
  watchId:       number
  eventId:       string
  lastWriteMs:   number
  lastLat:       number | null
  lastLon:       number | null
  intervalMs:    number
  minDistanceM:  number
  onLocation?:   (loc: LatestLocation) => void
  onError?:      (err: string) => void
}

let _tracking: TrackingState | null = null

// ─────────────────────────────────────────────────────────────────────────────
// Write to Supabase
// ─────────────────────────────────────────────────────────────────────────────

async function persistLocation(
  eventId: string,
  pos: GeolocationPosition,
): Promise<LiveLocation | null> {
  const { coords, timestamp } = pos
  const { data, error } = await supabase.rpc('upsert_live_location', {
    p_event_id:    eventId,
    p_latitude:    coords.latitude,
    p_longitude:   coords.longitude,
    p_accuracy:    coords.accuracy ?? null,
    p_heading:     coords.heading  ?? null,
    p_speed:       coords.speed    ?? null,
    p_recorded_at: new Date(timestamp).toISOString(),
  })
  if (error) {
    console.error('[location-service] persistLocation failed', error)
    return null
  }
  return data as LiveLocation
}

// ─────────────────────────────────────────────────────────────────────────────
// Start / stop tracking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Begin watching the device location for a live event.
 * Returns a cleanup function — call it to stop tracking.
 *
 * Throttling: the position callback fires at the browser's rate, but we only
 * write to Supabase when BOTH:
 *   - At least `intervalMs` ms have elapsed since the last write, AND
 *   - The device has moved at least `minDistanceM` metres.
 */
export function startLocationTracking(
  eventId: string,
  opts: LocationTrackingOptions = {},
  callbacks: {
    onLocation?: (loc: LatestLocation) => void
    onError?:    (err: string) => void
  } = {},
): () => void {
  // Stop any existing session first.
  stopLocationTracking()

  const intervalMs   = opts.intervalMs    ?? DEFAULT_INTERVAL_MS
  const minDistanceM = opts.minDistanceM  ?? DEFAULT_MIN_DISTANCE
  const highAccuracy = opts.highAccuracy  ?? DEFAULT_HIGH_ACCURACY

  const handlePosition = (pos: GeolocationPosition) => {
    const state = _tracking
    if (!state) return

    const now   = Date.now()
    const { latitude, longitude } = pos.coords

    // Throttle: not enough time has passed.
    if (now - state.lastWriteMs < intervalMs) return

    // Distance gate: haven't moved enough.
    if (state.lastLat !== null && state.lastLon !== null) {
      const dist = haversineMetres(state.lastLat, state.lastLon, latitude, longitude)
      if (dist < minDistanceM) return
    }

    state.lastWriteMs = now
    state.lastLat     = latitude
    state.lastLon     = longitude

    persistLocation(eventId, pos).then((loc) => {
      if (loc && state.onLocation) {
        state.onLocation({
          user_id:     loc.user_id,
          latitude:    loc.latitude,
          longitude:   loc.longitude,
          accuracy:    loc.accuracy,
          heading:     loc.heading,
          speed:       loc.speed,
          recorded_at: loc.recorded_at,
        })
      }
    })
  }

  const handleError = (err: GeolocationPositionError) => {
    const messages: Record<number, string> = {
      [err.PERMISSION_DENIED]:  'Location permission denied',
      [err.POSITION_UNAVAILABLE]: 'Location unavailable',
      [err.TIMEOUT]:            'Location request timed out',
    }
    const msg = messages[err.code] ?? `Location error (${err.code})`
    console.error('[location-service]', msg)
    _tracking?.onError?.(msg)
  }

  const watchId = navigator.geolocation.watchPosition(
    handlePosition,
    handleError,
    {
      enableHighAccuracy: highAccuracy,
      timeout:            15_000,
      maximumAge:         0,
    },
  )

  _tracking = {
    watchId,
    eventId,
    lastWriteMs:  0,
    lastLat:      null,
    lastLon:      null,
    intervalMs,
    minDistanceM,
    onLocation:   callbacks.onLocation,
    onError:      callbacks.onError,
  }

  console.log(`[location-service] tracking started for event ${eventId}`)

  return stopLocationTracking
}

/**
 * Stop watching and clear module state.
 */
export function stopLocationTracking(): void {
  if (!_tracking) return
  navigator.geolocation.clearWatch(_tracking.watchId)
  _tracking = null
  console.log('[location-service] tracking stopped')
}

/** True if a watch is currently active. */
export function isLocationTracking(): boolean {
  return _tracking !== null
}

/** The event ID currently being tracked, or null. */
export function trackingEventId(): string | null {
  return _tracking?.eventId ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Latest-locations query
// ─────────────────────────────────────────────────────────────────────────────

export async function getLatestLocations(
  eventId: string,
): Promise<LatestLocation[]> {
  const { data, error } = await supabase.rpc('get_latest_locations', {
    p_event_id: eventId,
  })
  if (error) {
    console.error('[location-service] getLatestLocations failed', error)
    return []
  }
  return (data ?? []) as LatestLocation[]
}
