/**
 * Live Event Service (Phase 1A)
 *
 * Core CRUD, state-machine transitions, and host actions.
 * All writes go through SECURITY DEFINER RPCs (same pattern as group-service.ts).
 */

import { supabase } from './supabase'
import type { GoldenWindow } from './golden-window'
import type {
  LiveEvent,
  LiveEventWithDetails,
  MemberPresence,
  LatestLocation,
  EventNotification,
  EventStop,
  ScheduleLiveEventParams,
  ScheduleLiveEventResult,
  CancelLiveEventResult,
} from './live-event-types'

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtErr(
  e: { code?: string | null; message: string; hint?: string | null; details?: string | null },
  status?: number,
): string {
  return (
    `[${e.code ?? status}] ${e.message}` +
    (e.hint    ? ` — hint: ${e.hint}`       : '') +
    (e.details ? ` — details: ${e.details}` : '')
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Date / Golden Window utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the next calendar occurrence of a Golden Window from `from`.
 *
 * - If today is the right day-of-week and the window hasn't started
 *   (more than 1 min away), use today.
 * - Otherwise advance to next week.
 * - Handles midnight crossings (end_time < start_time on same day).
 */
export function nextOccurrenceOf(
  win: Pick<GoldenWindow, 'day_of_week' | 'start_time' | 'end_time'>,
  from: Date = new Date(),
): { start: Date; end: Date } {
  const parse = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return { h: h ?? 0, m: m ?? 0 }
  }

  const { h: sh, m: sm } = parse(win.start_time)
  const { h: eh, m: em } = parse(win.end_time)

  const daysUntil = (win.day_of_week - from.getDay() + 7) % 7
  const candidate = new Date(from)
  candidate.setDate(candidate.getDate() + daysUntil)
  candidate.setHours(sh, sm, 0, 0)

  // Push to next week if the slot is in the past or starts within 1 minute.
  if (candidate.getTime() - from.getTime() < 60_000) {
    candidate.setDate(candidate.getDate() + 7)
  }

  const start = new Date(candidate)
  const end   = new Date(candidate)
  end.setHours(eh, em, 0, 0)
  if (end <= start) end.setDate(end.getDate() + 1) // midnight crossing

  return { start, end }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduling
// ─────────────────────────────────────────────────────────────────────────────

export async function scheduleLiveEvent(
  params: ScheduleLiveEventParams,
): Promise<ScheduleLiveEventResult> {
  const { data, error, status } = await supabase.rpc('schedule_live_event', {
    p_group_id:           params.groupId,
    p_window_start:       params.windowStart.toISOString(),
    p_window_end:         params.windowEnd.toISOString(),
    p_golden_window_data: params.goldenWindowData ?? {},
    p_title:              params.title ?? 'Group Meetup',
    p_description:        params.description ?? null,
    p_stops:              params.stops ?? [],
    p_invited_member_ids: params.invitedMemberIds ?? [],
    p_arrival_radius_m:   params.arrivalRadiusM ?? 50,
  })

  if (error) {
    const msg = fmtErr(error, status)
    console.error('[live-event-service] scheduleLiveEvent failed', msg)
    return { event: null, errorMessage: msg }
  }
  return { event: data as LiveEvent, errorMessage: null }
}

/**
 * Convenience: schedule the next weekly occurrence of a GoldenWindow.
 */
export async function scheduleFromGoldenWindow(
  groupId: string,
  win: GoldenWindow,
  opts: {
    title?:            string
    description?:      string
    stops?:            EventStop[]
    invitedMemberIds?: string[]
    arrivalRadiusM?:   number
    from?:             Date
  } = {},
): Promise<ScheduleLiveEventResult> {
  const { start, end } = nextOccurrenceOf(win, opts.from)
  return scheduleLiveEvent({
    groupId,
    windowStart:       start,
    windowEnd:         end,
    goldenWindowData:  win,
    title:             opts.title,
    description:       opts.description,
    stops:             opts.stops,
    invitedMemberIds:  opts.invitedMemberIds,
    arrivalRadiusM:    opts.arrivalRadiusM,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export async function getLiveEvent(
  eventId: string,
): Promise<LiveEventWithDetails | null> {
  const [eventRes, presenceRes, locationRes, notifRes] = await Promise.all([
    supabase.from('live_events').select('*').eq('id', eventId).single(),
    supabase.from('member_presence').select('*').eq('event_id', eventId),
    supabase.rpc('get_latest_locations', { p_event_id: eventId }),
    supabase
      .from('event_notifications')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (eventRes.error) {
    console.error('[live-event-service] getLiveEvent failed', eventRes.error)
    return null
  }

  return {
    ...(eventRes.data as LiveEvent),
    presence:      (presenceRes.data ?? []) as MemberPresence[],
    locations:     (locationRes.data ?? []) as LatestLocation[],
    notifications: (notifRes.data ?? []) as EventNotification[],
  }
}

export async function listGroupLiveEvents(
  groupId: string,
): Promise<LiveEvent[]> {
  const { data, error } = await supabase
    .from('live_events')
    .select('*')
    .eq('group_id', groupId)
    .order('window_start', { ascending: false })

  if (error) {
    console.error('[live-event-service] listGroupLiveEvents failed', error)
    return []
  }
  return (data ?? []) as LiveEvent[]
}

export async function getActiveEventForGroup(
  groupId: string,
): Promise<LiveEvent | null> {
  const { data, error } = await supabase
    .from('live_events')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'live')
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[live-event-service] getActiveEventForGroup failed', error)
    return null
  }
  return (data as LiveEvent) ?? null
}

export async function getPendingEventForGroup(
  groupId: string,
): Promise<LiveEvent | null> {
  const { data, error } = await supabase
    .from('live_events')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('window_start', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[live-event-service] getPendingEventForGroup failed', error)
    return null
  }
  return (data as LiveEvent) ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelLiveEvent(
  eventId: string,
): Promise<CancelLiveEventResult> {
  const { error, status } = await supabase.rpc('cancel_live_event', {
    p_event_id: eventId,
  })
  if (error) {
    const msg = fmtErr(error, status)
    console.error('[live-event-service] cancelLiveEvent failed', msg)
    return { success: false, errorMessage: msg }
  }
  return { success: true, errorMessage: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Automatic state transitions (called by hook polling + pg_cron)
// ─────────────────────────────────────────────────────────────────────────────

export async function activateDueEvents(): Promise<number> {
  const { data, error } = await supabase.rpc('activate_due_live_events')
  if (error) { console.error('[live-event-service] activateDueEvents', error); return 0 }
  return (data as number) ?? 0
}

export async function deactivateExpiredEvents(): Promise<number> {
  const { data, error } = await supabase.rpc('deactivate_expired_live_events')
  if (error) { console.error('[live-event-service] deactivateExpiredEvents', error); return 0 }
  return (data as number) ?? 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Host actions
// ─────────────────────────────────────────────────────────────────────────────

export async function skipStop(
  eventId: string,
): Promise<{ event: LiveEvent | null; errorMessage: string | null }> {
  const { data, error, status } = await supabase.rpc('host_skip_stop', {
    p_event_id: eventId,
  })
  if (error) {
    const msg = fmtErr(error, status)
    console.error('[live-event-service] skipStop failed', msg)
    return { event: null, errorMessage: msg }
  }
  return { event: data as LiveEvent, errorMessage: null }
}

export async function delayStop(
  eventId: string,
  delayMinutes: number,
): Promise<{ event: LiveEvent | null; errorMessage: string | null }> {
  const { data, error, status } = await supabase.rpc('host_delay_stop', {
    p_event_id:      eventId,
    p_delay_minutes: delayMinutes,
  })
  if (error) {
    const msg = fmtErr(error, status)
    console.error('[live-event-service] delayStop failed', msg)
    return { event: null, errorMessage: msg }
  }
  return { event: data as LiveEvent, errorMessage: null }
}

export async function endEvent(
  eventId: string,
): Promise<{ event: LiveEvent | null; errorMessage: string | null }> {
  const { data, error, status } = await supabase.rpc('host_end_event', {
    p_event_id: eventId,
  })
  if (error) {
    const msg = fmtErr(error, status)
    console.error('[live-event-service] endEvent failed', msg)
    return { event: null, errorMessage: msg }
  }
  return { event: data as LiveEvent, errorMessage: null }
}

export async function sharePlan(
  eventId: string,
): Promise<{ errorMessage: string | null }> {
  const { error, status } = await supabase.rpc('host_share_plan', {
    p_event_id: eventId,
  })
  if (error) {
    const msg = fmtErr(error, status)
    console.error('[live-event-service] sharePlan failed', msg)
    return { errorMessage: msg }
  }
  return { errorMessage: null }
}
