import { supabase } from './supabase'

export const PLANNING_HORIZONS = [
  'this_week',
  'next_week',
  'week_after_next',
  'next_2_4_weeks',
  'flexible',
] as const

export type PlanningHorizon = typeof PLANNING_HORIZONS[number]

export interface PlanningIntent {
  user_id: string
  group_id: string
  horizon: PlanningHorizon
  updated_at: string
}

export async function getPlanningIntent(groupId: string): Promise<PlanningIntent | null> {
  const { data, error } = await supabase
    .from('availability_intent')
    .select('user_id, group_id, horizon, updated_at')
    .eq('group_id', groupId)
    .maybeSingle()
  if (error || !data) return null
  if (!PLANNING_HORIZONS.includes(data.horizon as PlanningHorizon)) return null
  return data as PlanningIntent
}

export async function savePlanningIntent(groupId: string, horizon: PlanningHorizon): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return false

  const { error } = await supabase
    .from('availability_intent')
    .upsert({
      user_id: userId,
      group_id: groupId,
      horizon,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,group_id' })

  if (error) {
    console.warn('[planning-intent] save failed; migration may not be applied yet', error.message)
    return false
  }
  return true
}
