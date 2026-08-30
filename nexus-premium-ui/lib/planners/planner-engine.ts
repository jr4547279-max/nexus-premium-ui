// ─────────────────────────────────────────────────────────────────────────────
// Planner Engine
// ─────────────────────────────────────────────────────────────────────────────
// Thin orchestrator. Call `runPlanner` with a PlannerRequest and receive
// a PlannerResult. Error handling lives here so individual planners can throw
// plain Error objects without worrying about UI state.
//
// Browser callers are routed through /nx/planner so provider credentials and
// server-only network calls never run in the client. The API route calls this
// same function on the server, where the planner registry executes normally.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlannerRequest, PlannerResult } from './types'
import { getPlannerFor } from './registry'

export type PlannerEngineResult =
  | { ok: true; result: PlannerResult }
  | { ok: false; error: string }

async function runPlannerServer(
  request: PlannerRequest,
): Promise<PlannerEngineResult> {
  const engineStart = performance.now()
  console.log(`[NEXUS:Engine] runPlanner start — activityId=${request.activityId}`)

  try {
    const planner = getPlannerFor(request.activityId)

    if (!planner) {
      return {
        ok: false,
        error: `No planner is available for this activity yet. Check back soon.`,
      }
    }

    const result = await planner.plan(request)
    console.log(`[NEXUS:Engine] ✓ done — ${Math.round(performance.now() - engineStart)}ms`)
    return { ok: true, result }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Something went wrong while planning. Please try again.'
    console.warn(`[NEXUS:Engine] ✗ error after ${Math.round(performance.now() - engineStart)}ms:`, message)
    return { ok: false, error: message }
  }
}

/**
 * Run the planner for the activity specified in `request.activityId`.
 * Browser callers use the server API; server callers execute the planner
 * registry directly. Always resolves (never rejects).
 */
export async function runPlanner(
  request: PlannerRequest,
): Promise<PlannerEngineResult> {
  if (typeof window !== 'undefined') {
    try {
      const response = await fetch('/nx/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        return {
          ok: false,
          error: `Planner service returned an unexpected response (HTTP ${response.status}).`,
        }
      }

      const payload = (await response.json()) as PlannerEngineResult
      if (payload && typeof payload === 'object' && 'ok' in payload) {
        return payload
      }

      return { ok: false, error: 'Planner service returned an invalid response.' }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Planner request failed.'
      return { ok: false, error: `Could not reach the planner service. ${message}` }
    }
  }

  return runPlannerServer(request)
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
  RoutePreferences,
  RouteTypePreference,
  SurfacePreference,
  DifficultyPreference,
  RouteCandidate,
} from './types'
export { DEFAULT_ROUTE_PREFERENCES } from './types'
