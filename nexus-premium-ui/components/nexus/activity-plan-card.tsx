'use client'

import type { PlannerResult } from '@/lib/planners/planner-engine'
import { PubCrawlPlanIntegrated } from './pub-crawl-plan-integrated'
import { SingleVenuePlan } from './single-venue-plan'
import { RoutePlanCard } from './route-plan-card'

interface ActivityPlanCardProps {
  plan: PlannerResult
  onRecalculate?: () => void
  onStartRun?: () => void
}

/**
 * Venue planners already rank several real venues in `plan.stops`.
 * The consolidated planner should not collapse that ranked set back into a
 * single opaque recommendation, so render the strongest distinct candidates
 * as individual plan cards while keeping the existing route/pub-crawl paths
 * unchanged.
 */
function VenuePlanSuggestions({ plan, onRecalculate }: { plan: PlannerResult; onRecalculate?: () => void }) {
  const suggestions = plan.stops
    .filter((stop) => !!stop.venue)
    .slice(0, 3)

  if (suggestions.length <= 1) {
    return <SingleVenuePlan plan={plan} onRecalculate={onRecalculate} />
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.18em]">Nexus suggestions</p>
          <p className="text-xs text-muted-foreground mt-1">{suggestions.length} strong real-world options, ranked by fit.</p>
        </div>
        <span className="text-[10px] text-primary font-medium">BEST FIT →</span>
      </div>

      {suggestions.map((stop, index) => {
        const suggestion: PlannerResult = {
          ...plan,
          stops: [
            {
              ...stop,
              order: 1,
              role: index === 0 ? 'Top pick' : 'Strong alternative',
            },
          ],
          overallScore: stop.score.total,
          totalDistanceKm: stop.venue?.distanceFromCentre ?? plan.totalDistanceKm,
          explanation: stop.venue
            ? `${stop.venue.name} is ${index === 0 ? 'Nexus\'s top recommendation' : 'a strong alternative'} based on the same real-world venue scoring used for the overall plan.`
            : plan.explanation,
        }

        return (
          <SingleVenuePlan
            key={`${stop.venue?.id ?? stop.venue?.name}-${index}`}
            plan={suggestion}
            onRecalculate={index === 0 ? onRecalculate : undefined}
          />
        )
      })}
    </div>
  )
}

export function ActivityPlanCard({ plan, onRecalculate, onStartRun }: ActivityPlanCardProps) {
  if (plan.kind === 'route') {
    return <RoutePlanCard plan={plan} onRecalculate={onRecalculate} onStartRun={onStartRun} />
  }

  if (plan.activityId === 'pub-crawl') {
    return <PubCrawlPlanIntegrated plan={plan} onRecalculate={onRecalculate} />
  }

  return <VenuePlanSuggestions plan={plan} onRecalculate={onRecalculate} />
}
