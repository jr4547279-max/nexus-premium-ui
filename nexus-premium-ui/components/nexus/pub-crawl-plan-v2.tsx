'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { Clock, ExternalLink, MapPin, RefreshCw, Star, Footprints, Sparkles, X } from 'lucide-react'
import type { PlannerResult, MatchQuality } from '@/lib/planners/planner-engine'
import type { PlannerVenue } from '@/lib/planners/types'
import { format12h } from '@/lib/planners/pub-crawl-planner'
import { buildMapUrl } from '@/lib/venue-service'

const QUALITY: Record<MatchQuality, { label: string; className: string }> = {
  perfect: { label: 'PERFECT MATCH', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  strong: { label: 'STRONG MATCH', className: 'bg-primary/15 text-primary border-primary/30' },
  partial: { label: 'PARTIAL MATCH', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  compromise: { label: 'BEST OPTION', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
}

const ROLE: Record<string, string> = {
  Opener: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  Building: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  'Mid-crawl': 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  Peak: 'bg-primary/15 text-primary border-primary/25',
  Finale: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
}

type RichVenue = PlannerVenue & {
  photoUrl?: string | null
  ratingCount?: number | null
  description?: string | null
}

function richVenue(venue: PlannerVenue): RichVenue {
  return venue as RichVenue
}

function price(level: number): string {
  return '£'.repeat(Math.max(1, Math.min(4, level)))
}

function VenuePhoto({ venue }: { venue: RichVenue }) {
  if (venue.photoUrl) {
    return (
      <img src={venue.photoUrl} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
    )
  }
  return (
    <div className="w-full h-full bg-gradient-to-br from-primary/20 via-muted/30 to-background flex items-center justify-center">
      <span className="text-3xl">🍻</span>
    </div>
  )
}

function StopCard({
  stop,
  index,
  onSelect,
}: {
  stop: PlannerResult['stops'][number]
  index: number
  onSelect: (stop: PlannerResult['stops'][number]) => void
}) {
  if (!stop.venue) return null
  const venue = richVenue(stop.venue)
  const ratingKnown = venue.ratingKnown !== false && venue.rating > 0
  const roleStyle = stop.role ? ROLE[stop.role] : undefined

  return (
    <div className="relative">
      {index > 0 && (
        <div className="flex items-center gap-2 py-2 pl-5 text-[11px] text-muted-foreground">
          <div className="h-5 w-px bg-border/50" />
          <Footprints className="w-3 h-3" />
          <span>{stop.walkingFromPrevious} min walk</span>
          <span className="text-border/50">·</span>
          <span>{stop.distanceFromPrevious < 0.1 ? '<0.1' : stop.distanceFromPrevious.toFixed(1)} km</span>
        </div>
      )}

      <div
        className="overflow-hidden rounded-2xl border border-border/30 bg-muted/10 cursor-pointer transition-all hover:border-primary/35 hover:bg-muted/15 active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        role="button"
        tabIndex={0}
        aria-label={`View details for ${venue.name}`}
        onClick={() => onSelect(stop)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect(stop)
          }
        }}
      >
        <div className="relative h-36 overflow-hidden">
          <VenuePhoto venue={venue} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute left-3 bottom-3 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shadow-lg">{stop.order}</div>
            {stop.role && <span className={cn('px-2 py-1 rounded-full border text-[10px] font-semibold', roleStyle ?? 'bg-black/30 text-white border-white/20')}>{stop.role}</span>}
          </div>
          {ratingKnown && (
            <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full bg-black/50 backdrop-blur px-2 py-1">
              <Star className="w-3 h-3 text-primary fill-primary" />
              <span className="text-xs font-semibold text-white">{venue.rating.toFixed(1)}</span>
              {venue.ratingCount ? <span className="text-[10px] text-white/60">({venue.ratingCount})</span> : null}
            </div>
          )}
        </div>

        <div className="p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{venue.name}</h3>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{format12h(stop.arrivalTime)}–{format12h(stop.departureTime)}</span>
                <span className="text-border/50">·</span>
                <span>{venue.priceLevelKnown === false ? 'price n/a' : price(venue.priceLevel)}</span>
              </div>
            </div>
            {venue.mapsUrl && (
              <a
                href={venue.mapsUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="shrink-0 w-8 h-8 rounded-lg bg-muted/40 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                aria-label={`Open ${venue.name} in maps`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {venue.tags.slice(0, 3).map((tag) => <span key={tag} className="px-2 py-0.5 rounded-full bg-muted/30 text-[10px] text-muted-foreground capitalize">{tag.replace(/[-_]/g, ' ')}</span>)}
            {venue.openingHoursKnown && <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-[10px] text-emerald-400">hours confirmed</span>}
          </div>

          {venue.address && (
            <p className="flex items-center gap-1.5 mt-2.5 text-[10px] text-muted-foreground/60 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              {venue.address}
            </p>
          )}
          {stop.reason && <p className="mt-2 text-[11px] text-muted-foreground/75 leading-relaxed">{stop.reason}</p>}
          <p className="mt-2 text-[10px] text-primary/70">Tap for venue details · why Nexus picked it · map</p>
        </div>
      </div>
    </div>
  )
}

export function PubCrawlPlanV2({ plan, onRecalculate }: { plan: PlannerResult; onRecalculate?: () => void }) {
  const quality = QUALITY[plan.goldenWindowQuality ?? 'partial']
  const hours = Math.floor(plan.durationMinutes / 60)
  const mins = plan.durationMinutes % 60
  const duration = hours ? `~${hours}h${mins ? ` ${mins}m` : ''}` : `~${mins}m`
  const [selectedStop, setSelectedStop] = useState<PlannerResult['stops'][number] | null>(null)
  const selectedVenue = selectedStop?.venue ? richVenue(selectedStop.venue) : null
  const selectedDescription = selectedVenue?.description?.trim() || (
    selectedVenue
      ? `A real ${selectedVenue.atmosphere.slice(0, 2).join(' and ')} pub selected for this crawl, with the route, Golden Window and venue quality all considered.`
      : ''
  )
  const selectedMapUrl = selectedVenue
    ? buildMapUrl({
        lat: selectedVenue.lat,
        lng: selectedVenue.lng,
        topPickCoord: { lat: selectedVenue.lat, lng: selectedVenue.lng },
        zoom: 16,
        w: 640,
        h: 320,
      })
    : null

  return (
    <GlassCard glow className="mb-6 p-5 animate-scale-in">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 text-primary text-[10px] uppercase tracking-[0.18em] font-semibold"><Sparkles className="w-3.5 h-3.5" />Real-world plan</div>
          <h2 className="text-xl font-bold mt-1 tracking-tight">{plan.title}</h2>
          <p className="text-xs text-muted-foreground mt-1">{plan.subtitle}</p>
        </div>
        <span className={cn('shrink-0 px-2 py-1 rounded-full border text-[9px] font-bold tracking-wider', quality.className)}>{quality.label}</span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 mb-5">
        {[[String(plan.stops.length), 'stops'], [`${plan.totalDistanceKm} km`, 'walk'], [duration, 'duration'], [plan.estimatedCostLabel || '—', 'cost']].map(([value, label]) => (
          <div key={label} className="rounded-xl bg-muted/20 px-2 py-2.5 text-center"><div className="text-xs font-semibold truncate">{value}</div><div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div></div>
        ))}
      </div>

      <div className="space-y-0">{plan.stops.map((stop, index) => <StopCard key={stop.venue?.id ?? stop.order} stop={stop} index={index} onSelect={setSelectedStop} />)}</div>

      <div className="mt-5 rounded-2xl bg-primary/5 border border-primary/10 p-3.5"><p className="text-xs text-muted-foreground leading-relaxed">{plan.explanation}</p></div>

      {plan.warnings.length > 0 && <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">{plan.warnings.map((warning) => <p key={warning} className="text-xs text-amber-400 leading-relaxed">{warning}</p>)}</div>}

      {onRecalculate && <Button variant="outline" onClick={onRecalculate} className="w-full h-9 mt-4 rounded-xl text-xs"><RefreshCw className="w-3 h-3 mr-1.5" />Recalculate</Button>}

      {selectedVenue && selectedStop && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedVenue.name} details`}
          onClick={() => setSelectedStop(null)}
        >
          <div
            className="relative w-full sm:max-w-md max-h-[94vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-primary/20 bg-[#05080f] text-foreground shadow-[0_0_80px_rgba(251,191,36,0.12)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative h-48 overflow-hidden">
              <VenuePhoto venue={selectedVenue} />
              <div className="absolute inset-0 bg-gradient-to-t from-[#05080f] via-black/10 to-transparent" />
              <button
                type="button"
                onClick={() => setSelectedStop(null)}
                aria-label="Close venue details"
                className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white backdrop-blur hover:bg-black/75"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute left-4 right-12 bottom-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn('px-2 py-1 rounded-full border text-[9px] font-bold uppercase', ROLE[selectedStop.role ?? ''] ?? 'bg-black/30 text-white border-white/20')}>{selectedStop.role ?? `Stop ${selectedStop.order}`}</span>
                  {selectedVenue.isRealData && <span className="px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[9px] font-semibold text-emerald-300">REAL VENUE</span>}
                </div>
                <h2 className="text-2xl font-bold text-white leading-tight">{selectedVenue.name}</h2>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {selectedVenue.ratingKnown !== false && selectedVenue.rating > 0 && (
                  <span className="inline-flex items-center gap-1 text-primary font-medium"><Star className="w-3.5 h-3.5 fill-current" />{selectedVenue.rating.toFixed(1)}{selectedVenue.ratingCount ? ` (${selectedVenue.ratingCount})` : ''}</span>
                )}
                <span>{format12h(selectedStop.arrivalTime)}–{format12h(selectedStop.departureTime)}</span>
                <span>·</span>
                <span>{price(selectedVenue.priceLevel)}</span>
              </div>

              <section className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
                <h3 className="flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase text-primary mb-2.5"><Sparkles className="w-3.5 h-3.5" />Why this pub is a good fit</h3>
                <ul className="space-y-2 text-[13px] leading-snug text-foreground/90">
                  <li className="flex gap-2"><span className="text-primary">•</span><span>{selectedStop.reason || 'Selected as a strong fit for this crawl.'}</span></li>
                  {selectedVenue.ratingKnown !== false && selectedVenue.rating > 0 && <li className="flex gap-2"><span className="text-primary">•</span><span>Rated {selectedVenue.rating.toFixed(1)}{selectedVenue.ratingCount ? ` from ${selectedVenue.ratingCount.toLocaleString()} reviews` : ''}.</span></li>}
                  <li className="flex gap-2"><span className="text-primary">•</span><span>{selectedStop.distanceFromPrevious > 0 ? `${selectedStop.distanceFromPrevious.toFixed(1)} km and about ${selectedStop.walkingFromPrevious} min from the previous stop.` : 'The natural starting point for the crawl.'}</span></li>
                  {selectedVenue.openingHoursKnown && <li className="flex gap-2"><span className="text-primary">•</span><span>Opening hours were confirmed for the venue search.</span></li>}
                </ul>
              </section>

              <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <h3 className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">About this place</h3>
                <p className="text-[13px] leading-relaxed text-foreground/85">{selectedDescription}</p>
              </section>

              {selectedVenue.address && (
                <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-muted-foreground">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                  <span>{selectedVenue.address}</span>
                </div>
              )}

              {selectedMapUrl && (
                <section className="overflow-hidden rounded-xl border border-primary/15 bg-white/[0.02]">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <h3 className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">Where it is</h3>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">Venue location</p>
                    </div>
                    {selectedVenue.mapsUrl && (
                      <a
                        href={selectedVenue.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Directions
                      </a>
                    )}
                  </div>
                  <img src={selectedMapUrl} alt={`Map showing ${selectedVenue.name}`} className="block w-full aspect-[2/1] object-cover bg-[#08111d]" loading="lazy" />
                </section>
              )}

              <button
                type="button"
                onClick={() => setSelectedStop(null)}
                className="w-full h-10 rounded-xl border border-white/10 bg-white/[0.03] text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
              >
                Back to crawl
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </GlassCard>
  )
}
