/**
 * Golden Window persistence — save/load a group's computed Golden Window
 * through membership-checked SECURITY DEFINER RPCs.
 */

import { supabase } from './supabase'
import { computeGoldenWindows, type GoldenWindow } from './golden-window'

export interface SavedGoldenWindowResult {
  window: GoldenWindow | null
  isStale: boolean
  computedAt: string | null
}

/** Re-anchor persisted day offsets to the browser's current local date. */
function normalizeWindowTiming(goldenWindow: GoldenWindow): GoldenWindow {
  const now = new Date()
  const todayDow = now.getDay()
  const [hours, minutes] = goldenWindow.start_time.split(':').map(Number)
  const startMinutes = (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  let daysUntil = (goldenWindow.day_of_week - todayDow + 7) % 7
  if (daysUntil === 0 && startMinutes <= nowMinutes) daysUntil = 7

  return { ...goldenWindow, days_until: daysUntil }
}

function cacheForCountdown(goldenWindow: GoldenWindow | null) {
  if (typeof window === 'undefined') return
  try {
    if (goldenWindow) window.localStorage.setItem('nexus:last-golden-window', JSON.stringify(goldenWindow))
    else window.localStorage.removeItem('nexus:last-golden-window')
  } catch {
    // Countdown is progressive enhancement; persistence remains the source of truth.
  }
}

export async function saveGoldenWindow(
  groupId: string,
  goldenWindow: GoldenWindow,
): Promise<boolean> {
  const normalized = normalizeWindowTiming(goldenWindow)
  cacheForCountdown(normalized)

  const { data, error } = await supabase.rpc('save_golden_window', {
    p_group_id: groupId,
    p_window: normalized as unknown as Record<string, unknown>,
  })

  if (error) {
    console.error('[golden-window-persistence] saveGoldenWindow failed', error)
    return false
  }
  return data === true
}

export async function loadSavedGoldenWindow(
  groupId: string,
): Promise<SavedGoldenWindowResult> {
  const { data, error } = await supabase
    .from('groups')
    .select('golden_window_data, golden_window_computed_at, golden_window_stale')
    .eq('id', groupId)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[golden-window-persistence] loadSavedGoldenWindow failed', error)
    }
    return { window: null, isStale: false, computedAt: null }
  }

  const raw = data as {
    golden_window_data: Record<string, unknown> | null
    golden_window_computed_at: string | null
    golden_window_stale: boolean | null
  }

  if (raw.golden_window_data) {
    const savedWindow = normalizeWindowTiming(raw.golden_window_data as unknown as GoldenWindow)
    cacheForCountdown(savedWindow)
    return {
      window: savedWindow,
      isStale: raw.golden_window_stale ?? false,
      computedAt: raw.golden_window_computed_at,
    }
  }

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

    const members = [...new Set((memberRows ?? []).map((row) => row.user_id))].map((id) => ({ id, name: null }))
    const rows = (availabilityRows ?? []).map((row) => ({
      user_id: row.user_id,
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time,
    }))

    const best = computeGoldenWindows(members, rows)[0] ?? null
    if (!best) return { window: null, isStale: false, computedAt: null }

    const saved = await saveGoldenWindow(groupId, best)
    const normalized = normalizeWindowTiming(best)
    if (!saved) cacheForCountdown(normalized)
    return {
      window: normalized,
      isStale: !saved,
      computedAt: new Date().toISOString(),
    }
  } catch (bootstrapError) {
    console.warn('[golden-window-persistence] Golden Window bootstrap failed', bootstrapError)
    return { window: null, isStale: false, computedAt: null }
  }
}

export async function markGoldenWindowStale(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_golden_window_stale', {
    p_group_id: groupId,
  })

  if (error) {
    console.error('[golden-window-persistence] markGoldenWindowStale failed', error)
  }
}
