'use client'

import type { PlannerResult } from '@/lib/planners/planner-engine'
import { PubCrawlPlanV2 } from './pub-crawl-plan-v2'
import { SingleVenuePlan } from './single-venue-plan'
import { RoutePlanCard } from './route-plan-card'

interface ActivityPlanCardProps {
  plan: PlannerResult
  onRecalculate?: () => void
  onStartRun?: () => void
}

export function ActivityPlanCard({ plan, onRecalculate, onStartRun }: ActivityPlanCardProps) {
  if (plan.kind === 'route') {
    return <RoutePlanCard plan={plan} onRecalculate={onRecalculate} onStartRun={onStartRun} />
  }

  if (plan.activityId === 'pub-crawl') {
    return <PubCrawlPlanV2 plan={plan} onRecalculate={onRecalculate} />
  }

  return <SingleVenuePlan plan={plan} onRecalculate={onRecalculate} />
}
