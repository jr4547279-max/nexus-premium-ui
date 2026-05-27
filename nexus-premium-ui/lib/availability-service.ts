import { supabase } from './supabase'

export interface AvailabilitySlot {
  day_of_week: number   // 0 = Sun, 1 = Mon, … 6 = Sat
  start_time: string    // "HH:MM"
  end_time: string      // "HH:MM"
}

export interface GroupAvailabilityRow extends AvailabilitySlot {
  user_id: string
  display_name: string | null
  email: string | null
}

export interface SaveAvailabilityResult {
  inserted: number | null
  errorMessage: string | null
}

function formatError(
  error: { code?: string | null; message: string; hint?: string | null; details?: string | null },
  status?: number,
) {
  return `[${error.code ?? status}] ${error.message}${error.hint ? ` — hint: ${error.hint}` : ''}${error.details ? ` — details: ${error.details}` : ''}`
}

/**
 * Returns the current user's saved slots for a group.
 * Direct select is fine — RLS limits rows to (auth.uid(), group_id).
 */
export async function getMyAvailability(groupId: string): Promise<AvailabilitySlot[]> {
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) return []

  const { data, error } = await supabase
    .from('availability')
    .select('day_of_week, start_time, end_time')
    .eq('group_id', groupId)
    .eq('user_id', uid)
    .order('day_of_week')
    .order('start_time')

  if (error) {
    console.error('[availability-service] getMyAvailability failed', error)
    return []
  }
  return (data ?? []) as AvailabilitySlot[]
}

/**
 * Atomically replaces ALL of the current user's slots for a group with
 * the supplied list. Returns the number of rows that landed.
 */
export async function saveAvailability(
  groupId: string,
  slots: AvailabilitySlot[],
): Promise<SaveAvailabilityResult> {
  const { data, error, status } = await supabase
    .rpc('save_availability', { p_group_id: groupId, p_slots: slots })

  if (error) {
    const msg = formatError(error, status)
    console.error('[availability-service] saveAvailability FAILED', msg, error)
    return { inserted: null, errorMessage: msg }
  }
  return { inserted: (data as number) ?? 0, errorMessage: null }
}

/**
 * Returns every group member's availability slots, including display_name.
 * Caller must be a member of the group (enforced inside the RPC).
 */
export async function getGroupAvailability(groupId: string): Promise<GroupAvailabilityRow[]> {
  const { data, error } = await supabase
    .rpc('list_group_availability', { p_group_id: groupId })

  if (error) {
    console.error('[availability-service] getGroupAvailability failed', error)
    return []
  }
  return (data ?? []) as GroupAvailabilityRow[]
}
