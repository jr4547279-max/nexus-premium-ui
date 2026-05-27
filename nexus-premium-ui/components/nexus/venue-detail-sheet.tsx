'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Star,
  MapPin,
  Navigation,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { VIBE_LABEL, type Venue, type Vibe } from '@/lib/venue-service'

interface Props {
  venue: Venue | null
  vibe: Vibe
  goldenWindow?: {
    day_of_week: number
    start_time: string
    end_time: string
  } | null
  midpointFallback: boolean
  vote: 1 | -1 | 0
  onVote: (dir: 1 | -1) => void
  onClose: () => void
}

/**
 * Phase 5C — cinematic venue detail sheet.
 *
 * Mobile-first bottom-sheet that fills the screen, with a large photo header,
 * gold-bordered cards for "Why this fits your group", "Group vote", and
 * address. Renders into document.body via a portal so it always sits above
 * the rest of the Nexus UI regardless of scroll context.
 *
 * Only signals we actually have drive the "Why this fits" bullets — there is
 * no weather data on the client right now, so weather is intentionally
 * omitted (we never invent a forecast).
 */
export function VenueDetailSheet({
  venue,
  vibe,
  goldenWindow,
  midpointFallback,
  vote,
  onVote,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // While the sheet is open: lock background scroll, close on Esc, capture
  // the previously focused element to restore on close, move focus into the
  // sheet (close button), and trap Tab focus inside the dialog.
  useEffect(() => {
    if (!venue) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Defer focus to after the portal mounts.
    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 0)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !sheetRef.current) return

      // Simple focus trap — wrap from last to first / first to last.
      const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      // Restore focus to whatever opened the sheet.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [venue, onClose])

  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.log('[VenueDetailSheet] render — venue=', venue?.name ?? null, 'mounted=', mounted)
  }
  if (!venue || !mounted) return null

  const reasons = buildReasons(venue, vibe, goldenWindow, midpointFallback)
  const distanceLabel = formatDistance(venue.distance_km)
  const ratingCountLabel = formatRatingCount(venue.rating_count)
  const upCount = vote === 1 ? 1 : 0
  const downCount = vote === -1 ? 1 : 0

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${venue.name} details`}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'relative w-full sm:max-w-md sm:max-h-[92vh] max-h-[96vh] overflow-y-auto',
          'bg-[#05080f] text-foreground',
          'sm:rounded-2xl rounded-t-2xl',
          'border border-amber-400/15 shadow-[0_0_60px_rgba(251,191,36,0.10)]',
          'animate-in slide-in-from-bottom-8 duration-300',
        )}
      >
        {/* ─── Header image ─── */}
        <div className="relative w-full aspect-[16/10] bg-[radial-gradient(ellipse_at_center,#0c1626,#05080f)] overflow-hidden">
          {venue.photo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={venue.photo_url.replace('w=200&h=200', 'w=800&h=500')}
              alt={venue.name}
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <MapPin className="w-12 h-12 text-muted-foreground/30" aria-hidden="true" />
            </div>
          )}

          {/* Gradient overlays for legibility */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05080f] via-[#05080f]/30 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />

          {/* Open / closed pill — only if we have a real signal */}
          {venue.open_now !== null && (
            <div
              className={cn(
                'absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide backdrop-blur',
                venue.open_now
                  ? 'bg-emerald-500/15 border border-emerald-400/50 text-emerald-300'
                  : 'bg-rose-500/15 border border-rose-400/50 text-rose-300',
              )}
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  venue.open_now ? 'bg-emerald-400' : 'bg-rose-400',
                )}
              />
              {venue.open_now ? 'OPEN' : 'CLOSED'}
            </div>
          )}

          {/* Close button */}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close venue details"
            className="absolute top-3 right-3 flex items-center justify-center w-8 h-8 rounded-full bg-black/50 backdrop-blur border border-white/10 text-white/90 hover:bg-black/70 hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>

          {/* Title overlay */}
          <div className="absolute bottom-3 left-4 right-4">
            <h2 className="text-2xl font-semibold text-white drop-shadow-lg leading-tight">
              {venue.name}
            </h2>
          </div>
        </div>

        {/* ─── Meta rows ─── */}
        <div className="px-4 pt-3 space-y-1.5">
          <div className="flex items-center gap-2 text-[13px] flex-wrap">
            {venue.rating != null && (
              <span
                className="inline-flex items-center gap-1 text-amber-400"
                aria-label={`${venue.rating.toFixed(1)} out of 5 stars${
                  ratingCountLabel ? `, ${ratingCountLabel} reviews` : ''
                }`}
              >
                <Star className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span className="font-medium">{venue.rating.toFixed(1)}</span>
                {ratingCountLabel && (
                  <span className="text-muted-foreground">({ratingCountLabel})</span>
                )}
              </span>
            )}
            {venue.category && (
              <>
                {venue.rating != null && (
                  <span className="text-muted-foreground/40" aria-hidden="true">
                    •
                  </span>
                )}
                <span className="text-muted-foreground">{venue.category}</span>
              </>
            )}
          </div>

          {(distanceLabel || venue.address) && (
            <div className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
              <Navigation className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {distanceLabel && <span>{distanceLabel} from midpoint</span>}
                {distanceLabel && venue.address && (
                  <span className="text-muted-foreground/40"> · </span>
                )}
                {venue.address && <span>{venue.address}</span>}
              </span>
            </div>
          )}
        </div>

        {/* ─── Why this fits your group ─── */}
        {reasons.length > 0 && (
          <section className="mx-4 mt-4 p-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.03] [box-shadow:0_0_24px_rgba(251,191,36,0.06)_inset]">
            <h3 className="flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase text-amber-300 mb-2.5">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              Why this fits your group
            </h3>
            <ul className="space-y-2">
              {reasons.map((r, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-foreground/90 leading-snug">
                  <span
                    className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]"
                    aria-hidden="true"
                  />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ─── Group vote ─── */}
        <section className="mx-4 mt-3 p-4 rounded-xl border border-amber-400/15 bg-white/[0.02]">
          <h3 className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">
            Group vote
          </h3>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-muted-foreground leading-snug flex-1">
              Cast your vote — your group will see it in real time.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <VoteChip
                active={vote === 1}
                onClick={() => onVote(1)}
                icon="up"
                count={upCount}
                venueName={venue.name}
              />
              <VoteChip
                active={vote === -1}
                onClick={() => onVote(-1)}
                icon="down"
                count={downCount}
                venueName={venue.name}
              />
            </div>
          </div>
        </section>

        {/* ─── Address ─── */}
        {venue.address && (
          <section className="mx-4 mt-3 mb-4 rounded-xl border border-amber-400/15 bg-white/[0.02] overflow-hidden">
            {venue.maps_url ? (
              <a
                href={venue.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${venue.name} address in Google Maps`}
                className="flex items-center gap-3 p-4 hover:bg-white/[0.03] transition-colors"
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-400/10 border border-amber-400/30 shrink-0">
                  <MapPin className="w-4 h-4 text-amber-300" aria-hidden="true" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
                    Address
                  </span>
                  <span className="block text-[13px] text-foreground/90 truncate mt-0.5">
                    {venue.address}
                  </span>
                </span>
                <ExternalLink
                  className="w-4 h-4 text-muted-foreground shrink-0"
                  aria-hidden="true"
                />
              </a>
            ) : (
              <div className="flex items-center gap-3 p-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-400/10 border border-amber-400/30 shrink-0">
                  <MapPin className="w-4 h-4 text-amber-300" aria-hidden="true" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
                    Address
                  </span>
                  <span className="block text-[13px] text-foreground/90 mt-0.5">
                    {venue.address}
                  </span>
                </span>
              </div>
            )}
          </section>
        )}
      </div>
    </div>,
    document.body,
  )
}

function VoteChip({
  active,
  icon,
  count,
  venueName,
  onClick,
}: {
  active: boolean
  icon: 'up' | 'down'
  count: number
  venueName: string
  onClick: () => void
}) {
  const Icon = icon === 'up' ? ThumbsUp : ThumbsDown
  const activeColor =
    icon === 'up'
      ? 'border-emerald-400/60 text-emerald-300 bg-emerald-400/10'
      : 'border-rose-400/60 text-rose-300 bg-rose-400/10'
  const label =
    icon === 'up' ? `Vote up ${venueName}` : `Vote down ${venueName}`
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-all',
        active
          ? activeColor
          : 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border',
      )}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{count}</span>
    </button>
  )
}

function formatDistance(km: number | null): string | null {
  if (km == null || !Number.isFinite(km)) return null
  if (km < 1) return `${Math.round(km * 1000)}m`
  return `${km.toFixed(1)}km`
}

function formatRatingCount(n: number | null): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

/**
 * Build the "Why this fits your group" bullets from real signals only.
 * Weather is intentionally never invented — if/when forecast data lands it
 * can be added here.
 */
function buildReasons(
  venue: Venue,
  vibe: Vibe,
  goldenWindow: Props['goldenWindow'],
  midpointFallback: boolean,
): string[] {
  const reasons: string[] = []

  if (!midpointFallback && venue.distance_km != null) {
    if (venue.distance_km < 0.5) {
      reasons.push(
        `Just ${Math.round(venue.distance_km * 1000)}m from your midpoint — practically next door.`,
      )
    } else if (venue.distance_km < 1.5) {
      reasons.push(
        `Close to your midpoint — only ${
          venue.distance_km < 1
            ? `${Math.round(venue.distance_km * 1000)}m`
            : `${venue.distance_km.toFixed(1)}km`
        } away.`,
      )
    }
  }

  if (venue.rating != null && venue.rating >= 4.4) {
    const count = formatRatingCount(venue.rating_count)
    reasons.push(
      count
        ? `Highly rated at ${venue.rating.toFixed(1)}★ across ${count} reviews.`
        : `Highly rated at ${venue.rating.toFixed(1)}★.`,
    )
  }

  if (venue.open_now === true && goldenWindow) {
    reasons.push(
      `Open right now — fits your Golden Window of ${goldenWindow.start_time}–${goldenWindow.end_time}.`,
    )
  } else if (venue.open_now === true) {
    reasons.push('Open right now and ready when your group is.')
  }

  reasons.push(`Matches the group vibe — ${VIBE_LABEL[vibe].toLowerCase()}.`)

  return reasons.slice(0, 4)
}
