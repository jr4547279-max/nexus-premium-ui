/**
 * Notification Service (Phase 1A)
 *
 * Creates and retrieves backend event notifications.
 * Notifications are stored in event_notifications and broadcast via Realtime.
 * No push notification integration — backend log only.
 */

import { supabase } from './supabase'
import type { EventNotification, NotificationType } from './live-event-types'

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper
// ─────────────────────────────────────────────────────────────────────────────

function fmtErr(
  e: { code?: string | null; message: string; hint?: string | null },
  status?: number,
): string {
  return `[${e.code ?? status}] ${e.message}${e.hint ? ` — hint: ${e.hint}` : ''}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Core
// ─────────────────────────────────────────────────────────────────────────────

export async function createNotification(
  eventId:        string,
  type:           NotificationType,
  payload:        Record<string, unknown> = {},
  actorUserId?:   string | null,
  targetUserId?:  string | null,
): Promise<{ notification: EventNotification | null; errorMessage: string | null }> {
  const { data, error, status } = await supabase.rpc('create_event_notification', {
    p_event_id:       eventId,
    p_type:           type,
    p_actor_user_id:  actorUserId  ?? null,
    p_target_user_id: targetUserId ?? null,
    p_payload:        payload,
  })

  if (error) {
    const msg = fmtErr(error, status)
    console.error('[notification-service] createNotification failed', msg)
    return { notification: null, errorMessage: msg }
  }
  return { notification: data as EventNotification, errorMessage: null }
}

/**
 * Fetch the most recent notifications for an event (newest first).
 */
export async function getEventNotifications(
  eventId: string,
  limit    = 50,
): Promise<EventNotification[]> {
  const { data, error } = await supabase
    .from('event_notifications')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[notification-service] getEventNotifications failed', error)
    return []
  }
  return (data ?? []) as EventNotification[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed notification generators
// (These add semantic structure so services don't need to remember payload shapes.)
// ─────────────────────────────────────────────────────────────────────────────

export async function notifyMemberArrived(
  eventId:      string,
  userId:       string,
  displayName:  string,
  stopIndex:    number,
  stopName:     string,
): Promise<void> {
  await createNotification(
    eventId,
    'member_arrived',
    { display_name: displayName, stop_index: stopIndex, stop_name: stopName },
    userId,
  )
}

export async function notifyMemberLate(
  eventId:      string,
  userId:       string,
  displayName:  string,
  etaMinutes?:  number,
): Promise<void> {
  await createNotification(
    eventId,
    'member_late',
    { display_name: displayName, eta_minutes: etaMinutes ?? null },
    userId,
  )
}

export async function notifyNextStopSoon(
  eventId:        string,
  minutesUntil:   number,
  stopIndex:      number,
  stopName:       string,
): Promise<void> {
  await createNotification(
    eventId,
    'next_stop_soon',
    { minutes_until: minutesUntil, stop_index: stopIndex, stop_name: stopName },
  )
}

export async function notifyMemberLeft(
  eventId:     string,
  userId:      string,
  displayName: string,
): Promise<void> {
  await createNotification(
    eventId,
    'member_left',
    { display_name: displayName },
    userId,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Human-readable label for display (no i18n needed for Phase 1A)
// ─────────────────────────────────────────────────────────────────────────────

export function notificationLabel(n: EventNotification): string {
  const p = n.payload
  switch (n.type) {
    case 'event_started':  return `Event started: ${p['title'] ?? ''}`
    case 'event_ended':    return `Event ended: ${p['title'] ?? ''}`
    case 'member_arrived': return `${p['display_name'] ?? 'Someone'} arrived at ${p['stop_name'] ?? 'the stop'}`
    case 'member_late':    return `${p['display_name'] ?? 'Someone'} is running late${p['eta_minutes'] ? ` (~${p['eta_minutes']} min)` : ''}`
    case 'member_left':    return `${p['display_name'] ?? 'Someone'} left the event`
    case 'next_stop_soon': return `Moving to ${p['stop_name'] ?? 'next stop'} in ${p['minutes_until'] ?? '?'} min`
    case 'stop_skipped':   return `Stop skipped — now at ${p['stop_name'] ?? `stop ${p['stop_index']}`}`
    case 'stop_delayed':   return `Stop delayed by ${p['delay_minutes'] ?? '?'} min`
    case 'plan_shared':    return `Plan shared: ${p['title'] ?? ''}`
    default:               return n.type
  }
}
