'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { GlassCard } from './glass-card'
import { Star, MapPin, Sparkles, ThumbsUp, ThumbsDown, ExternalLink, Navigation, AlertTriangle, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  fetchVenues,
  computeMidpoint,
  buildDirectionsUrl,
  VIBE_LABEL,
  venueSelectionKey,
  type Vibe,
  type Venue,
} from '@/lib/venue-service'
import { VenueDetailSheet } from './venue-detail-sheet'
import { VenuePhoto } from './venue-photo'
import type { Weather } from '@/lib/weather-service'
import { confirmNexusPlan, createGoldenWindowPlan, recordVenueVote } from '@/lib/plan-service'
import {
  detectActivityIntent,
  rankVenues,
  suggestWeatherAlternatives,
  type ActivityIntent,
  type ScoredVenueResult,
} from '@/lib/activity-intelligence'

interface Props {
  groupName: string | null
  groupId?: string
  activityId?: string
  /** Real Golden Window context, used to drive weather/openness scoring. */
  goldenWindow?: {
    day_of_week: number
    start_time: string
    end_time: string
    days_until?: number
  } | null
  /**
   * Group planning location — takes priority over memberCoords for the
   * venue search midpoint. When present, this is the real coordinates
   * the group has set via the map picker (stored by the Nexus API).
   */
  planningLocation?: { lat: number; lng: number } | null
  /** Future-proof: when member coords exist, pass them and the midpoint will shift. */
  memberCoords?: Array<{ lat: number; lng: number }>
  /** Phase 6A — real weather around the Golden Window, used for light scoring. */
  weather?: Weather | null
  /** User query or description (optional). */
  userQuery?: string | null
  /** User preference IDs from onboarding. */
  preferenceIds?: string[]
}

const VIBES: Vibe[] = ['pub', 'drinks', 'food', 'coffee', 'activity']
const VenuesMap = dynamic(() => import('./venues-map'), { ssr: false, loading: () => <div className="h-[240px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" /> })

const ACTIVITY_VIBE: Record<string, Vibe> = {
  'pub-crawl': 'pub',
  'cocktail-bar': 'drinks',
  'restaurant': 'food',
  'brunch': 'food',
  'coffee': 'coffee',
  'gym': 'activity',
  'swimming': 'activity',
  'beach': 'activity',
  'picnic': 'activity',
  'board-games': 'activity',
  'cinema': 'activity',
  'bowling': 'activity',
  'live-music': 'activity',
  'escape-room': 'activity',
}

export function VenueRecommendations({
  groupName,
  groupId,
  activityId,
  goldenWindow,
  planningLocation,
  memberCoords,
  weather,
  userQuery,
  preferenceIds,
}: Props) {
  // ── Activity Intelligence ──────────────────────────────────────────────────
  const hourOfDay = useMemo(() => {
    if (!goldenWindow?.start_time) return null
    const parts = goldenWindow.start_time.split(':')
    return parts[0] != null ? Number.parseInt(parts[0], 10) : null
  }, [goldenWindow?.start_time])

  const intent: ActivityIntent = useMemo(
    () =>
      detectActivityIntent({
        groupName,
        userQuery,
        weather,
        hourOfDay,
        preferenceIds,
      }),
    [groupName, userQuery, weather, hourOfDay, preferenceIds],
  )

  // User can override the inferred vibe — chips let them do that.
  const activityVibe = activityId ? ACTIVITY_VIBE[activityId] : undefined
  const requestedVibe = activityVibe ?? intent.vibe
  const [vibe, setVibe] = useState<Vibe>(requestedVibe)

  // Re-sync vibe chip when intent changes (e.g. weather arrives after mount).
  useEffect(() => {
    setVibe(requestedVibe)
  }, [requestedVibe])

  useEffect(() => {
    planIdRef.current = null
    setPlanId(null)
    setVotes({})
    setVenueRecordIds({})
    setLikedVenues({})
    setConfirmedVenueName(null)
  }, [groupId, goldenWindow?.day_of_week, goldenWindow?.start_time, goldenWindow?.end_time])

  // ── Data fetching ──────────────────────────────────────────────────────────
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [usingFallback, setUsingFallback] = useState(true)
  const [votes, setVotes] = useState<Record<string, 1 | -1 | 0>>({})
  const [venueSource, setVenueSource] = useState<string | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const planIdRef = useRef<string | null>(null)
  const [venueRecordIds, setVenueRecordIds] = useState<Record<string, string>>({})
  const [likedVenues, setLikedVenues] = useState<Record<string, Venue>>({})
  const [savingVote, setSavingVote] = useState<string | null>(null)
  const [confirmingPlan, setConfirmingPlan] = useState(false)
  const [confirmedVenueName, setConfirmedVenueName] = useState<string | null>(null)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [selectedMapVenueId, setSelectedMapVenueId] = useState<string | null>(null)
  const [recalibrationSeed, setRecalibrationSeed] = useState(0)

  useEffect(() => {
    const handleRecalibrate = () => setRecalibrationSeed(Date.now())
    window.addEventListener('nexus:recalibrate-venues', handleRecalibrate)
    return () => window.removeEventListener('nexus:recalibrate-venues', handleRecalibrate)
  }, [])

  // Weather alternatives state
  const [showAlternatives, setShowAlternatives] = useState(false)
  const [altLoading, setAltLoading] = useState(false)
  const [altVenues, setAltVenues] = useState<Venue[]>([])
  const weatherAlt = useMemo(
    () => suggestWeatherAlternatives(weather ?? null, intent),
    [weather, intent],
  )

  // Midpoint priority:
  //   1. planningLocation — group's real saved location (from map picker / Nexus API)
  //   2. memberCoords     — individual member coordinates (future feature)
  //   3. fallback         — no location set; show a prompt instead of silently searching Eastbourne
  const midpoint = useMemo(() => {
    if (planningLocation && Number.isFinite(planningLocation.lat) && Number.isFinite(planningLocation.lng)
      && planningLocation.lat >= -90 && planningLocation.lat <= 90 && planningLocation.lng >= -180 && planningLocation.lng <= 180) {
      return { lat: planningLocation.lat, lng: planningLocation.lng, fallback: false as const }
    }
    return computeMidpoint(memberCoords ?? [])
  }, [planningLocation, memberCoords])

  useEffect(() => {
    if (midpoint.fallback) {
      setVenues([])
      setLoading(false)
      setError(null)
      setUsingFallback(true)
      setVenueSource(null)
      setShowAlternatives(false)
      setAltVenues([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setShowAlternatives(false)
    setAltVenues([])
    fetchVenues({
      vibe,
      activityId,
      lat: midpoint.lat,
      lng: midpoint.lng,
      limit: 8,
      meetingDay: goldenWindow?.day_of_week,
      meetingTime: goldenWindow?.start_time,
    }).then((result) => {
      if (cancelled) return
      if (result.error) setError(result.error)
      setVenues(result.venues)
      setUsingFallback(false)
      setVenueSource(result.provider ?? (result.venues.length ? 'OpenStreetMap' : null))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [vibe, activityId, midpoint.lat, midpoint.lng, midpoint.fallback, goldenWindow?.day_of_week, goldenWindow?.start_time, goldenWindow?.end_time])

  const rankedResults: ScoredVenueResult[] = useMemo(() => {
    const ranked = rankVenues(venues, weather ?? null, intent)
    if (goldenWindow) {
      ranked.sort((a, b) => {
        const status = (venue: Venue) => venue.open_at_meeting_known ? (venue.open_at_meeting ? 0 : 2) : 1
        return status(a.venue) - status(b.venue)
      })
    }
    if (!recalibrationSeed || ranked.length < 2) return ranked
    const headCount = Math.min(5, ranked.length)
    const head = ranked.slice(0, headCount)
    const tail = ranked.slice(headCount)
    const shift = recalibrationSeed % headCount
    return [...head.slice(shift), ...head.slice(0, shift), ...tail]
  }, [venues, weather, intent, recalibrationSeed, goldenWindow])

  const listResults = rankedResults.slice(0, 5)

  const handleShowAlternatives = () => {
    if (midpoint.fallback) return
    if (altVenues.length > 0) { setShowAlternatives(true); return }
    setAltLoading(true)
    setShowAlternatives(true)
    fetchVenues({
      vibe: weatherAlt.alternativeVibe,
      lat: midpoint.lat,
      lng: midpoint.lng,
      limit: 6,
      meetingDay: goldenWindow?.day_of_week,
      meetingTime: goldenWindow?.start_time,
    }).then((result) => {
      setAltVenues(result.venues)
      setAltLoading(false)
    })
  }

  const venueKey = (venue: Venue) => `${venue.name}|${venue.address ?? ''}`

  const handleVenueVote = async (venue: Venue, direction: 1 | -1) => {
    if (!groupId || !goldenWindow) {
      toast.error('Find a Golden Window before voting on venues.')
      return
    }
    const key = venueKey(venue)
    if (savingVote) return
    const nextVote = votes[venue.name] === direction ? 0 : direction
    setSavingVote(key)
    try {
      let currentPlanId = planIdRef.current
      if (!currentPlanId) {
        const start = new Date()
        let daysUntil = goldenWindow.days_until
        if (daysUntil == null) daysUntil = (goldenWindow.day_of_week - start.getDay() + 7) % 7
        const [startHour, startMinute] = goldenWindow.start_time.split(':').map(Number)
        const [endHour, endMinute] = goldenWindow.end_time.split(':').map(Number)
        start.setDate(start.getDate() + daysUntil)
        start.setHours(startHour, startMinute, 0, 0)
        if (start.getTime() <= Date.now()) start.setDate(start.getDate() + 7)
        const end = new Date(start)
        end.setHours(endHour, endMinute, 0, 0)
        if (end <= start) end.setDate(end.getDate() + 1)
        const created = await createGoldenWindowPlan(groupId, {
          title: `${groupName?.trim() || 'Circle'} plan`,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          window: { dayOfWeek: goldenWindow.day_of_week, startTime: goldenWindow.start_time, endTime: goldenWindow.end_time },
        })
        currentPlanId = created.id
        planIdRef.current = currentPlanId
        setPlanId(currentPlanId)
      }
      const savedVenueId = await recordVenueVote(currentPlanId, venue, nextVote, venueRecordIds[key])
      setVenueRecordIds((previous) => ({ ...previous, [key]: savedVenueId }))
      setVotes((previous) => ({ ...previous, [venue.name]: nextVote }))
      setLikedVenues((previous) => {
        const next = { ...previous }
        if (nextVote === 1) next[key] = venue
        else delete next[key]
        return next
      })
      setConfirmedVenueName(null)
    } catch (error) {
      console.error('[venue-recommendations] vote failed', error)
      toast.error(error instanceof Error ? error.message : 'Your vote could not be saved.')
    } finally {
      setSavingVote(null)
    }
  }

  const handleConfirmPlan = async (venue: Venue) => {
    const currentPlanId = planIdRef.current
    const savedVenueId = venueRecordIds[venueKey(venue)]
    if (!currentPlanId || !savedVenueId || confirmingPlan) return
    setConfirmingPlan(true)
    try {
      await confirmNexusPlan(currentPlanId, savedVenueId)
      setConfirmedVenueName(venue.name)
      toast.success('Plan confirmed and your RSVP is yes.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not confirm the plan.')
    } finally {
      setConfirmingPlan(false)
    }
  }

  const mapVenues = useMemo(() => venues.filter((venue) => venue.lat != null && venue.lng != null), [venues])

  return (
    <div className="mb-6 space-y-4">
      {intent.confidence >= 50 && intent.category !== 'general' && (
        <div className="flex items-center gap-2 px-1">
          <Sparkles className="w-3 h-3 text-primary shrink-0" />
          <p className="text-[11px] text-primary/80">
            Showing <strong className="font-semibold">{VIBE_LABEL[intent.vibe]}</strong> spots
            {intent.confidence >= 70 ? ` — detected from group context` : ''}
            {intent.signals[0] ? ` (${intent.signals[0]})` : ''}
          </p>
        </div>
      )}

      {weatherAlt.shouldSuggest && !showAlternatives && (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-blue-400/25 bg-blue-400/[0.04]">
          <AlertTriangle className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-foreground/90">{weatherAlt.headline}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{weatherAlt.body}</p>
          </div>
          <button type="button" onClick={handleShowAlternatives} className="shrink-0 px-2.5 py-1.5 rounded-lg border border-blue-400/30 text-[11px] text-blue-300 hover:bg-blue-400/10 transition-colors">
            Show alternatives
          </button>
        </div>
      )}

      {!midpoint.fallback && <VenuesMap center={{ lat: midpoint.lat, lng: midpoint.lng }} venues={mapVenues} selectedId={selectedMapVenueId} onSelect={(venue) => setSelectedMapVenueId(venueSelectionKey(venue))} onOpenDetails={setSelectedVenue} />}

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
        {VIBES.map((v) => {
          const on = v === vibe
          return <button key={v} type="button" onClick={() => setVibe(v)} className={cn('shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border', on ? 'bg-primary/15 text-primary border-primary/40' : 'bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/50')}>{VIBE_LABEL[v]}</button>
        })}
      </div>

      <div className="flex items-end justify-between mb-1">
        <h2 className="text-lg font-semibold">Nearby fits</h2>
        {goldenWindow ? <span className="text-[11px] text-muted-foreground">For {goldenWindow.start_time}–{goldenWindow.end_time}</span> : null}
      </div>
      {venueSource && venues.length > 0 && <p className="-mt-1 mb-2 text-[11px] text-muted-foreground" aria-live="polite">Live venue results · {venueSource}</p>}
      {usingFallback && <p className="text-[10px] text-muted-foreground italic -mt-2 mb-1">Set a group location above to find real venues nearby.</p>}

      {loading ? (
        <GlassCard className="p-4"><div className="flex items-center gap-3" role="status" aria-live="polite"><span className="relative flex w-2.5 h-2.5"><span className="absolute inset-0 rounded-full bg-amber-400/50 animate-ping" /><span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]" /></span><p className="text-sm text-muted-foreground">Searching nearby fits…</p></div></GlassCard>
      ) : error ? (
        <GlassCard className="p-4"><div className="flex items-center gap-2 mb-1"><Sparkles className="w-4 h-4 text-muted-foreground" /><span className="text-sm font-medium">Couldn't load venues</span></div><p className="text-xs text-muted-foreground break-words">{error}</p><button type="button" onClick={() => { setError(null); setLoading(true); fetchVenues({ vibe, activityId, lat: midpoint.fallback ? undefined : midpoint.lat, lng: midpoint.fallback ? undefined : midpoint.lng, limit: 8, meetingDay: goldenWindow?.day_of_week, meetingTime: goldenWindow?.start_time }).then((result) => { setVenues(result.venues); setError(result.error ?? null); setVenueSource(result.provider ?? null); setLoading(false) }) }} className="mt-3 min-h-10 rounded-lg border border-primary/30 px-3 text-xs text-primary">Try again</button></GlassCard>
      ) : midpoint.fallback ? (
        <GlassCard className="p-4"><div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-muted-foreground/60 shrink-0 mt-0.5" /><div><p className="text-sm font-medium text-foreground/80">Choose your planning area</p><p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">Set a Circle location to find real nearby venues on OpenStreetMap. Nexus never guesses the area.</p></div></div></GlassCard>
      ) : venues.length === 0 ? (
        <GlassCard className="p-4"><p className="text-xs text-muted-foreground">No venues found for this vibe in the search area.</p></GlassCard>
      ) : (
        <div className="space-y-2.5">
          {listResults.map((result, idx) => <VenueCard key={`${result.venue.name}-${result.venue.address ?? idx}`} result={result} isTopPick={idx === 0} selected={selectedMapVenueId === venueSelectionKey(result.venue)} vote={votes[result.venue.name] ?? 0} onVote={(dir) => void handleVenueVote(result.venue, dir)} onOpen={() => { setSelectedMapVenueId(venueSelectionKey(result.venue)); setSelectedVenue(result.venue) }} />)}
        </div>
      )}

      {Object.keys(likedVenues).length > 0 && (
        <GlassCard className="mt-4 space-y-3 p-4" aria-live="polite">
          <div>
            <p className="text-sm font-medium">Circle venue vote</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Votes are saved to the Circle plan. Confirming records the plan and your RSVP; it does not book the venue.</p>
          </div>
          {Object.entries(likedVenues).map(([key, venue]) => (
            <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2">
              <span className="min-w-0 truncate text-sm">{venue.name}</span>
              {confirmedVenueName === venue.name ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-primary"><Check className="h-4 w-4" />Confirmed · RSVP yes</span>
              ) : (
                <button type="button" onClick={() => void handleConfirmPlan(venue)} disabled={confirmingPlan || !planId} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60">
                  {confirmingPlan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Confirm plan
                </button>
              )}
            </div>
          ))}
        </GlassCard>
      )}

      {showAlternatives && (
        <div className="space-y-2">
          <div className="flex items-center justify-between"><p className="text-[11px] text-blue-300 font-medium uppercase tracking-widest">Indoor alternatives</p><button type="button" onClick={() => setShowAlternatives(false)} className="text-[11px] text-muted-foreground hover:text-foreground">Hide</button></div>
          {altLoading ? (
            <GlassCard className="p-4"><div className="flex items-center gap-3" role="status"><span className="relative flex w-2.5 h-2.5"><span className="absolute inset-0 rounded-full bg-blue-400/50 animate-ping" /><span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-blue-400" /></span><p className="text-sm text-muted-foreground">Finding cosy alternatives…</p></div></GlassCard>
          ) : (
            <div className="space-y-2.5">{rankVenues(altVenues, weather ?? null, { ...intent, preferIndoor: true, category: 'indoor_social', vibe: weatherAlt.alternativeVibe, weatherSensitive: false }).slice(0, 4).map((result, idx) => <VenueCard key={`alt-${result.venue.name}-${idx}`} result={result} isTopPick={false} isAlternative vote={votes[result.venue.name] ?? 0} onVote={(dir) => void handleVenueVote(result.venue, dir)} onOpen={() => setSelectedVenue(result.venue)} />)}</div>
          )}
        </div>
      )}

      <VenueDetailSheet venue={selectedVenue} groupId={groupId} activityId={activityId} vibe={vibe} goldenWindow={goldenWindow ?? null} midpointFallback={midpoint.fallback} weather={weather ?? null} vote={selectedVenue ? votes[selectedVenue.name] ?? 0 : 0} onVote={(dir) => selectedVenue && void handleVenueVote(selectedVenue, dir)} onClose={() => setSelectedVenue(null)} intent={intent} />
    </div>
  )
}

function VenueCard({ result, isTopPick, isAlternative, selected, vote, onVote, onOpen }: { result: ScoredVenueResult; isTopPick: boolean; isAlternative?: boolean; selected?: boolean; vote: 1 | -1 | 0; onVote: (dir: 1 | -1) => void; onOpen: () => void }) {
  const { venue, explanation } = result
  const isOpen = venue.open_now === true
  const distance = venue.distance_km != null ? venue.distance_km < 1 ? `${Math.round(venue.distance_km * 1000)}m` : `${venue.distance_km.toFixed(1)}km` : null
  const directionsUrl = buildDirectionsUrl(venue)
  const isInteractiveChild = (target: EventTarget | null) => !!(target as HTMLElement | null)?.closest('a, button, input, textarea, select')
  const handleOpen = (e: React.MouseEvent | React.TouchEvent) => { if (isInteractiveChild(e.target)) return; onOpen() }
  const handleKey = (e: React.KeyboardEvent) => { if (e.key !== 'Enter' && e.key !== ' ') return; if (isInteractiveChild(e.target)) return; e.preventDefault(); onOpen() }
  const primaryExplanation = explanation[0] ?? null

  return (
    <div className={cn('glass-card rounded-xl p-3 text-left w-full relative overflow-hidden cursor-pointer transition-colors select-none touch-manipulation', selected && 'border-primary/50 shadow-[0_0_18px_rgba(229,98,48,.12)]', isAlternative ? 'hover:border-blue-400/30 border-blue-400/10' : 'hover:border-amber-400/30')} onClick={handleOpen} onKeyDown={handleKey} role="button" tabIndex={0} data-testid="venue-card" aria-label={`Open ${venue.name} details`} aria-pressed={selected}>
      {isTopPick && <div className="absolute top-0 left-0 z-10 px-2 py-1 rounded-br-lg bg-rose-500/90 text-white text-[9px] font-semibold tracking-wide flex items-center gap-1 shadow-lg"><Sparkles className="w-3 h-3" aria-hidden="true" />TOP PICK</div>}
      {isAlternative && <div className="absolute top-0 left-0 z-10 px-2 py-1 rounded-br-lg bg-blue-500/80 text-white text-[9px] font-semibold tracking-wide">INDOOR ALT</div>}
      <div className="flex gap-3">
        <VenuePhoto venue={venue} className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2"><h3 className="font-medium text-sm truncate flex-1">{venue.name}</h3><div className="flex shrink-0 flex-wrap justify-end gap-1">{venue.open_at_meeting_known && <span className={cn('rounded-full border px-2 py-0.5 text-[9px]', venue.open_at_meeting ? 'border-emerald-400/40 text-emerald-300' : 'border-rose-400/40 text-rose-300')}>{venue.open_at_meeting ? 'OPEN AT PLAN TIME' : 'CLOSED AT PLAN TIME'}</span>}{isOpen && <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-400/50 text-emerald-400">OPEN NOW</span>}</div></div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{[venue.category, distance].filter(Boolean).join(' · ') || '—'}</p>
          {primaryExplanation && <p className="text-[11px] text-muted-foreground/90 mt-1 line-clamp-2 leading-relaxed">{primaryExplanation}</p>}
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            {venue.rating != null ? <span className="text-[11px] text-amber-400 flex items-center gap-0.5" aria-label={`${venue.rating.toFixed(1)} out of 5 stars`}><Star className="w-3 h-3 fill-current" aria-hidden="true" />{venue.rating.toFixed(1)}</span> : <span />}
            <div className="flex flex-wrap items-center justify-end gap-1">
              {venue.maps_url && <a href={venue.maps_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex min-h-11 items-center gap-1 px-2 py-1 rounded-md border border-border/40 text-[11px] text-muted-foreground hover:text-foreground hover:border-border transition-all" aria-label={`Open ${venue.name} on OpenStreetMap`}><ExternalLink className="w-3 h-3" aria-hidden="true" />Map</a>}
              {directionsUrl && <a href={directionsUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex min-h-11 items-center gap-1 px-2 py-1 rounded-md border border-primary/30 text-[11px] text-primary" aria-label={`Get directions to ${venue.name}`}><Navigation className="w-3 h-3" aria-hidden="true" />Go</a>}
              <VoteButton active={vote === 1} onClick={(e) => { e.stopPropagation(); onVote(1) }} icon="up" venueName={venue.name} />
              <VoteButton active={vote === -1} onClick={(e) => { e.stopPropagation(); onVote(-1) }} icon="down" venueName={venue.name} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function VoteButton({ active, icon, venueName, onClick }: { active: boolean; icon: 'up' | 'down'; venueName: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  const Icon = icon === 'up' ? ThumbsUp : ThumbsDown
  const activeColor = icon === 'up' ? 'border-emerald-400/60 text-emerald-400' : 'border-rose-400/60 text-rose-400'
  const label = icon === 'up' ? `Vote up ${venueName}` : `Vote down ${venueName}`
  return <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className={cn('flex min-h-11 min-w-11 items-center justify-center rounded-md border p-1.5 transition-all', active ? activeColor : 'border-border/40 text-muted-foreground hover:text-foreground')}><Icon className="w-3.5 h-3.5" aria-hidden="true" /></button>
}
