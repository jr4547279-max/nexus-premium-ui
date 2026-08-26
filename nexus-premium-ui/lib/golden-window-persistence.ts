/**
 * Golden Window persistence — save/load a group's computed Golden Window
 * through membership-checked SECURITY DEFINER RPCs.
 *
 * Direct updates to `groups` are intentionally avoided: the normal groups RLS
 * policy only lets the owner update the row, but any authenticated group member
 * is allowed to calculate and refresh the shared Golden Window.
 */

import { supabase } from './supabase'
import type { GoldenWindow } from './golden-window'

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
 * Returns { window: null } if none has been generated yet.
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

  return {
    window:     raw.golden_window_data
      ? (raw.golden_window_data as unknown as GoldenWindow)
      : null,
    isStale:    raw.golden_window_stale ?? false,
    computedAt: raw.golden_window_computed_at,
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
