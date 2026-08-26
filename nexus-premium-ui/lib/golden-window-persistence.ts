/**
 * Golden Window persistence — save/load a group's computed Golden Window
 * through membership-checked SECURITY DEFINER RPCs.
 *
 * Direct updates to `groups` are intentionally avoided: the normal groups RLS
 * policy only lets the owner update the row, but any authenticated group member
 * is allowed to calculate and refresh the shared Golden Window.
 */

import { supabase } from './supabase'
import { computeGoldenWindows, type GoldenWindow } from './golden-window'

export interface SavedGoldenWindowResult {
  window: GoldenWindow | null
  isStale: boolean
  computedAt: string | null
}

/** Persist a computed window for any authenticated member of the group. */
export async function saveGoldenWindow(
  groupId: string,
  window: GoldenWindow,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('save_golden_window', {
    p_group_id: groupId,
    p_window: window as unknown as Record<string, unknown>,
  })

  if (error) {
    console.error('[golden-window-persistence] saveGoldenWindow failed', error)
    return false
  }
  return data === true
}

/**
 * Loads the persisted Golden Window for a group.
 *
 * If availability exists but the group has never had a saved window (for
 * example, availability was entered before Golden Window persistence was
 * deployed), compute the result immediately and return it. This prevents the
 * UI from getting stuck behind "Find Golden Window first" when all required
 * data is already present.
 */
export async function loadSavedGoldenWindow(
  groupId: string,
): Promise<SavedGoldenWindowResult> {
  const { data, error } = await supabase
    .from('groups')
    .select('golden_window_data, golden_window_computed_at, golden_window_stale')
    .eq('id', groupId)
    .single()

  if (error) {
    // PGRST116 = no rows — not an error condition, just no saved window yet.
    if (error.code !== 'PGRST116') {
      console.error('[golden-window-persistence] loadSavedGoldenWindow failed', error)
    }
    return { window: null, isStale: false, computedAt: null }
  }

  const raw = data as {
    golden_window_data:        Record<string, unknown> | null
    golden_window_computed_at: string | null
    golden_window_stale:       boolean | null
  }

  if (raw.golden_window_data) {
    return {
      window:     raw.golden_window_data as unknown as GoldenWindow,
      isStale:    raw.golden_window_stale ?? false,
      computedAt: raw.golden_window_computed_at,
    }
  }

  // No persisted result yet. Build one from the actual group membership and
  // availability so existing groups become immediately usable.
  try {
    const [{ data: memberRows, error: memberError }, { data: availabilityRows, error: availabilityError }] =
      await Promise.all([
        supabase.from('group_members').select('user_id').eq('group_id', groupId),
        supabase
          .from('availability')
          .select('user_id, day_of_week, start_time, end_time')
          .eq('group_id', groupId),
      ])

    if (memberError || availabilityError) {
      console.warn('[golden-window-persistence] unable to bootstrap Golden Window', {
        memberError,
        availabilityError,
      })
      return { window: null, isStale: false, computedAt: null }
    }

    const members = [...new Set((memberRows ?? []).map((row) => row.user_id))].map((id) => ({
      id,
      name: null,
    }))
    const rows = (availabilityRows ?? []).map((row) => ({
      user_id: row.user_id,
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time,
    }))

    const best = computeGoldenWindows(members, rows)[0] ?? null
    if (!best) return { window: null, isStale: false, computedAt: null }

    const saved = await saveGoldenWindow(groupId, best)
    return {
      window: best,
      isStale: !saved,
      computedAt: new Date().toISOString(),
    }
  } catch (bootstrapError) {
    console.warn('[golden-window-persistence] Golden Window bootstrap failed', bootstrapError)
    return { window: null, isStale: false, computedAt: null }
  }
}

/** Mark the shared result stale after any member changes availability. */
export async function markGoldenWindowStale(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_golden_window_stale', {
    p_group_id: groupId,
  })

  if (error) {
    console.error('[golden-window-persistence] markGoldenWindowStale failed', error)
  }
}
