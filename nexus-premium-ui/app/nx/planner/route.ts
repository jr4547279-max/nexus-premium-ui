import { NextResponse } from 'next/server'
import { runPlanner } from '@/lib/planners/planner-engine'
import type { PlannerRequest } from '@/lib/planners/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Server boundary for activity planning.
 *
 * Venue providers call Google Places and OpenStreetMap/Overpass. Those calls
 * must stay on the server so browser CORS restrictions and provider secrets
 * cannot break the planner.
 */
export async function POST(req: Request) {
  let request: PlannerRequest

  try {
    request = (await req.json()) as PlannerRequest
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid planner request.' },
      { status: 400 },
    )
  }

  if (!request || typeof request.activityId !== 'string' || !request.activityId.trim()) {
    return NextResponse.json(
      { ok: false, error: 'An activity is required to run the planner.' },
      { status: 400 },
    )
  }

  const result = await runPlanner(request)
  return NextResponse.json(result)
}
