// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY: Developer Test Harness
// ─────────────────────────────────────────────────────────────────────────────
// Thin orchestrator that wires test scenarios into the real engine interfaces.
// No Supabase calls. No fake auth. No side effects.
//
// To remove: delete lib/dev/ and all imports.
// ─────────────────────────────────────────────────────────────────────────────

import { computeGoldenWindows, checkGoldenWindowRequirements } from '@/lib/golden-window'
import type { GoldenWindow, GoldenWindowRequirements } from '@/lib/golden-window'
import { runPlanner } from '@/lib/planners/planner-engine'
import type { PlannerResult } from '@/lib/planners/planner-engine'
import type { DevScenario } from './test-scenarios'
import { toGwMembers } from './test-scenarios'

export interface DevGwResult {
  windows: GoldenWindow[]
  best: GoldenWindow | null
  requirements: GoldenWindowRequirements
}

export type DevPlanResult =
  | { ok: true; result: PlannerResult }
  | { ok: false; error: string }

/**
 * Run the real Golden Window engine against a dev scenario.
 * Returns all windows sorted by quality, plus the requirements check.
 */
export function runDevGoldenWindow(scenario: DevScenario): DevGwResult {
  const members = toGwMembers(scenario)
  const requirements = checkGoldenWindowRequirements(members, scenario.availability)
  const windows = computeGoldenWindows(members, scenario.availability)
  return {
    windows,
    best: windows[0] ?? null,
    requirements,
  }
}

/**
 * Run the real Activity Planner against a GoldenWindow produced by
 * runDevGoldenWindow. Uses the deterministic MockVenueProvider internally.
 *
 * @param activityIdOverride  When set, overrides the scenario's activityId —
 *   lets the dev panel test any registered planner against any scenario.
 */
export async function runDevPlanner(
  scenario: DevScenario,
  goldenWindow: GoldenWindow,
  activityIdOverride?: string,
): Promise<DevPlanResult> {
  return runPlanner({
    groupId: scenario.id,
    activityId: activityIdOverride ?? scenario.activityId,
    goldenWindow: {
      day_of_week:            goldenWindow.day_of_week,
      start_time:             goldenWindow.start_time,
      end_time:               goldenWindow.end_time,
      duration_minutes:       goldenWindow.duration_minutes,
      match_quality:          goldenWindow.match_quality,
      confidence_score:       goldenWindow.confidence_score,
      available_member_count: goldenWindow.available_member_count,
      total_member_count:     goldenWindow.total_member_count,
    },
    budgetPreference: 'medium',
    desiredStops: 4,
    // No groupLocation in dev mode — planners fall back to their internal default
  })
}
