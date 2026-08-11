import { supabase } from './supabase'
import { markGoldenWindowStale } from './golden-window-persistence'

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
 *
 * After a successful save the group's persisted Golden Window is marked stale
 * so the UI can prompt recalculation. The stale marking is best-effort —
 * a failure there is non-fatal and does not affect the save result.
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

  // Mark the saved Golden Window stale only after a confirmed successful save.
  markGoldenWindowStale(groupId).catch(() => {
    // Best-effort — stale marking is non-fatal.
  })

  return { inserted: (data as number) ?? 0, errorMessage: null }
}

/**
 * Returns every group member's availability slots, including display_name.
 *
 * Implementation note: the `list_group_availability` SECURITY DEFINER RPC
 * guards itself with `is_group_member(auth.uid())`, but `auth.uid()` can
 * return null when PostgREST invokes a SECURITY DEFINER function in certain
 * Supabase configurations — causing the RPC to raise `not_a_member` even for
 * valid authenticated sessions.
 *
 * The direct table query is the reliable path: the
 * `availability_select_group_member` RLS policy (`using is_group_member(group_id)`)
 * evaluates correctly for authenticated clients, and is the same mechanism
 * that `getMyAvailability` and `saveAvailability` use successfully.
 *
 * Display names are fetched best-effort: the `profiles` RLS only allows each
 * user to read their own row, so other members' names fall back to null (shown
 * as "Member" in the editor summary — the GW calculation never uses display_name).
 */
export async function getGroupAvailability(groupId: string): Promise<GroupAvailabilityRow[]> {
  // ── Primary path: direct table query via RLS ──────────────────────────────
  const { data: availData, error: availError } = await supabase
    .from('availability')
    .select('user_id, day_of_week, start_time, end_time')
    .eq('group_id', groupId)
    .order('user_id')
    .order('day_of_week')
    .order('start_time')

  if (availError) {
    console.error('[availability-service] getGroupAvailability (direct) failed', availError)
    // ── Fallback: try the original RPC ─────────────────────────────────────
    const { data, error } = await supabase
      .rpc('list_group_availability', { p_group_id: groupId })
    if (error) {
      console.error('[availability-service] getGroupAvailability (RPC fallback) also failed', error)
      return []
    }
    return (data ?? []) as GroupAvailabilityRow[]
  }

  const rows = (availData ?? []) as Pick<
    GroupAvailabilityRow,
    'user_id' | 'day_of_week' | 'start_time' | 'end_time'
  >[]
  if (rows.length === 0) return []

  // ── Best-effort display name enrichment ───────────────────────────────────
  // Profiles RLS: each user can only read their own row.  In practice this
  // means the current user's name is always resolved; other members show null
  // (which the editor summary renders as "Member").  The GW engine never reads
  // display_name, so this does not affect window calculation.
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const profileMap = new Map<string, { display_name: string | null; email: string | null }>()

  if (userIds.length > 0) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', userIds)
    for (const p of (profileData ?? [])) {
      profileMap.set(p.id, {
        display_name: (p as { display_name?: string | null }).display_name ?? null,
        email:        (p as { email?: string | null }).email ?? null,
      })
    }
  }

  return rows.map((r) => ({
    user_id:      r.user_id,
    day_of_week:  r.day_of_week,
    start_time:   r.start_time,
    end_time:     r.end_time,
    display_name: profileMap.get(r.user_id)?.display_name ?? null,
    email:        profileMap.get(r.user_id)?.email ?? null,
  }))
}
