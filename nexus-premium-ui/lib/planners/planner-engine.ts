// ─────────────────────────────────────────────────────────────────────────────
// Planner Engine
// ─────────────────────────────────────────────────────────────────────────────
// Thin orchestrator. Call `runPlanner` with a PlannerRequest and receive
// a PlannerResult. Error handling lives here so individual planners can throw
// plain Error objects without worrying about UI state.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlannerRequest, PlannerResult } from './types'
import { getPlannerFor, hasPlannerFor } from './registry'

export type PlannerEngineResult =
  | { ok: true; result: PlannerResult }
  | { ok: false; error: string }

/**
 * Run the planner for the activity specified in `request.activityId`.
 * Always resolves (never rejects). Check `result.ok` before reading `result.result`.
 */
export async function runPlanner(
  request: PlannerRequest,
): Promise<PlannerEngineResult> {
  try {
    const planner = getPlannerFor(request.activityId)

    if (!planner) {
      return {
        ok: false,
        error: `No planner is available for this activity yet. Check back soon.`,
      }
    }

    const result = await planner.plan(request)
    return { ok: true, result }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Something went wrong while planning. Please try again.'
    return { ok: false, error: message }
  }
}

// Re-export for convenience so callers only need one import
export { hasPlannerFor, getPlannerFor } from './registry'
export type {
  PlannerRequest,
  PlannerResult,
  PlannerStop,
  PlannerScore,
  MatchQuality,
  GoldenWindowLike,
  RouteType,
} from './types'
