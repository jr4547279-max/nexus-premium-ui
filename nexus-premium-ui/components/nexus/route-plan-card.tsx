'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Route Plan Card
// ─────────────────────────────────────────────────────────────────────────────
// Renders the result of a route planner (jogging, hiking, walking, cycling).
// Follows the same GlassCard + section pattern as SingleVenuePlan and
// PubCrawlPlan — layout-compatible so it slots in without visual disruption.
//
// Displayed data:
//   • Route title, subtitle, Golden Window quality badge
//   • REAL ROUTES · OSRM data-source badge
//   • Stat row: distance · duration · grade · loop indicator
//   • Waypoint list with cumulative distance markers and arrival times
//   • Explanation text
//   • Warnings (OSRM limitations, compromise schedule)
//   • Group match % bar
//   • "View on Map" link for the start waypoint
//   • Recalculate button
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import {
  RefreshCw, MapPin, Clock, ExternalLink,
  AlertTriangle, Globe, Database, Navigation,
  RotateCcw, TrendingUp,
} from 'lucide-react'
import type { PlannerResult, MatchQuality } from '@/lib/planners/planner-engine'

// ── Quality badge ─────────────────────────────────────────────────────────────

const QUALITY_STYLES: Record<MatchQuality, { label: string; className: string }> = {
  perfect:    { label: 'PERFECT MATCH', className: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
  strong:     { label: 'STRONG MATCH',  className: 'bg-primary/20 text-primary border border-primary/30' },
  partial:    { label: 'PARTIAL MATCH', className: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' },
  compromise: { label: 'BEST OPTION',   className: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' },
}

// ── Grade label ───────────────────────────────────────────────────────────────

const GRADE_LABELS: Record<string, { label: string; className: string }> = {
  easy:     { label: 'Easy',     className: 'text-emerald-400' },
  moderate: { label: 'Moderate', className: 'text-amber-400'   },
  hard:     { label: 'Hard',     className: 'text-orange-400'  },
  expert:   { label: 'Expert',   className: 'text-red-400'     },
}

// ── Data source badge ─────────────────────────────────────────────────────────

function DataSourceBadge({
  source,
  providerName,
}: {
  source?: string
  providerName?: string
}) {
  const isReal = source === 'real'
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider border',
      isReal
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    )}>
      {isReal
        ? <Globe className="w-2.5 h-2.5" />
        : <Database className="w-2.5 h-2.5" />
      }
      {isReal ? 'REAL ROUTES' : 'DEMO ROUTES'}
      {providerName && (
        <span className="opacity-60 font-normal normal-case tracking-normal">
          · {providerName}
        </span>
      )}
    </div>
  )
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ElementType
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-2 bg-muted/10 rounded-xl border border-border/20">
      <Icon className={cn('w-3.5 h-3.5 mb-0.5', className ?? 'text-muted-foreground')} />
      <span className={cn('text-sm font-semibold tabular-nums', className ?? 'text-foreground')}>
        {value}
      </span>
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  )
}

// ── Waypoint type icon ────────────────────────────────────────────────────────

function WaypointIcon({ type }: { type: string }) {
  if (type === 'start') return (
    <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
    </div>
  )
  if (type === 'end') return (
    <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0">
      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
    </div>
  )
  if (type === 'poi') return (
    <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
      <Navigation className="w-2.5 h-2.5 text-amber-400" />
    </div>
  )
  return (
    <div className="w-5 h-5 rounded-full bg-muted/20 border border-border/30 flex items-center justify-center flex-shrink-0">
      <div className="w-1 h-1 rounded-full bg-muted-foreground/50" />
    </div>
  )
}

// ── OSM Maps link for a coordinate ───────────────────────────────────────────

function osmUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lng.toFixed(5)}#map=15/${lat.toFixed(5)}/${lng.toFixed(5)}`
}

// ── Main component ────────────────────────────────────────────────────────────

interface RoutePlanCardProps {
  plan: PlannerResult
  onRecalculate?: () => void
}

export function RoutePlanCard({ plan, onRecalculate }: RoutePlanCardProps) {
  const quality      = (plan.goldenWindowQuality ?? 'partial') as MatchQuality
  const qualityStyle = QUALITY_STYLES[quality]

  const distKm     = plan.totalDistanceKm ?? 0
  const durationMin = plan.durationMinutes ?? 0
  const grade       = plan.routeGrade
  const gradeStyle  = grade ? GRADE_LABELS[grade] : undefined
  const isLoop      = plan.isLoop ?? false

  // Start waypoint — used for the "View on Map" link
  const startStop    = plan.stops.find(s => s.waypoint?.waypointType === 'start') ?? plan.stops[0]
  const startWaypoint = startStop?.waypoint

  // Duration label
  const hours   = Math.floor(durationMin / 60)
  const minutes = durationMin % 60
  const durationLabel =
    hours > 0 ? `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`.trim()
    : `${minutes} min`

  return (
    <GlassCard className="mb-6 overflow-hidden">

      {/* ── Header ── */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground">{plan.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{plan.subtitle}</p>
          </div>
          <span className={cn(
            'flex-shrink-0 text-[10px] font-bold tracking-wider px-2 py-1 rounded-full',
            qualityStyle.className,
          )}>
            {qualityStyle.label}
          </span>
        </div>

        <DataSourceBadge source={plan.dataSource} providerName={plan.providerName} />
      </div>

      <div className="h-px bg-border/20 mx-5" />

      {/* ── Stats row ── */}
      <div className="px-5 pt-4 pb-3">
        <div className="grid grid-cols-4 gap-2">
          <StatChip
            icon={MapPin}
            label="Distance"
            value={`${distKm.toFixed(1)} km`}
            className="text-primary"
          />
          <StatChip
            icon={Clock}
            label="Est. Time"
            value={durationLabel}
            className="text-foreground"
          />
          {gradeStyle ? (
            <StatChip
              icon={TrendingUp}
              label="Grade"
              value={gradeStyle.label}
              className={gradeStyle.className}
            />
          ) : (
            <StatChip
              icon={TrendingUp}
              label="Grade"
              value="—"
            />
          )}
          <StatChip
            icon={RotateCcw}
            label="Type"
            value={isLoop ? 'Loop' : 'Linear'}
            className={isLoop ? 'text-emerald-400' : 'text-muted-foreground'}
          />
        </div>

        {/* Surface summary */}
        {plan.surfaceSummary && (
          <p className="text-[10px] text-muted-foreground mt-2 text-center opacity-70">
            {plan.surfaceSummary}
          </p>
        )}
      </div>

      <div className="h-px bg-border/20 mx-5" />

      {/* ── Waypoints ── */}
      {plan.stops.length > 0 && (
        <div className="p-5 pb-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">
            Route Waypoints
          </p>
          <div className="space-y-2">
            {plan.stops.map((stop, i) => {
              const wp = stop.waypoint
              if (!wp) return null
              return (
                <div
                  key={stop.order ?? i}
                  className="flex items-center gap-3 py-1.5"
                >
                  {/* Connector line above (except first) */}
                  <div className="flex flex-col items-center self-stretch">
                    {i > 0 && (
                      <div className="w-px flex-1 bg-border/25 mb-1" />
                    )}
                    <WaypointIcon type={wp.waypointType} />
                    {i < plan.stops.length - 1 && (
                      <div className="w-px flex-1 bg-border/25 mt-1" />
                    )}
                  </div>

                  {/* Waypoint details */}
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {wp.name}
                      </p>
                      {wp.description && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {wp.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {stop.arrivalTime}
                      </p>
                      {wp.distanceFromStart > 0 && (
                        <p className="text-[9px] text-muted-foreground/60 tabular-nums">
                          {wp.distanceFromStart.toFixed(1)} km
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="h-px bg-border/20 mx-5" />

      {/* ── Details ── */}
      <div className="p-5 pt-4">

        {/* Explanation */}
        {plan.explanation && (
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">
            {plan.explanation}
          </p>
        )}

        {/* View start on map */}
        {startWaypoint && (
          <div className="mb-4">
            <a
              href={osmUrl(startWaypoint.lat, startWaypoint.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-[11px] font-medium transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View start on OpenStreetMap
            </a>
          </div>
        )}

        {/* Warnings */}
        {plan.warnings.length > 0 && (
          <div className="space-y-2 mb-4">
            {plan.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2"
              >
                <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-400 leading-relaxed">{w}</p>
              </div>
            ))}
          </div>
        )}

        {/* Group match % */}
        {plan.groupMatchPercent != null && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <div className="flex-1 h-1 bg-muted/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${plan.groupMatchPercent}%` }}
              />
            </div>
            <span className="tabular-nums">{plan.groupMatchPercent}% of group available</span>
          </div>
        )}

        {/* Recalculate */}
        {onRecalculate && (
          <Button
            onClick={onRecalculate}
            variant="outline"
            className="w-full h-9 rounded-xl text-xs text-muted-foreground border-border/30 hover:border-border/60"
          >
            <RefreshCw className="w-3 h-3 mr-1.5" />
            Recalculate
          </Button>
        )}
      </div>

    </GlassCard>
  )
}
