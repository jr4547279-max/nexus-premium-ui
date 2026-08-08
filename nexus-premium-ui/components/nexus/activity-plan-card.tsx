'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Activity Plan Card Router
// ─────────────────────────────────────────────────────────────────────────────
// Dispatches to the correct plan card component based on plan.kind and
// plan.activityId. Uses the PlannerKind discriminant rather than hardcoding
// activity IDs so that new planner types slot in without modifying this file.
//
// Routing table:
//   kind:'venue'  + activityId:'pub-crawl' → PubCrawlPlan  (multi-stop route)
//   kind:'venue'  + any other id           → SingleVenuePlan (single best venue)
//   kind:'route'                           → RoutePlan (not yet implemented)
//
// When the first route planner is built, replace the null branch with:
//   import { RoutePlan } from './route-plan'
//   return <RoutePlan plan={plan} onRecalculate={onRecalculate} />

import type { PlannerResult } from '@/lib/planners/planner-engine'
import { PubCrawlPlan } from './pub-crawl-plan'
import { SingleVenuePlan } from './single-venue-plan'

interface ActivityPlanCardProps {
  plan: PlannerResult
  onRecalculate?: () => void
}

export function ActivityPlanCard({ plan, onRecalculate }: ActivityPlanCardProps) {
  // Route plans — RoutePlan UI will be created in the next task.
  // Returning null is safe: group-detail.tsx still transitions its phase state
  // correctly; the plan card area is simply empty until RoutePlan exists.
  if (plan.kind === 'route') {
    return null
  }

  // Venue plans
  if (plan.activityId === 'pub-crawl') {
    return <PubCrawlPlan plan={plan} onRecalculate={onRecalculate} />
  }
  return <SingleVenuePlan plan={plan} onRecalculate={onRecalculate} />
}
