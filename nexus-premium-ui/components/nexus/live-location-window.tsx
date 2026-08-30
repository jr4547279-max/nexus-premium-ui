'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clock3, LocateFixed, MapPin, Navigation, Radio, Shield, Users, X } from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cn } from '@/lib/utils'
import { useLiveEvent } from '@/hooks/use-live-event'
import { loadSavedGoldenWindow } from '@/lib/golden-window-persistence'
import { scheduleFromGoldenWindow } from '@/lib/live-event-service'
import type { LatestLocation } from '@/lib/live-event-types'

interface LiveLocationWindowProps {
  groupId: string
}

type MapInstance = import('maplibre-gl').Map

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark'
const SOURCE_ID = 'nexus-live-members'
const CIRCLE_ID = 'nexus-live-member-circles'
const LABEL_ID = 'nexus-live-member-labels'

function geoJson(locations: LatestLocation[]) {
  return {
    type: 'FeatureCollection' as const,
    features: locations.flatMap((location) => {
      if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return []
      return [{
        type: 'Feature' as const,
        properties: { userId: location.user_id },
        geometry: { type: 'Point' as const, coordinates: [location.longitude, location.latitude] as [number, number] },
      }]
    }),
  }
}

function countdownLabel(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m ${seconds % 60}s`
}

function freshness(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 15) return 'Live now'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ago`
}

export function LiveLocationWindow({ groupId }: LiveLocationWindowProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapInstance | null>(null)
  const scheduleAttemptedRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  const {
    event,
    status,
    isLive,
    countdown,
    locations,
    members,
    isSharing,
    locationPermission,
    startSharing,
    stopSharing,
    markArrived,
    markRunningLate,
    refresh,
    error,
  } = useLiveEvent(groupId)

  // Ensure every persisted Golden Window has a corresponding live event.
  // This is idempotent at the UI level and only runs for real groups with a
  // non-stale saved window; the live-event RPC remains the security boundary.
  useEffect(() => {
    if (scheduleAttemptedRef.current || event || status || !groupId) return
    scheduleAttemptedRef.current = true
    let cancelled = false
    loadSavedGoldenWindow(groupId).then((saved) => {
      if (cancelled || !saved.window || saved.isStale) return
      return scheduleFromGoldenWindow(groupId, saved.window, {
        title: 'Nexus Golden Window',
        arrivalRadiusM: 50,
      })
    }).then((result) => {
      if (cancelled || !result || result.errorMessage) return
      void refresh()
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [event, groupId, refresh, status])

  // Never keep a GPS watcher running outside the live window.
  useEffect(() => {
    if (!isLive && isSharing) stopSharing()
  }, [isLive, isSharing, stopSharing])

  // Map lifecycle: it only needs to exist while the live event has at least
  // one visible location. The first fix determines the initial viewport.
  useEffect(() => {
    if (!isLive || locations.length === 0 || !mapContainerRef.current || mapRef.current) return
    let cancelled = false
    import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !mapContainerRef.current || locations.length === 0) return
      maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')
      const first = locations[0]
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: MAP_STYLE,
        center: [first.longitude, first.latitude],
        zoom: 14,
        attributionControl: { compact: true },
        cooperativeGestures: false,
        dragRotate: false,
        touchPitch: false,
      })
      mapRef.current = map
      map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), 'bottom-right')
      map.on('load', () => {
        if (!mapRef.current) return
        map.addSource(SOURCE_ID, { type: 'geojson', data: geoJson(locations) })
        map.addLayer({
          id: CIRCLE_ID,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-radius': 10,
            'circle-color': '#f5b83d',
            'circle-stroke-color': '#fff7d6',
            'circle-stroke-width': 2,
            'circle-opacity': 0.98,
          },
        })
        map.addLayer({
          id: LABEL_ID,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'text-field': '●',
            'text-size': 10,
            'text-anchor': 'center',
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#071019' },
        })
        setMapReady(true)
        setMapError(null)
      })
      map.on('error', (event) => setMapError(event.error?.message ?? 'Live map could not render.'))
    }).catch(() => setMapError('Live map could not load on this device.'))

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [isLive, locations.length])

  // Keep member markers moving without recreating the map.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const source = map.getSource(SOURCE_ID) as import('maplibre-gl').GeoJSONSource | undefined
    source?.setData(geoJson(locations))
    if (locations.length === 1) {
      map.easeTo({ center: [locations[0].longitude, locations[0].latitude], duration: 500 })
    }
  }, [locations, mapReady])

  const memberById = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members])
  const sharingCount = locations.length

  if (!event) return null

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-[#05080f]/80 shadow-[0_18px_60px_rgba(0,0,0,.28)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-b border-border/20 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', isLive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-primary/10 text-primary')}>
            <Radio className={cn('h-4 w-4', isLive && 'animate-pulse')} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{isLive ? 'Live meetup' : 'Live meetup ready'}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {isLive ? `${sharingCount} ${sharingCount === 1 ? 'person' : 'people'} sharing location` : `Starts in ${countdown ? countdownLabel(countdown.totalSeconds) : 'a moment'}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] text-primary">
          <Shield className="h-3 w-3" />
          Window only
        </div>
      </div>

      {isLive ? (
        <>
          <div className="relative h-64 bg-[#02040a]">
            {locations.length > 0 ? <div ref={mapContainerRef} className="absolute inset-0" /> : (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><LocateFixed className="h-5 w-5" /></div>
                <p className="text-sm font-medium">The map is waiting for locations</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Turn on live location below and your marker will appear here for the group.</p>
              </div>
            )}
            {mapError && locations.length > 0 && <div className="absolute left-3 right-3 top-3 rounded-xl border border-amber-400/20 bg-black/70 px-3 py-2 text-xs text-amber-100 backdrop-blur">{mapError}</div>}
          </div>

          <div className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/20 bg-muted/10 px-3 py-3">
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs font-medium">Your live location</p>
                  <p className="text-[10px] text-muted-foreground">Only shared while this Golden Window is live.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => isSharing ? stopSharing() : void startSharing()}
                className={cn('rounded-full px-3 py-2 text-[11px] font-semibold transition-colors', isSharing ? 'bg-emerald-500/15 text-emerald-300' : 'bg-primary text-primary-foreground')}
              >
                {isSharing ? 'Sharing' : 'Share location'}
              </button>
            </div>

            {locationPermission === 'denied' && <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">Location permission is blocked. Enable location for Nexus in your browser settings, then try again.</p>}
            {error && <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">{error}</p>}

            <div className="grid gap-2 sm:grid-cols-2">
              {members.map((member) => {
                const location = locations.find((item) => item.user_id === member.user_id)
                const presence = memberById.get(member.user_id)
                return (
                  <div key={member.user_id} className="flex items-center gap-2 rounded-xl border border-border/15 bg-muted/10 px-3 py-2">
                    <div className={cn('h-2.5 w-2.5 rounded-full', location ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.65)]' : 'bg-muted-foreground/30')} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{member.user_id === location?.user_id ? 'Sharing now' : 'Group member'}</p>
                      <p className="text-[10px] capitalize text-muted-foreground">{location ? freshness(location.recorded_at) : presence?.status?.replace('_', ' ') ?? 'Waiting'}</p>
                    </div>
                    {presence?.status === 'arrived' && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => void markArrived()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-300"><Check className="h-3.5 w-3.5" />I’m here</button>
              <button type="button" onClick={() => void markRunningLate()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200"><Clock3 className="h-3.5 w-3.5" />Running late</button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3 px-4 py-4 text-xs text-muted-foreground">
          <Clock3 className="h-4 w-4 text-primary" />
          Live location will switch on when the Golden Window starts. Everyone chooses whether to share.
        </div>
      )}
    </section>
  )
}
