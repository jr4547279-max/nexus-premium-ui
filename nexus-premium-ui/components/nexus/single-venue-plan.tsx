'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Single Venue Plan Card
// ─────────────────────────────────────────────────────────────────────────────
// Renders the result of a single-venue planner (restaurant, coffee, cinema,
// bowling, live-music, etc.). Distinct from PubCrawlPlan which handles
// multi-stop routes.

import { cn } from '@/lib/utils'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import {
  RefreshCw, MapPin, Clock, ExternalLink, Check,
  AlertTriangle, Database, Globe,
} from 'lucide-react'
import type { PlannerResult, PlannerStop, MatchQuality } from '@/lib/planners/planner-engine'
import { format12h } from '@/lib/planners/scoring'

const QUALITY_STYLES: Record<MatchQuality, { label: string; className: string }> = {
  perfect:    { label: 'PERFECT MATCH', className: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
  strong:     { label: 'STRONG MATCH',  className: 'bg-primary/20 text-primary border border-primary/30' },
  partial:    { label: 'PARTIAL MATCH', className: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' },
  compromise: { label: 'BEST OPTION',   className: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' },
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-muted/30 rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-primary font-medium tabular-nums w-7 text-right">{score}%</span>
    </div>
  )
}

function DataSourceBadge({ source, providerName }: { source?: string; providerName?: string }) {
  const isReal = source === 'real'
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider border',
      isReal ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    )}>
      {isReal ? <Globe className="w-2.5 h-2.5" /> : <Database className="w-2.5 h-2.5" />}
      {isReal ? 'REAL VENUES' : 'DEMO VENUES'}
      {providerName && <span className="opacity-60 font-normal normal-case tracking-normal">· {providerName}</span>}
    </div>
  )
}

interface SingleVenuePlanProps {
  plan: PlannerResult
  onRecalculate?: () => void
}

function openDuringWindow(stop: PlannerStop) {
  const venue = stop.venue
  if (!venue || venue.openingHoursKnown === false) return null
  const t2m = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const start = t2m(stop.arrivalTime)
  const open = t2m(venue.openingTime)
  let close = t2m(venue.closingTime)
  if (close < open) close += 1440
  return start >= open && start <= close
}

function AlternativeVenue({ stop }: { stop: PlannerStop }) {
  const venue = stop.venue
  if (!venue) return null
  const ratingKnown = venue.ratingKnown !== false && venue.rating > 0
  return (
    <div className="rounded-xl border border-border/20 bg-muted/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{venue.name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{venue.distanceFromCentre.toFixed(1)} km</span>
            {ratingKnown && <span>★ {venue.rating.toFixed(1)}</span>}
            {venue.priceLevelKnown !== false && <span>{'£'.repeat(Math.max(1, Math.min(4, venue.priceLevel)))}</span>}
          </div>
          {venue.address && <p className="text-[10px] text-muted-foreground/80 mt-1.5 truncate">{venue.address}</p>}
          {stop.reason && <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">{stop.reason}</p>}
        </div>
        {venue.mapsUrl && (
          <a href={venue.mapsUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-medium">
            <ExternalLink className="w-3 h-3" />Maps
          </a>
        )}
      </div>
      <div className="mt-2"><ScoreBar score={stop.score.total} /></div>
    </div>
  )
}

export function SingleVenuePlan({ plan, onRecalculate }: SingleVenuePlanProps) {
  const stop = plan.stops[0]
  const venue = stop?.venue
  if (!stop || !venue) return null

  const quality = (plan.goldenWindowQuality ?? 'partial') as MatchQuality
  const qualityStyle = QUALITY_STYLES[quality]
  const isRealData = venue.isRealData ?? plan.dataSource === 'real'
  const ratingKnown = venue.ratingKnown !== false && venue.rating > 0
  const priceKnown = venue.priceLevelKnown !== false
  const hoursKnown = venue.openingHoursKnown !== false
  const open = openDuringWindow(stop)
  const alternatives = plan.stops.slice(1, 5)

  return (
    <GlassCard className="mb-6 overflow-hidden">
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground">{plan.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{plan.subtitle}</p>
          </div>
          <span className={cn('flex-shrink-0 text-[10px] font-bold tracking-wider px-2 py-1 rounded-full', qualityStyle.className)}>{qualityStyle.label}</span>
        </div>
        <DataSourceBadge source={plan.dataSource} providerName={plan.providerName} />
      </div>

      <div className="h-px bg-border/20 mx-5" />

      <div className="p-5">
        <div className="bg-muted/10 border border-border/20 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h4 className="text-sm font-semibold text-foreground">{venue.name}</h4>
            <span className="shrink-0 text-[10px] font-semibold text-primary uppercase tracking-wider">Top pick</span>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="w-3 h-3 flex-shrink-0" /><span>{venue.distanceFromCentre.toFixed(1)} km away</span></div>
            {hoursKnown ? (
              <div className={cn('flex items-center gap-1.5 text-xs', open === true ? 'text-emerald-400' : open === false ? 'text-amber-400' : 'text-muted-foreground')}>
                <Clock className="w-3 h-3 flex-shrink-0" />
                <span>{open === true ? `Open · until ${format12h(venue.closingTime)}` : open === false ? `Opens ${format12h(venue.openingTime)}` : `${format12h(venue.openingTime)} – ${format12h(venue.closingTime)}`}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 italic"><Clock className="w-3 h-3 flex-shrink-0" /><span>Hours not listed</span></div>
            )}
          </div>

          {venue.address && <p className="text-[11px] text-muted-foreground mb-3">{venue.address}</p>}

          <div className="mb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Nexus match score</p>
            <ScoreBar score={stop.score.total} />
          </div>

          {ratingKnown && <div className="flex items-center gap-1 text-[11px] text-amber-400 mb-3"><span>★</span><span>{venue.rating.toFixed(1)}</span><span className="text-muted-foreground">/5</span></div>}
          {!ratingKnown && isRealData && <p className="text-[10px] text-muted-foreground italic mb-3">Rating not available on OpenStreetMap</p>}
          {priceKnown && <div className="text-[11px] text-muted-foreground mb-3">{'£'.repeat(Math.max(1, Math.min(4, venue.priceLevel)))}<span className="ml-1 text-[10px] opacity-60">per person est.</span></div>}

          <div className="flex gap-2">
            {venue.mapsUrl && <a href={venue.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-[11px] font-medium transition-colors"><ExternalLink className="w-3 h-3" />Open in Maps</a>}
            {venue.website && <a href={venue.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/20 hover:bg-muted/30 text-muted-foreground text-[11px] font-medium transition-colors"><Globe className="w-3 h-3" />Website</a>}
          </div>
        </div>

        {alternatives.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <div><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Other strong matches</p><p className="text-xs text-muted-foreground mt-0.5">Nexus found {plan.stops.length} real options and ranked them for you.</p></div>
              <span className="text-[10px] text-primary">{alternatives.length} alternatives</span>
            </div>
            <div className="space-y-2.5">{alternatives.map((candidate) => <AlternativeVenue key={`${candidate.venue?.id ?? candidate.venue?.name}-${candidate.order}`} stop={candidate} />)}</div>
          </div>
        )}

        {plan.scoreReasons && plan.scoreReasons.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Why Nexus chose this</p>
            <div className="space-y-1.5">{plan.scoreReasons.slice(0, 4).map((reason, i) => <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="w-3 h-3 text-emerald-500 flex-shrink-0" /><span>{reason}</span></div>)}</div>
          </div>
        )}

        {plan.warnings.length > 0 && (
          <div className="space-y-2 mb-4">{plan.warnings.map((w, i) => <div key={i} className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2"><AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" /><p className="text-[11px] text-amber-400 leading-relaxed">{w}</p></div>)}</div>
        )}

        {plan.groupMatchPercent != null && <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4"><div className="flex-1 h-1 bg-muted/20 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${plan.groupMatchPercent}%` }} /></div><span className="tabular-nums">{plan.groupMatchPercent}% of group available</span></div>}

        {onRecalculate && <Button onClick={onRecalculate} variant="outline" className="w-full h-9 rounded-xl text-xs text-muted-foreground border-border/30 hover:border-border/60"><RefreshCw className="w-3 h-3 mr-1.5" />Recalculate</Button>}
      </div>
    </GlassCard>
  )
}
