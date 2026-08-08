'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Activity Plan Card Router
// ─────────────────────────────────────────────────────────────────────────────
// Dispatches to the correct plan card component based on activityId.
//   pub-crawl   → PubCrawlPlan  (multi-stop route with full scoring)
//   everything else → SingleVenuePlan (single best-fit venue)

import type { PlannerResult } from '@/lib/planners/planner-engine'
import { PubCrawlPlan } from './pub-crawl-plan'
import { SingleVenuePlan } from './single-venue-plan'

interface ActivityPlanCardProps {
  plan: PlannerResult
  onRecalculate?: () => void
}

export function ActivityPlanCard({ plan, onRecalculate }: ActivityPlanCardProps) {
  if (plan.activityId === 'pub-crawl') {
    return <PubCrawlPlan plan={plan} onRecalculate={onRecalculate} />
  }
  return <SingleVenuePlan plan={plan} onRecalculate={onRecalculate} />
}
