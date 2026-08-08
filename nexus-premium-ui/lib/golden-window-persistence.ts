/**
 * Golden Window persistence — save and load a group's computed Golden Window
 * to/from Supabase, and mark it stale when availability changes.
 *
 * Requires the columns added by supabase/golden_window_persistence.sql:
 *   groups.golden_window_data        JSONB
 *   groups.golden_window_computed_at TIMESTAMPTZ
 *   groups.golden_window_stale       BOOLEAN
 */

import { supabase } from './supabase'
import type { GoldenWindow } from './golden-window'

export interface SavedGoldenWindowResult {
  window: GoldenWindow | null
  isStale: boolean
  computedAt: string | null
}

/**
 * Persists a computed Golden Window to the group record.
 * Clears the stale flag at the same time so the saved window is fresh.
 */
export async function saveGoldenWindow(
  groupId: string,
  window: GoldenWindow,
): Promise<boolean> {
  const { error } = await supabase
    .from('groups')
    .update({
      golden_window_data:        window as unknown as Record<string, unknown>,
      golden_window_computed_at: new Date().toISOString(),
      golden_window_stale:       false,
    })
    .eq('id', groupId)

  if (error) {
    console.error('[golden-window-persistence] saveGoldenWindow failed', error)
    return false
  }
  return true
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

/**
 * Marks the group's persisted Golden Window as stale.
 * Called when a member updates their availability so the UI can prompt a
 * recalculation rather than silently serving an outdated result.
 */
export async function markGoldenWindowStale(groupId: string): Promise<void> {
  const { error } = await supabase
    .from('groups')
    .update({ golden_window_stale: true })
    .eq('id', groupId)

  if (error) {
    console.error('[golden-window-persistence] markGoldenWindowStale failed', error)
  }
}
