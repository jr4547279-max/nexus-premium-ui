'use client'

import { cn } from '@/lib/utils'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { RefreshCw, MapPin, Clock, Star, Globe, Database } from 'lucide-react'
import type { PlannerResult, MatchQuality } from '@/lib/planners/planner-engine'
import { format12h } from '@/lib/planners/pub-crawl-planner'

// ── Quality badge ─────────────────────────────────────────────────────────────

const QUALITY_STYLES: Record<MatchQuality, { label: string; className: string }> = {
  perfect: {
    label: 'PERFECT MATCH',
    className: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  },
  strong: {
    label: 'STRONG MATCH',
    className: 'bg-primary/20 text-primary border border-primary/30',
  },
  partial: {
    label: 'PARTIAL MATCH',
    className: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  },
  compromise: {
    label: 'BEST OPTION',
    className: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  },
}

// ── Crawl role badge colours ───────────────────────────────────────────────────

const ROLE_STYLES: Record<string, string> = {
  'Opener':    'bg-sky-500/15 text-sky-400 border-sky-500/25',
  'Building':  'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'Mid-crawl': 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'Peak':      'bg-primary/15 text-primary border-primary/25',
  'Finale':    'bg-purple-500/15 text-purple-400 border-purple-500/25',
}

// ── Data source badge ─────────────────────────────────────────────────────────
// Mirrors SingleVenuePlan's DataSourceBadge — preserved as a standalone
// component so the pub-crawl card is self-contained.

function DataSourceBadge({
  source,
  providerName,
}: {
  source?: string
  providerName?: string
}) {
  const isReal = source === 'real'
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider border',
        isReal
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      )}
    >
      {isReal ? <Globe className="w-2.5 h-2.5" /> : <Database className="w-2.5 h-2.5" />}
      {isReal ? 'REAL VENUES' : 'DEMO VENUES'}
      {providerName && (
        <span className="opacity-60 font-normal normal-case tracking-normal">
          · {providerName}
        </span>
      )}
    </div>
  )
}

// ── Price level label ─────────────────────────────────────────────────────────

function priceLevelLabel(level: number): string {
  return '£'.repeat(Math.max(1, Math.min(4, level)))
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-muted/30 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[10px] text-primary font-medium tabular-nums w-7 text-right">
        {score}%
      </span>
    </div>
  )
}

// ── Stop number badge ─────────────────────────────────────────────────────────

function StopBadge({ order }: { order: number }) {
  return (
    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
      <span className="text-xs font-bold text-primary">{order}</span>
    </div>
  )
}

// ── Walking leg ───────────────────────────────────────────────────────────────

function WalkingLeg({ minutes, distanceKm }: { minutes: number; distanceKm: number }) {
  return (
    <div className="flex items-center gap-2 py-1.5 pl-3">
      <div className="w-px h-5 bg-border/40 ml-3" />
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground ml-1">
        <MapPin className="w-3 h-3 flex-shrink-0" />
        <span>{minutes} min walk</span>
        <span className="text-border/60">·</span>
        <span>{distanceKm < 0.1 ? '<0.1' : distanceKm.toFixed(1)} km</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface PubCrawlPlanProps {
  plan: PlannerResult
  onRecalculate?: () => void
  className?: string
}

export function PubCrawlPlan({ plan, onRecalculate, className }: PubCrawlPlanProps) {
  const quality = plan.goldenWindowQuality ?? 'partial'
  const qualityStyle = QUALITY_STYLES[quality]

  const hours = Math.floor(plan.durationMinutes / 60)
  const mins  = plan.durationMinutes % 60
  const durationLabel =
    hours > 0 && mins > 0 ? `~${hours}h ${mins}m total` :
    hours > 0              ? `~${hours}h total` :
                             `~${mins}m total`

  return (
    <GlassCard glow className={cn('mb-6 p-5 animate-scale-in', className)}>

      {/* ── Header ── */}
      <div className="mb-4">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              {plan.title}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{plan.subtitle}</p>
          </div>
          <span
            className={cn(
              'flex-shrink-0 text-[10px] font-bold tracking-wider px-2 py-1 rounded-full',
              qualityStyle.className,
            )}
          >
            {qualityStyle.label}
          </span>
        </div>

        {/* Data source badge — shows REAL VENUES · OpenStreetMap or DEMO VENUES */}
        {(plan.dataSource || plan.providerName) && (
          <div className="mt-2">
            <DataSourceBadge source={plan.dataSource} providerName={plan.providerName} />
          </div>
        )}

        {plan.groupMatchPercent !== undefined && (
          <div className="mt-2">
            <ScoreBar score={plan.groupMatchPercent} />
            <p className="text-[11px] text-muted-foreground mt-1">
              {plan.groupMatchPercent}% group availability
            </p>
          </div>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        <div className="bg-muted/20 rounded-xl px-3 py-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Stops</div>
          <div className="text-sm font-semibold text-foreground">{plan.stops.length} pubs</div>
        </div>
        <div className="bg-muted/20 rounded-xl px-3 py-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Walking</div>
          <div className="text-sm font-semibold text-foreground">
            {plan.totalDistanceKm} km · ~{plan.walkingMinutes} min
          </div>
        </div>
        <div className="bg-muted/20 rounded-xl px-3 py-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Duration</div>
          <div className="text-sm font-semibold text-foreground">{durationLabel}</div>
        </div>
        <div className="bg-muted/20 rounded-xl px-3 py-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Est. cost</div>
          <div className="text-sm font-semibold text-foreground">{plan.estimatedCostLabel} per person</div>
        </div>
      </div>

      {/* ── Stop timeline ── */}
      <div className="mb-4">
        {plan.stops.map((stop, i) => {
          // Guard: venue is always defined for pub-crawl (kind:'venue') plans.
          // The early return satisfies TypeScript's optional-field check and
          // ensures this component stays safe if ever called with a route plan.
          const venue = stop.venue
          if (!venue) return null

          // Only display rating when the provider confirmed real data.
          // OSM venues have rating: 0 with ratingKnown: false — showing "0.0 ★"
          // would mislead the user about venue quality.
          const ratingKnown = venue.ratingKnown !== false && venue.rating > 0
          const priceKnown  = venue.priceLevelKnown !== false
          const roleStyle   = stop.role
            ? (ROLE_STYLES[stop.role] ?? 'bg-muted/20 text-muted-foreground border-border/20')
            : null

          return (
            <div key={venue.id}>
              {/* Walking leg between stops */}
              {i > 0 && (
                <WalkingLeg
                  minutes={stop.walkingFromPrevious}
                  distanceKm={stop.distanceFromPrevious}
                />
              )}

              {/* Stop card */}
              <div className="flex items-start gap-3 px-3 py-3 rounded-xl bg-muted/10 border border-border/20">
                <StopBadge order={stop.order} />

                <div className="flex-1 min-w-0">
                  {/* Name row + optional rating/price */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-tight truncate">
                        {venue.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">
                          {format12h(stop.arrivalTime)}
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground">
                          {format12h(stop.departureTime)}
                        </span>
                      </div>
                    </div>

                    {/* Right-side: rating when known, price when known */}
                    <div className="flex-shrink-0 text-right">
                      {ratingKnown ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Star className="w-3 h-3 text-primary fill-primary" />
                          <span className="text-xs font-medium text-primary">
                            {venue.rating.toFixed(1)}
                          </span>
                        </div>
                      ) : (
                        /* Real venue without a rating — show venue type from OSM tags */
                        venue.tags.length > 0 ? (
                          <span className="text-[10px] text-muted-foreground/60 capitalize">
                            {venue.tags[0]}
                          </span>
                        ) : null
                      )}
                      {priceKnown && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {priceLevelLabel(venue.priceLevel)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Role badge + atmosphere tags */}
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {/* Crawl arc role — e.g. "Opener", "Peak", "Finale" */}
                    {stop.role && roleStyle && (
                      <span
                        className={cn(
                          'text-[10px] font-semibold px-1.5 py-0.5 rounded-full border',
                          roleStyle,
                        )}
                      >
                        {stop.role}
                      </span>
                    )}
                    {/* Atmosphere tags (mock venues only — real venues have none) */}
                    {venue.atmosphere.slice(0, 2).map(tag => (
                      <span
                        key={tag}
                        className="text-[10px] text-muted-foreground bg-muted/20 px-1.5 py-0.5 rounded-full capitalize"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Per-stop reason — honest, never invented */}
                  {stop.reason && (
                    <p className="text-[11px] text-muted-foreground/70 mt-1 leading-snug">
                      {stop.reason}
                    </p>
                  )}

                  {/* Address — real venues only, when OSM provides it */}
                  {venue.address && venue.isRealData && (
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5 truncate">
                      {venue.address}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Crawl summary ── */}
      <p className="text-xs text-muted-foreground leading-relaxed mb-4 px-1">
        {plan.explanation}
      </p>

      {/* ── Warnings ── */}
      {plan.warnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5 mb-4">
          {plan.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-400 leading-relaxed">
              {w}
            </p>
          ))}
        </div>
      )}

      {/* ── Actions ── */}
      {onRecalculate && (
        <Button
          variant="outline"
          onClick={onRecalculate}
          className="w-full h-9 rounded-xl text-xs text-muted-foreground border-border/40 hover:text-foreground"
        >
          <RefreshCw className="w-3 h-3 mr-1.5" />
          Recalculate
        </Button>
      )}
    </GlassCard>
  )
}
