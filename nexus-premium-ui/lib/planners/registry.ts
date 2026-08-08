// ─────────────────────────────────────────────────────────────────────────────
// Planner Registry
// ─────────────────────────────────────────────────────────────────────────────
// Maps activity IDs to their planner implementations.
// To add a new planner: import it and add one entry to PLANNER_REGISTRY.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlannerDefinition } from './types'
import { pubCrawlPlanner } from './pub-crawl-planner'

// Add future planners here:
//   jogging → runningPlanner
//   restaurant → restaurantPlanner
//   hiking → hikingPlanner
//   swimming → swimmingPlanner
const PLANNER_REGISTRY: Record<string, PlannerDefinition> = {
  'pub-crawl': pubCrawlPlanner,
}

/** Returns true if a planner exists for the given activity. */
export function hasPlannerFor(activityId: string | null | undefined): boolean {
  if (!activityId) return false
  return activityId in PLANNER_REGISTRY
}

/** Returns the planner definition for an activity, or null if none exists. */
export function getPlannerFor(
  activityId: string | null | undefined,
): PlannerDefinition | null {
  if (!activityId) return null
  return PLANNER_REGISTRY[activityId] ?? null
}

/** Returns all registered planner activity IDs. */
export function registeredPlannerIds(): string[] {
  return Object.keys(PLANNER_REGISTRY)
}
