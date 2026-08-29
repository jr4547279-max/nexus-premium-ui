'use client'

import { useEffect, useMemo, useState } from 'react'
import { PubCrawlPlanV2 } from './pub-crawl-plan-v2'
import type { PlannerResult } from '@/lib/planners/planner-engine'
import type { PlannerVenue } from '@/lib/planners/types'
import type { Venue } from '@/lib/venue-service'

type CrawlCandidate = Partial<Venue> & {
  id?: string
  name: string
  lat: number
  lng: number
  category?: string | null
  maps_url?: string | null
  address?: string | null
  rating?: number | null
  price_level?: string | null
  photo_url?: string | null
}

function toPlannerVenue(v: CrawlCandidate): PlannerVenue {
  const parsedPrice = v.price_level?.match(/\d+/)?.[0]
  return {
    id: v.id || v.maps_url || `${v.name}|${v.address || ''}`,
    name: v.name,
    lat: v.lat,
    lng: v.lng,
    rating: v.rating ?? 0,
    priceLevel: Math.max(1, Math.min(4, Number(parsedPrice || 2))) as PlannerVenue['priceLevel'],
    openingTime: '00:00',
    closingTime: '23:59',
    atmosphere: ['social'],
    tags: [v.category || 'venue'],
    estimatedCostPerPerson: 0,
    capacity: 'medium',
    features: [],
    distanceFromCentre: 0,
    mapsUrl: v.maps_url ?? null,
    address: v.address ?? null,
    isRealData: true,
    ratingKnown: v.rating != null,
    priceLevelKnown: !!v.price_level,
    openingHoursKnown: false,
  }
}

function distanceKm(a: PlannerVenue, b: PlannerVenue) {
  const R = 6371
  const rad = (x: number) => x * Math.PI / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function addMinutes(time: string, mins: number) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function rebuild(plan: PlannerResult, venues: PlannerVenue[]): PlannerResult {
  const original = new Map(plan.stops.map((stop) => [stop.venue?.id, stop]))
  let time = plan.stops[0]?.arrivalTime || '18:00'
  const stops = venues.map((venue, index) => {
    const previous = index ? venues[index - 1] : null
    const distance = previous ? distanceKm(previous, venue) : 0
    const walking = previous ? Math.max(1, Math.round(distance / 0.083)) : 0
    if (previous) time = addMinutes(time, walking)
    const arrivalTime = time
    const departureTime = addMinutes(arrivalTime, 42)
    time = departureTime
    const old = original.get(venue.id)
    return {
      ...(old ?? {
        score: { total: 0, breakdown: { rating: 0, distance: 0, price: 0, atmosphere: 0, openingHours: 0, capacity: 0 } },
        reason: 'Chosen by your group',
      }),
      order: index + 1,
      venue,
      arrivalTime,
      departureTime,
      walkingFromPrevious: walking,
      distanceFromPrevious: Math.round(distance * 100) / 100,
      role: index === 0 ? 'Opener' : index === venues.length - 1 ? 'Finale' : venues.length === 3 ? 'Mid-crawl' : index < Math.ceil(venues.length / 2) ? 'Building' : 'Peak',
    }
  })
  const totalDistanceKm = Math.round(stops.reduce((sum, stop) => sum + stop.distanceFromPrevious, 0) * 10) / 10
  const walkingMinutes = stops.reduce((sum, stop) => sum + stop.walkingFromPrevious, 0)
  return {
    ...plan,
    stops,
    totalDistanceKm,
    walkingMinutes,
    durationMinutes: venues.length * 42 + walkingMinutes,
    explanation: 'Your group has customised this crawl. Nexus has rebuilt the route around your chosen venue.',
    warnings: Array.from(new Set([...plan.warnings, 'This crawl includes a venue chosen by your group.'])),
    generatedAt: new Date().toISOString(),
  }
}

export function PubCrawlPlanIntegrated({ plan, onRecalculate }: { plan: PlannerResult; onRecalculate?: () => void }) {
  const [candidate, setCandidate] = useState<CrawlCandidate | null>(null)
  const [localPlan, setLocalPlan] = useState(plan)
  const [replaceOpen, setReplaceOpen] = useState(false)

  useEffect(() => setLocalPlan(plan), [plan])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<CrawlCandidate>).detail
      if (detail?.name && Number.isFinite(detail.lat) && Number.isFinite(detail.lng)) setCandidate(detail)
    }
    window.addEventListener('nexus:crawl-candidate', handler)
    window.addEventListener('nexus:add-crawl-venue', handler)
    return () => {
      window.removeEventListener('nexus:crawl-candidate', handler)
      window.removeEventListener('nexus:add-crawl-venue', handler)
    }
  }, [])

  const plannerCandidate = useMemo(() => candidate ? toPlannerVenue(candidate) : null, [candidate])

  const apply = (mode: 'add' | 'replace', order?: number) => {
    if (!plannerCandidate) return
    const current = localPlan.stops.flatMap((stop) => stop.venue ? [stop.venue] : [])
    if (!current.length) return
    let next: PlannerVenue[]
    if (mode === 'replace' && order != null) {
      next = current.map((venue, index) => index + 1 === order ? plannerCandidate : venue)
    } else {
      let bestIndex = current.length
      let bestExtra = Number.POSITIVE_INFINITY
      for (let i = 0; i < current.length; i++) {
        const before = current[i]
        const after = current[i + 1]
        const extra = after ? distanceKm(before, plannerCandidate) + distanceKm(plannerCandidate, after) - distanceKm(before, after) : distanceKm(before, plannerCandidate)
        if (extra < bestExtra) {
          bestExtra = extra
          bestIndex = i + 1
        }
      }
      next = [...current.slice(0, bestIndex), plannerCandidate, ...current.slice(bestIndex)]
    }
    setLocalPlan(rebuild(localPlan, next))
    setCandidate(null)
    setReplaceOpen(false)
  }

  return (
    <>
      <PubCrawlPlanV2 plan={localPlan} onRecalculate={onRecalculate} />
      {candidate && plannerCandidate && (
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Add venue to pub crawl" onClick={() => setCandidate(null)}>
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-primary/20 bg-[#05080f] p-5 shadow-[0_0_80px_rgba(251,191,36,0.12)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] uppercase tracking-[0.18em] text-primary font-semibold">Pub crawl</p><h3 className="text-lg font-bold mt-1">{candidate.name}</h3><p className="text-xs text-muted-foreground mt-1">Choose how this nearby venue should change your crawl.</p></div>
              <button type="button" onClick={() => setCandidate(null)} className="h-9 w-9 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center" aria-label="Close">×</button>
            </div>
            <div className="grid gap-2 mt-5">
              <button type="button" onClick={() => apply('add')} className="rounded-xl border border-primary/30 bg-primary/[0.08] p-3 text-left hover:bg-primary/[0.12]"><span className="block text-sm font-semibold">Add as a new stop</span><span className="block text-[11px] text-muted-foreground mt-0.5">Nexus inserts it where it adds the least walking.</span></button>
              <button type="button" onClick={() => setReplaceOpen(true)} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:bg-white/[0.05]"><span className="block text-sm font-semibold">Replace a stop</span><span className="block text-[11px] text-muted-foreground mt-0.5">Choose which current stop it should replace.</span></button>
            </div>
            {replaceOpen && <div className="mt-4 border-t border-white/10 pt-4 space-y-2"><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Replace…</p>{localPlan.stops.map((stop) => stop.venue && <button key={stop.order} type="button" onClick={() => apply('replace', stop.order)} className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-left hover:bg-white/[0.05] flex items-center justify-between gap-3"><span className="text-sm">{stop.order}. {stop.venue.name}</span><span className="text-[10px] text-muted-foreground">Replace</span></button>)}</div>}
          </div>
        </div>
      )}
    </>
  )
}
