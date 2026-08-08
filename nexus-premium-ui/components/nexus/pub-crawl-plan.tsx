'use client'

import { cn } from '@/lib/utils'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { RefreshCw, MapPin, Clock, Star } from 'lucide-react'
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

function WalkingLeg({
  minutes,
  distanceKm,
}: {
  minutes: number
  distanceKm: number
}) {
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
  const mins = plan.durationMinutes % 60
  const durationLabel =
    hours > 0 && mins > 0
      ? `~${hours}h ${mins}m total`
      : hours > 0
        ? `~${hours}h total`
        : `~${mins}m total`

  return (
    <GlassCard glow className={cn('mb-6 p-5 animate-scale-in', className)}>
      {/* ── Header ── */}
      <div className="mb-4">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div>
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
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
            Stops
          </div>
          <div className="text-sm font-semibold text-foreground">
            {plan.stops.length} pubs
          </div>
        </div>
        <div className="bg-muted/20 rounded-xl px-3 py-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
            Walking
          </div>
          <div className="text-sm font-semibold text-foreground">
            {plan.totalDistanceKm} km · ~{plan.walkingMinutes} min
          </div>
        </div>
        <div className="bg-muted/20 rounded-xl px-3 py-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
            Duration
          </div>
          <div className="text-sm font-semibold text-foreground">{durationLabel}</div>
        </div>
        <div className="bg-muted/20 rounded-xl px-3 py-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
            Est. cost
          </div>
          <div className="text-sm font-semibold text-foreground">
            {plan.estimatedCostLabel} per person
          </div>
        </div>
      </div>

      {/* ── Stop timeline ── */}
      <div className="mb-4">
        {plan.stops.map((stop, i) => (
          <div key={stop.venue.id}>
            {/* Walking leg (between stops) */}
            {i > 0 && (
              <WalkingLeg
                minutes={stop.walkingFromPrevious}
                distanceKm={stop.distanceFromPrevious}
              />
            )}

            {/* Stop card */}
            <div
              className={cn(
                'flex items-start gap-3 px-3 py-3 rounded-xl',
                'bg-muted/10 border border-border/20',
              )}
            >
              <StopBadge order={stop.order} />

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-tight truncate">
                      {stop.venue.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        {format12h(stop.arrivalTime)}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Star className="w-3 h-3 text-primary fill-primary" />
                      <span className="text-xs font-medium text-primary">
                        {stop.venue.rating.toFixed(1)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {priceLevelLabel(stop.venue.priceLevel)}
                    </p>
                  </div>
                </div>

                {/* Atmosphere tags */}
                {stop.venue.atmosphere.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {stop.venue.atmosphere.slice(0, 2).map(tag => (
                      <span
                        key={tag}
                        className="text-[10px] text-muted-foreground bg-muted/20 px-1.5 py-0.5 rounded-full capitalize"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Explanation ── */}
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
