import { nexusApi } from './nexus-api'
import type { GoldenWindow } from './golden-window'

export interface SavedGoldenWindowResult {
  window: GoldenWindow | null
  isStale: boolean
  computedAt: string | null
}

function normalizeWindowTiming(window: GoldenWindow): GoldenWindow {
  const now = new Date()
  const [hours, minutes] = window.start_time.split(':').map(Number)
  const startMinutes = (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0)
  let daysUntil = (window.day_of_week - now.getDay() + 7) % 7
  if (daysUntil === 0 && startMinutes <= now.getHours() * 60 + now.getMinutes()) daysUntil = 7
  return { ...window, days_until: daysUntil }
}

function cacheForCountdown(goldenWindow: GoldenWindow | null) {
  if (typeof window === 'undefined') return
  try {
    if (goldenWindow) window.localStorage.setItem('nexus:last-golden-window', JSON.stringify(goldenWindow))
    else window.localStorage.removeItem('nexus:last-golden-window')
  } catch { /* Countdown cache is a progressive enhancement. */ }
}

export async function saveGoldenWindow(groupId: string, _goldenWindow: GoldenWindow): Promise<boolean> {
  try {
    const result = await nexusApi<{ windows: GoldenWindow[]; computed_at: string }>(`/v1/circles/${encodeURIComponent(groupId)}/golden-window`)
    const best = result.windows[0] ? normalizeWindowTiming(result.windows[0]) : null
    cacheForCountdown(best)
    return !!best
  } catch (error) {
    console.error('[golden-window-persistence] server calculation failed', error)
    return false
  }
}

export async function loadSavedGoldenWindow(groupId: string): Promise<SavedGoldenWindowResult> {
  try {
    const result = await nexusApi<{ windows: GoldenWindow[]; computed_at: string; source: string }>(`/v1/circles/${encodeURIComponent(groupId)}/golden-window`)
    const best = result.windows[0] ? normalizeWindowTiming(result.windows[0]) : null
    cacheForCountdown(best)
    return { window: best, isStale: false, computedAt: result.computed_at }
  } catch (error) {
    console.error('[golden-window-persistence] load failed', error)
    return { window: null, isStale: false, computedAt: null }
  }
}

export async function markGoldenWindowStale(_groupId: string): Promise<void> {
  // Every read recomputes from current member-submitted availability on the server.
  cacheForCountdown(null)
}
