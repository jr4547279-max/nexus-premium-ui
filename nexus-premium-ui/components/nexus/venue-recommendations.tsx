'use client'

import { useEffect, useMemo, useState } from 'react'
import { GlassCard } from './glass-card'
import { Star, MapPin, Sparkles, ThumbsUp, ThumbsDown, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  fetchVenues,
  inferVibe,
  computeMidpoint,
  buildMapUrl,
  venueReason,
  VIBE_LABEL,
  type Vibe,
  type Venue,
} from '@/lib/venue-service'
import { VenueDetailSheet } from './venue-detail-sheet'

interface Props {
  groupName: string | null
  /** Real Golden Window context, used to drive weather/openness scoring. */
  goldenWindow?: {
    day_of_week: number
    start_time: string
    end_time: string
  } | null
  /** Future-proof: when member coords exist, pass them and the midpoint will shift. */
  memberCoords?: Array<{ lat: number; lng: number }>
}

const VIBES: Vibe[] = ['pub', 'drinks', 'food', 'coffee', 'activity']

export function VenueRecommendations({ groupName, goldenWindow, memberCoords }: Props) {
  const initialVibe = useMemo(() => inferVibe(groupName), [groupName])
  const [vibe, setVibe] = useState<Vibe>(initialVibe)
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [usingFallback, setUsingFallback] = useState(true)
  const [votes, setVotes] = useState<Record<string, 1 | -1 | 0>>({})
  const [mapFailed, setMapFailed] = useState(false)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)

  const midpoint = useMemo(
    () => computeMidpoint(memberCoords ?? []),
    [memberCoords],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchVenues({
      vibe,
      lat: midpoint.fallback ? undefined : midpoint.lat,
      lng: midpoint.fallback ? undefined : midpoint.lng,
      limit: 8,
    }).then((result) => {
      if (cancelled) return
      if (result.error) setError(result.error)
      setVenues(result.venues)
      setUsingFallback(midpoint.fallback || Boolean(result.fallback))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [vibe, midpoint.lat, midpoint.lng, midpoint.fallback])

  // Reset map error state if midpoint changes so we try again
  useEffect(() => {
    setMapFailed(false)
  }, [midpoint.lat, midpoint.lng])

  const topPick = venues[0] ?? null
  const fitVenues = venues.slice(1, 6)

  // Map URL — server proxy keeps the API key off the browser.
  const mapUrl = useMemo(
    () =>
      buildMapUrl({
        lat: midpoint.lat,
        lng: midpoint.lng,
        topPickCoord:
          topPick && topPick.lat != null && topPick.lng != null
            ? { lat: topPick.lat, lng: topPick.lng }
            : null,
        fitCoords: fitVenues
          .filter((v): v is Venue & { lat: number; lng: number } => v.lat != null && v.lng != null)
          .slice(0, 4)
          .map((v) => ({ lat: v.lat, lng: v.lng })),
        zoom: 14,
        w: 640,
        h: 320,
      }),
    [midpoint.lat, midpoint.lng, topPick, fitVenues],
  )

  return (
    <div className="mb-6 space-y-4">
      {/* ──────────────────────────────────────────────────────────────
          Cinematic map section
          ────────────────────────────────────────────────────────────── */}
      <GlassCard className="p-0 overflow-hidden relative">
        <div className="relative w-full bg-[radial-gradient(ellipse_at_center,#0c1626,#05080f)]" style={{ aspectRatio: '2 / 1' }}>
          {/* Static map image (server-proxied, dark-styled). If the Static
              Maps API is disabled, the <img> errors and we leave the
              atmospheric gradient + faux markers visible. */}
          {!mapFailed && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={mapUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setMapFailed(true)}
            />
          )}

          {/* Atmospheric overlays */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.18),transparent_55%)]" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/95 via-background/10 to-transparent" />

          {/* Gold radius ring — always visible, ties the look to Nexus */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-[68%] aspect-square rounded-full border border-amber-400/30 [box-shadow:0_0_60px_rgba(251,191,36,0.15)_inset,0_0_40px_rgba(251,191,36,0.10)]" />
          </div>

          {/* Centered midpoint pulse */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="relative">
              <span className="absolute inset-0 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/40 animate-ping" />
              <span className="block w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)]" />
            </span>
          </div>

          {/* Top-pick marker — faux-positioned offset from midpoint */}
          {topPick && (
            <div className="pointer-events-none absolute top-[42%] left-[58%]">
              <span className="block w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.8)]" />
            </div>
          )}
          {fitVenues.slice(0, 3).map((_, i) => (
            <div
              key={i}
              className="pointer-events-none absolute"
              style={{
                top: `${48 + (i % 2 === 0 ? -8 : 6)}%`,
                left: `${40 - i * 6}%`,
              }}
            >
              <span className="block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
            </div>
          ))}

          {/* Location label — only show when we actually used the Eastbourne fallback */}
          {midpoint.fallback && (
            <span className="absolute bottom-12 left-3 text-[10px] text-muted-foreground/60 tracking-widest uppercase">
              Eastbourne
            </span>
          )}

          {/* If the static map errored, swap in a friendly hint */}
          {mapFailed && (
            <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-background/70 backdrop-blur border border-border/40 text-[9px] text-muted-foreground">
              Enable <strong className="text-foreground">Maps Static API</strong> for live map
            </div>
          )}

          {/* Legend chip strip */}
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

      {/* ──────────────────────────────────────────────────────────────
          Nearby fits section
          ────────────────────────────────────────────────────────────── */}
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
          Searching around Eastbourne — add member locations later to recenter.
        </p>
      )}

      {loading ? (
        <GlassCard className="p-4">
          <p className="text-xs text-muted-foreground">Finding spots near you…</p>
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
      ) : venues.length === 0 ? (
        <GlassCard className="p-4">
          <p className="text-xs text-muted-foreground">
            No venues found for this vibe in the search area.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-2.5">
          {venues.slice(0, 5).map((v, idx) => (
            <VenueCard
              key={`${v.name}-${v.address ?? idx}`}
              venue={v}
              isTopPick={idx === 0}
              vote={votes[v.name] ?? 0}
              onVote={(dir) =>
                setVotes((p) => ({ ...p, [v.name]: p[v.name] === dir ? 0 : dir }))
              }
              onOpen={() => setSelectedVenue(v)}
            />
          ))}
        </div>
      )}

      {/* Venue detail sheet */}
      <VenueDetailSheet
        venue={selectedVenue}
        vibe={vibe}
        goldenWindow={goldenWindow ?? null}
        midpointFallback={midpoint.fallback}
        vote={selectedVenue ? votes[selectedVenue.name] ?? 0 : 0}
        onVote={(dir) =>
          selectedVenue &&
          setVotes((p) => ({
            ...p,
            [selectedVenue.name]: p[selectedVenue.name] === dir ? 0 : dir,
          }))
        }
        onClose={() => setSelectedVenue(null)}
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
  venue,
  isTopPick,
  vote,
  onVote,
  onOpen,
}: {
  venue: Venue
  isTopPick: boolean
  vote: 1 | -1 | 0
  onVote: (dir: 1 | -1) => void
  onOpen: () => void
}) {
  // The OPEN pill is driven by a real signal (Google's openNow) — no
  // fabricated weather scoring here. Cards without that signal show no pill.
  const isOpen = venue.open_now === true
  const distance =
    venue.distance_km != null
      ? venue.distance_km < 1
        ? `${Math.round(venue.distance_km * 1000)}m`
        : `${venue.distance_km.toFixed(1)}km`
      : null

  // Click handler that doesn't fire when the user taps an interactive child
  // (Maps link, vote buttons). Keyboard users get the same affordance via the
  // role="button" + tabIndex on the wrapper.
  const isInteractiveChild = (target: EventTarget | null) =>
    !!(target as HTMLElement | null)?.closest(
      'a, button, input, textarea, select, [role="button"]',
    )

  const handleOpen = (e: React.MouseEvent) => {
    if (isInteractiveChild(e.target)) return
    onOpen()
  }
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    if (isInteractiveChild(e.target)) return
    e.preventDefault()
    onOpen()
  }

  // Plain div (not GlassCard) so we can attach role/tabIndex/onKeyDown for
  // accessibility — GlassCard only exposes a void onClick callback.
  return (
    <div
      className="glass-card rounded-xl p-3 text-left w-full relative overflow-hidden cursor-pointer hover:border-amber-400/30 transition-colors"
      onClick={handleOpen}
      onKeyDown={handleKey}
      role="button"
      tabIndex={0}
      aria-label={`Open ${venue.name} details`}
    >
      {/* TOP PICK ribbon */}
      {isTopPick && (
        <div className="absolute top-0 left-0 z-10 px-2 py-1 rounded-br-lg bg-rose-500/90 text-white text-[9px] font-semibold tracking-wide flex items-center gap-1 shadow-lg">
          <Sparkles className="w-3 h-3" aria-hidden="true" />
          TOP PICK
        </div>
      )}

      <div className="flex gap-3">
        {/* Photo */}
        <div className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-muted/40">
          {venue.photo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
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

          <p className="text-[11px] text-muted-foreground/90 mt-1 line-clamp-1">
            {venueReason(venue)}
          </p>

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
                  className="flex items-center gap-1 px-2 py-1 rounded-md border border-border/40 text-[11px] text-muted-foreground hover:text-foreground hover:border-border transition-all"
                  aria-label={`Open ${venue.name} in Google Maps`}
                >
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  Maps
                </a>
              )}
              <VoteButton
                active={vote === 1}
                onClick={() => onVote(1)}
                icon="up"
                venueName={venue.name}
              />
              <VoteButton
                active={vote === -1}
                onClick={() => onVote(-1)}
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
  onClick: () => void
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
