'use client'

import { useEffect, useMemo, useState } from 'react'
import { GlassCard } from './glass-card'
import { Star, MapPin, Sparkles, ThumbsUp, ThumbsDown, ExternalLink, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  fetchVenues,
  computeMidpoint,
  buildMapUrl,
  VIBE_LABEL,
  type Vibe,
  type Venue,
} from '@/lib/venue-service'
import { VenueDetailSheet } from './venue-detail-sheet'
import type { Weather } from '@/lib/weather-service'
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
  } | null
  /**
   * Group planning location — takes priority over memberCoords for the
   * venue search midpoint. When present, this is the real coordinates
   * the group has set via the map picker (stored in Supabase).
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

  // ── Data fetching ──────────────────────────────────────────────────────────
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [usingFallback, setUsingFallback] = useState(true)
  const [votes, setVotes] = useState<Record<string, 1 | -1 | 0>>({})
  const [mapFailed, setMapFailed] = useState(false)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
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
  //   1. planningLocation — group's real saved location (from map picker / Supabase)
  //   2. memberCoords     — individual member coordinates (future feature)
  //   3. fallback         — no location set; show a "set location" prompt instead
  //                         of silently searching Eastbourne
  const midpoint = useMemo(() => {
    if (planningLocation) {
      return { lat: planningLocation.lat, lng: planningLocation.lng, fallback: false as const }
    }
    return computeMidpoint(memberCoords ?? [])
  }, [planningLocation, memberCoords])

  useEffect(() => {
    // No location available — don't search Eastbourne; show a prompt instead.
    if (midpoint.fallback) {
      setVenues([])
      setLoading(false)
      setError(null)
      setUsingFallback(true)
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
      activityId,
      activityId,
      activityId,
      lat: midpoint.lat,
      lng: midpoint.lng,
      limit: 8,
    }).then((result) => {
      if (cancelled) return
      if (result.error) setError(result.error)
      setVenues(result.venues)
      setUsingFallback(false)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [vibe, activityId, midpoint.lat, midpoint.lng, midpoint.fallback, goldenWindow?.day_of_week, goldenWindow?.start_time, goldenWindow?.end_time])

  useEffect(() => {
    setMapFailed(false)
  }, [midpoint.lat, midpoint.lng])

  // ── Intelligence-ranked venues ─────────────────────────────────────────────
  const rankedResults: ScoredVenueResult[] = useMemo(() => {
    const ranked = rankVenues(venues, weather ?? null, intent)
    if (!recalibrationSeed || ranked.length < 2) return ranked
    const headCount = Math.min(5, ranked.length)
    const head = ranked.slice(0, headCount)
    const tail = ranked.slice(headCount)
    const shift = recalibrationSeed % headCount
    return [...head.slice(shift), ...head.slice(0, shift), ...tail]
  }, [venues, weather, intent, recalibrationSeed])

  const topPick = rankedResults[0]?.venue ?? null
  const listResults = rankedResults.slice(0, 5)

  // ── Weather alternatives fetch ────────────────────────────────────────────
  const handleShowAlternatives = () => {
    if (altVenues.length > 0) { setShowAlternatives(true); return }
    setAltLoading(true)
    setShowAlternatives(true)
    fetchVenues({
      vibe: weatherAlt.alternativeVibe,
      lat: midpoint.fallback ? undefined : midpoint.lat,
      lng: midpoint.fallback ? undefined : midpoint.lng,
      limit: 6,
    }).then((result) => {
      setAltVenues(result.venues)
      setAltLoading(false)
    })
  }

  // Map URL
  const mapUrl = useMemo(
    () =>
      buildMapUrl({
        lat: midpoint.lat,
        lng: midpoint.lng,
        topPickCoord:
          topPick && topPick.lat != null && topPick.lng != null
            ? { lat: topPick.lat, lng: topPick.lng }
            : null,
        fitCoords: listResults
          .slice(1)
          .filter((r): r is ScoredVenueResult & { venue: Venue & { lat: number; lng: number } } =>
            r.venue.lat != null && r.venue.lng != null,
          )
          .slice(0, 4)
          .map((r) => ({ lat: r.venue.lat, lng: r.venue.lng })),
        zoom: 14,
        w: 640,
        h: 320,
      }),
    [midpoint.lat, midpoint.lng, topPick, listResults],
  )

  return (
    <div className="mb-6 space-y-4">
      {/* Activity Intelligence context line */}
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

      {/* Weather alternative suggestion banner */}
      {weatherAlt.shouldSuggest && !showAlternatives && (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-blue-400/25 bg-blue-400/[0.04]">
          <AlertTriangle className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-foreground/90">{weatherAlt.headline}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{weatherAlt.body}</p>
          </div>
          <button
            type="button"
            onClick={handleShowAlternatives}
            className="shrink-0 px-2.5 py-1.5 rounded-lg border border-blue-400/30 text-[11px] text-blue-300 hover:bg-blue-400/10 transition-colors"
          >
            Show alternatives
          </button>
        </div>
      )}

      {/* Map section */}
      <GlassCard className="p-0 overflow-hidden relative">
        <div className="relative w-full bg-[radial-gradient(ellipse_at_center,#0c1626,#05080f)]" style={{ aspectRatio: '2 / 1' }}>
          {!mapFailed && (
            <img
              src={mapUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setMapFailed(true)}
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.18),transparent_55%)]" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/95 via-background/10 to-transparent" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-[68%] aspect-square rounded-full border border-amber-400/30 [box-shadow:0_0_60px_rgba(251,191,36,0.15)_inset,0_0_40px_rgba(251,191,36,0.10)]" />
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="relative">
              <span className="absolute inset-0 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/40 animate-ping" />
              <span className="block w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)]" />
            </span>
          </div>
          {topPick && (
            <div className="pointer-events-none absolute top-[42%] left-[58%]">
              <span className="block w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.8)]" />
            </div>
          )}
          {listResults.slice(1, 4).map((_, i) => (
            <div
              key={i}
              className="pointer-events-none absolute"
              style={{ top: `${48 + (i % 2 === 0 ? -8 : 6)}%`, left: `${40 - i * 6}%` }}
            >
              <span className="block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
            </div>
          ))}
          {midpoint.fallback && (
            <span className="absolute bottom-12 left-3 text-[10px] text-muted-foreground/60 tracking-widest uppercase">
              No location set
            </span>
          )}
          {mapFailed && (
            <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-background/70 backdrop-blur border border-border/40 text-[9px] text-muted-foreground">
              Enable <strong className="text-foreground">Maps Static API</strong> for live map
            </div>
          )}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 px-3 py-1.5 rounded-full bg-background/70 backdrop-blur border border-border/40 text-[10px] text-muted-foreground">
            <LegendDot color="bg-amber-400" label="Midpoint" />
            <span className="opacity-30">·</span>
            <LegendDot color="bg-emerald-400" label="Open now" />
            <span className="opacity-30">·</span>
            <LegendDot color="bg-rose-500" label="Top pick" />
          </div>
        </div>
      </GlassCard>

      {/* Vibe chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
        {VIBES.map((v) => {
          const on = v === vibe
          return (
            <button
              key={v}
              type="button"
              onClick={() => setVibe(v)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                on
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/50',
              )}
            >
              {VIBE_LABEL[v]}
            </button>
          )
        })}
      </div>

      {/* Section header */}
      <div className="flex items-end justify-between mb-1">
        <h2 className="text-lg font-semibold">Nearby fits</h2>
        {goldenWindow ? (
          <span className="text-[11px] text-muted-foreground">
            For {goldenWindow.start_time}–{goldenWindow.end_time}
          </span>
        ) : null}
      </div>
      {usingFallback && (
        <p className="text-[10px] text-muted-foreground italic -mt-2 mb-1">
          Set a group location above to find real venues nearby.
        </p>
      )}

      {/* Venue list */}
      {loading ? (
        <GlassCard className="p-4">
          <div className="flex items-center gap-3" role="status" aria-live="polite">
            <span className="relative flex w-2.5 h-2.5">
              <span className="absolute inset-0 rounded-full bg-amber-400/50 animate-ping" />
              <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]" />
            </span>
            <p className="text-sm text-muted-foreground">Searching nearby fits…</p>
          </div>
        </GlassCard>
      ) : error ? (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Couldn't load venues</span>
          </div>
          <p className="text-xs text-muted-foreground break-words">{error}</p>
          <p className="text-[10px] text-muted-foreground mt-2">
            Make sure <code className="text-primary">GOOGLE_PLACES_API_KEY</code> is set and
            both <strong>Places API (New)</strong> and <strong>Maps Static API</strong> are
            enabled in Google Cloud Console.
          </p>
        </GlassCard>
      ) : midpoint.fallback ? (
        <GlassCard className="p-4">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground/60 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground/80">No location set</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Use the location picker above to set a meeting area — Nexus will search for
                real venues nearby using Google Places.
              </p>
            </div>
          </div>
        </GlassCard>
      ) : venues.length === 0 ? (
        <GlassCard className="p-4">
          <p className="text-xs text-muted-foreground">
            No venues found for this vibe in the search area.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-2.5">
          {listResults.map((result, idx) => (
            <VenueCard
              key={`${result.venue.name}-${result.venue.address ?? idx}`}
              result={result}
              isTopPick={idx === 0}
              vote={votes[result.venue.name] ?? 0}
              onVote={(dir) =>
                setVotes((p) => ({ ...p, [result.venue.name]: p[result.venue.name] === dir ? 0 : dir }))
              }
              onOpen={() => setSelectedVenue(result.venue)}
            />
          ))}
        </div>
      )}

      {/* Weather alternatives section */}
      {showAlternatives && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-blue-300 font-medium uppercase tracking-widest">
              Indoor alternatives
            </p>
            <button
              type="button"
              onClick={() => setShowAlternatives(false)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Hide
            </button>
          </div>
          {altLoading ? (
            <GlassCard className="p-4">
              <div className="flex items-center gap-3" role="status">
                <span className="relative flex w-2.5 h-2.5">
                  <span className="absolute inset-0 rounded-full bg-blue-400/50 animate-ping" />
                  <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-blue-400" />
                </span>
                <p className="text-sm text-muted-foreground">Finding cosy alternatives…</p>
              </div>
            </GlassCard>
          ) : (
            <div className="space-y-2.5">
              {rankVenues(altVenues, weather ?? null, { ...intent, preferIndoor: true, category: 'indoor_social', vibe: weatherAlt.alternativeVibe, weatherSensitive: false }).slice(0, 4).map((result, idx) => (
                <VenueCard
                  key={`alt-${result.venue.name}-${idx}`}
                  result={result}
                  isTopPick={false}
                  isAlternative
                  vote={votes[result.venue.name] ?? 0}
                  onVote={(dir) =>
                    setVotes((p) => ({ ...p, [result.venue.name]: p[result.venue.name] === dir ? 0 : dir }))
                  }
                  onOpen={() => setSelectedVenue(result.venue)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Venue detail sheet */}
      <VenueDetailSheet
        venue={selectedVenue}
        groupId={groupId}
        activityId={activityId}
        vibe={vibe}
        goldenWindow={goldenWindow ?? null}
        midpointFallback={midpoint.fallback}
        weather={weather ?? null}
        vote={selectedVenue ? votes[selectedVenue.name] ?? 0 : 0}
        onVote={(dir) =>
          selectedVenue &&
          setVotes((p) => ({
            ...p,
            [selectedVenue.name]: p[selectedVenue.name] === dir ? 0 : dir,
          }))
        }
        onClose={() => setSelectedVenue(null)}
        intent={intent}
      />
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('w-2 h-2 rounded-full', color)} />
      <span>{label}</span>
    </span>
  )
}

function VenueCard({
  result,
  isTopPick,
  isAlternative,
  vote,
  onVote,
  onOpen,
}: {
  result: ScoredVenueResult
  isTopPick: boolean
  isAlternative?: boolean
  vote: 1 | -1 | 0
  onVote: (dir: 1 | -1) => void
  onOpen: () => void
}) {
  const { venue, explanation } = result
  const isOpen = venue.open_now === true
  const distance =
    venue.distance_km != null
      ? venue.distance_km < 1
        ? `${Math.round(venue.distance_km * 1000)}m`
        : `${venue.distance_km.toFixed(1)}km`
      : null

  const isInteractiveChild = (target: EventTarget | null) =>
    !!(target as HTMLElement | null)?.closest('a, button, input, textarea, select')

  const handleOpen = (e: React.MouseEvent | React.TouchEvent) => {
    if (isInteractiveChild(e.target)) return
    onOpen()
  }
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    if (isInteractiveChild(e.target)) return
    e.preventDefault()
    onOpen()
  }

  // Pick the most useful explanation to show on the card (≤ 2 lines)
  const primaryExplanation = explanation[0] ?? null

  return (
    <div
      className={cn(
        'glass-card rounded-xl p-3 text-left w-full relative overflow-hidden cursor-pointer transition-colors select-none touch-manipulation',
        isAlternative
          ? 'hover:border-blue-400/30 border-blue-400/10'
          : 'hover:border-amber-400/30',
      )}
      onClick={handleOpen}
      onKeyDown={handleKey}
      role="button"
      tabIndex={0}
      data-testid="venue-card"
      aria-label={`Open ${venue.name} details`}
    >
      {/* TOP PICK ribbon */}
      {isTopPick && (
        <div className="absolute top-0 left-0 z-10 px-2 py-1 rounded-br-lg bg-rose-500/90 text-white text-[9px] font-semibold tracking-wide flex items-center gap-1 shadow-lg">
          <Sparkles className="w-3 h-3" aria-hidden="true" />
          TOP PICK
        </div>
      )}
      {/* INDOOR ALT badge */}
      {isAlternative && (
        <div className="absolute top-0 left-0 z-10 px-2 py-1 rounded-br-lg bg-blue-500/80 text-white text-[9px] font-semibold tracking-wide">
          INDOOR ALT
        </div>
      )}

      <div className="flex gap-3">
        {/* Photo */}
        <div className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-muted/40">
          {venue.photo_url ? (
            <img
              src={venue.photo_url}
              alt={venue.name}
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <MapPin className="w-6 h-6 text-muted-foreground/40" aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-sm truncate flex-1">{venue.name}</h3>
            {isOpen && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-400/50 text-emerald-400 shrink-0">
                OPEN
              </span>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {[venue.category, distance].filter(Boolean).join(' · ') || '—'}
          </p>

          {/* AI explanation — every card gets one */}
          {primaryExplanation && (
            <p className="text-[11px] text-muted-foreground/90 mt-1 line-clamp-2 leading-relaxed">
              {primaryExplanation}
            </p>
          )}

          <div className="flex items-center justify-between mt-1.5">
            {venue.rating != null ? (
              <span
                className="text-[11px] text-amber-400 flex items-center gap-0.5"
                aria-label={`${venue.rating.toFixed(1)} out of 5 stars`}
              >
                <Star className="w-3 h-3 fill-current" aria-hidden="true" />
                {venue.rating.toFixed(1)}
              </span>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-1">
              {venue.maps_url && (
                <a
                  href={venue.maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 px-2 py-1 rounded-md border border-border/40 text-[11px] text-muted-foreground hover:text-foreground hover:border-border transition-all"
                  aria-label={`Open ${venue.name} in Google Maps`}
                >
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  Maps
                </a>
              )}
              <VoteButton
                active={vote === 1}
                onClick={(e) => { e.stopPropagation(); onVote(1) }}
                icon="up"
                venueName={venue.name}
              />
              <VoteButton
                active={vote === -1}
                onClick={(e) => { e.stopPropagation(); onVote(-1) }}
                icon="down"
                venueName={venue.name}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function VoteButton({
  active,
  icon,
  venueName,
  onClick,
}: {
  active: boolean
  icon: 'up' | 'down'
  venueName: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const Icon = icon === 'up' ? ThumbsUp : ThumbsDown
  const activeColor =
    icon === 'up'
      ? 'border-emerald-400/60 text-emerald-400'
      : 'border-rose-400/60 text-rose-400'
  const label = icon === 'up' ? `Vote up ${venueName}` : `Vote down ${venueName}`
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex items-center justify-center p-1.5 rounded-md border transition-all',
        active ? activeColor : 'border-border/40 text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
    </button>
  )
}
