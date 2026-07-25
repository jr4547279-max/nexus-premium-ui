/**
 * Live Event Service — Phase 6
 *
 * Handles scheduling, fetching, cancelling, RSVPs, and server-side
 * activation/deactivation of live events tied to Golden Windows.
 *
 * All writes go through SECURITY DEFINER RPCs so RLS recursion is avoided
 * (same pattern as group-service.ts and availability-service.ts).
 */

import { supabase } from './supabase'
import type { GoldenWindow } from './golden-window'
import type {
  LiveEvent,
  LiveEventRsvp,
  LiveEventWithRsvps,
  RsvpStatus,
  ScheduleLiveEventParams,
  ScheduleLiveEventResult,
  CancelLiveEventResult,
  RsvpResult,
} from './live-event-types'

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatError(
  error: { code?: string | null; message: string; hint?: string | null; details?: string | null },
  status?: number,
): string {
  return (
    `[${error.code ?? status}] ${error.message}` +
    (error.hint    ? ` — hint: ${error.hint}`       : '') +
    (error.details ? ` — details: ${error.details}` : '')
  )
}

function rowToEvent(row: Record<string, unknown>): LiveEventWithRsvps {
  const rsvpRows = (row['live_event_rsvps'] ?? []) as LiveEventRsvp[]
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { live_event_rsvps: _, ...rest } = row
  return { ...(rest as unknown as LiveEvent), rsvps: rsvpRows }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date / time helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the next calendar start and end of a Golden Window from `from`.
 *
 * Rules:
 *  - If today is the correct day-of-week and the window hasn't started
 *    yet (more than 1 minute away), use today's occurrence.
 *  - Otherwise use next week's occurrence.
 */
export function nextOccurrenceOf(
  window: Pick<GoldenWindow, 'day_of_week' | 'start_time' | 'end_time'>,
  from: Date = new Date(),
): { start: Date; end: Date } {
  const [startHStr, startMStr] = window.start_time.split(':')
  const [endHStr,   endMStr]   = window.end_time.split(':')

  const startH = Number.parseInt(startHStr ?? '0', 10)
  const startM = Number.parseInt(startMStr ?? '0', 10)
  const endH   = Number.parseInt(endHStr   ?? '0', 10)
  const endM   = Number.parseInt(endMStr   ?? '0', 10)

  // Land on the target day-of-week.
  const daysUntil = (window.day_of_week - from.getDay() + 7) % 7
  const candidate = new Date(from)
  candidate.setDate(candidate.getDate() + daysUntil)
  candidate.setHours(startH, startM, 0, 0)

  // If that moment is in the past or within 1 minute, push to next week.
  if (candidate.getTime() - from.getTime() < 60_000) {
    candidate.setDate(candidate.getDate() + 7)
  }

  const start = new Date(candidate)

  const end = new Date(candidate)
  end.setHours(endH, endM, 0, 0)

  // Guard against midnight crossings (end_time < start_time on the same day).
  if (end <= start) {
    end.setDate(end.getDate() + 1)
  }

  return { start, end }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schedule a live event with explicit start/end timestamps.
 * The server will activate it immediately if scheduled_start ≤ now < scheduled_end.
 */
export async function scheduleLiveEvent(
  params: ScheduleLiveEventParams,
): Promise<ScheduleLiveEventResult> {
  const { data, error, status } = await supabase.rpc('schedule_live_event', {
    p_group_id:           params.groupId,
    p_scheduled_start:    params.scheduledStart.toISOString(),
    p_scheduled_end:      params.scheduledEnd.toISOString(),
    p_golden_window_data: params.goldenWindowData,
    p_title:              params.title ?? 'Group Meetup',
    p_description:        params.description ?? null,
    p_invited_member_ids: params.invitedMemberIds ?? [],
  })

  if (error) {
    const msg = formatError(error, status)
    console.error('[live-event-service] scheduleLiveEvent failed', msg, error)
    return { event: null, errorMessage: msg }
  }

  return { event: data as LiveEvent, errorMessage: null }
}

/**
 * Convenience wrapper: schedule the next weekly occurrence of a Golden Window.
 * Computes scheduled_start / scheduled_end automatically via nextOccurrenceOf().
 */
export async function scheduleFromGoldenWindow(
  groupId: string,
  window: GoldenWindow,
  overrides: {
    title?:            string
    description?:      string
    invitedMemberIds?: string[]
    from?:             Date
  } = {},
): Promise<ScheduleLiveEventResult> {
  const { start, end } = nextOccurrenceOf(window, overrides.from)

  return scheduleLiveEvent({
    groupId,
    scheduledStart:   start,
    scheduledEnd:     end,
    goldenWindowData: window,
    title:            overrides.title,
    description:      overrides.description,
    invitedMemberIds: overrides.invitedMemberIds,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch a single live event with its RSVPs. */
export async function getLiveEvent(eventId: string): Promise<LiveEventWithRsvps | null> {
  const { data, error } = await supabase
    .from('live_events')
    .select('*, live_event_rsvps(*)')
    .eq('id', eventId)
    .single()

  if (error) {
    console.error('[live-event-service] getLiveEvent failed', error)
    return null
  }
  return rowToEvent(data as Record<string, unknown>)
}

/** List all live events for a group, newest first. */
export async function listGroupLiveEvents(groupId: string): Promise<LiveEventWithRsvps[]> {
  const { data, error } = await supabase
    .from('live_events')
    .select('*, live_event_rsvps(*)')
    .eq('group_id', groupId)
    .order('scheduled_start', { ascending: false })

  if (error) {
    console.error('[live-event-service] listGroupLiveEvents failed', error)
    return []
  }

  return (data ?? []).map((row) => rowToEvent(row as Record<string, unknown>))
}

/**
 * Return the most recently activated live event for a group that is currently
 * active, or null if none exists.
 */
export async function getActiveEventForGroup(
  groupId: string,
): Promise<LiveEventWithRsvps | null> {
  const { data, error } = await supabase
    .from('live_events')
    .select('*, live_event_rsvps(*)')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[live-event-service] getActiveEventForGroup failed', error)
    return null
  }
  if (!data) return null

  return rowToEvent(data as Record<string, unknown>)
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

/** Cancel a live event. Only the creator or a group owner may cancel. */
export async function cancelLiveEvent(eventId: string): Promise<CancelLiveEventResult> {
  const { error, status } = await supabase.rpc('cancel_live_event', {
    p_event_id: eventId,
  })

  if (error) {
    const msg = formatError(error, status)
    console.error('[live-event-service] cancelLiveEvent failed', msg, error)
    return { success: false, errorMessage: msg }
  }

  return { success: true, errorMessage: null }
}

/** Upsert the current user's RSVP to a live event. */
export async function rsvpToEvent(eventId: string, status: RsvpStatus): Promise<RsvpResult> {
  const { data, error, status: httpStatus } = await supabase.rpc('rsvp_to_live_event', {
    p_event_id: eventId,
    p_status:   status,
  })

  if (error) {
    const msg = formatError(error, httpStatus)
    console.error('[live-event-service] rsvpToEvent failed', msg, error)
    return { rsvp: null, errorMessage: msg }
  }

  return { rsvp: data as LiveEventRsvp, errorMessage: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-side activation / deactivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ask the server to activate all pending events whose window has started.
 * Returns the count of newly activated events.
 *
 * pg_cron calls this automatically every minute when enabled.
 * The useLiveEvent hook also calls it on mount and every 30 s as a fallback.
 */
export async function activateDueEvents(): Promise<number> {
  const { data, error } = await supabase.rpc('activate_due_live_events')
  if (error) {
    console.error('[live-event-service] activateDueEvents failed', error)
    return 0
  }
  return (data as number) ?? 0
}

/**
 * Ask the server to complete all active events whose window has ended.
 * Returns the count of newly completed events.
 */
export async function deactivateExpiredEvents(): Promise<number> {
  const { data, error } = await supabase.rpc('deactivate_expired_live_events')
  if (error) {
    console.error('[live-event-service] deactivateExpiredEvents failed', error)
    return 0
  }
  return (data as number) ?? 0
}
