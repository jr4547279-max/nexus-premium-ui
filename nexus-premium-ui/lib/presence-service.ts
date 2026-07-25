/**
 * Presence Service (Phase 1A)
 *
 * Computes and persists member presence status for a live event.
 *
 * Status rules:
 *   ARRIVED      — within arrivalRadiusM of the current stop
 *   RUNNING_LATE — explicitly set by the user OR inferred (ETA > window_end)
 *   OFFLINE      — last_seen_at > OFFLINE_THRESHOLD_MS ago
 *   LEFT_EVENT   — user called leaveEvent()
 *   TRAVELLING   — default when none of the above apply
 *
 * The service is pure logic + DB calls. No React dependencies.
 */

import { supabase } from './supabase'
import { haversineMetres } from './location-service'
import type {
  MemberPresence,
  PresenceStatus,
  EventStop,
} from './live-event-types'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Seconds with no GPS update before a member is considered offline. */
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000  // 2 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Pure computation (no I/O — safe for unit testing)
// ─────────────────────────────────────────────────────────────────────────────

export interface PresenceInput {
  latitude:          number
  longitude:         number
  lastSeenAt:        Date
  currentStopIndex:  number
  stop:              Pick<EventStop, 'latitude' | 'longitude'> | null
  arrivalRadiusM:    number
  existingStatus:    PresenceStatus
}

export interface PresenceComputation {
  status:          PresenceStatus
  distanceMetres:  number | null
}

/**
 * Compute the presence status from a fresh GPS fix.
 * Pure function — no side effects.
 */
export function computePresence(input: PresenceInput): PresenceComputation {
  const {
    latitude, longitude,
    lastSeenAt,
    stop,
    arrivalRadiusM,
    existingStatus,
  } = input

  // Offline gate — if the caller is passing a stale lastSeenAt.
  const staleness = Date.now() - lastSeenAt.getTime()
  if (staleness > OFFLINE_THRESHOLD_MS) {
    return { status: 'offline', distanceMetres: null }
  }

  // Preserve terminal statuses set by explicit user actions.
  if (existingStatus === 'left_event') {
    return { status: 'left_event', distanceMetres: null }
  }

  // No stop position available — can only say TRAVELLING.
  if (!stop || stop.latitude == null || stop.longitude == null) {
    return {
      status:         existingStatus === 'running_late' ? 'running_late' : 'travelling',
      distanceMetres: null,
    }
  }

  const dist = haversineMetres(latitude, longitude, stop.latitude, stop.longitude)

  if (dist <= arrivalRadiusM) {
    return { status: 'arrived', distanceMetres: dist }
  }

  if (existingStatus === 'running_late') {
    return { status: 'running_late', distanceMetres: dist }
  }

  return { status: 'travelling', distanceMetres: dist }
}

/**
 * Infer how stale a member_presence row is and downgrade to 'offline' if needed.
 */
export function resolveStalePresence(row: MemberPresence): PresenceStatus {
  if (row.status === 'left_event') return 'left_event'
  const staleness = Date.now() - new Date(row.last_seen_at).getTime()
  if (staleness > OFFLINE_THRESHOLD_MS) return 'offline'
  return row.status
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtErr(
  e: { code?: string | null; message: string; hint?: string | null },
  status?: number,
): string {
  return `[${e.code ?? status}] ${e.message}${e.hint ? ` — hint: ${e.hint}` : ''}`
}

/**
 * Upsert the calling user's presence for an event.
 */
export async function upsertPresence(
  eventId:          string,
  status:           PresenceStatus,
  opts: {
    currentStopIndex?: number
    distanceMetres?:   number
    etaMinutes?:       number
  } = {},
): Promise<{ presence: MemberPresence | null; errorMessage: string | null }> {
  const { data, error, status: httpStatus } = await supabase.rpc(
    'upsert_member_presence',
    {
      p_event_id:           eventId,
      p_status:             status,
      p_current_stop_index: opts.currentStopIndex ?? null,
      p_distance_metres:    opts.distanceMetres   ?? null,
      p_eta_minutes:        opts.etaMinutes        ?? null,
    },
  )

  if (error) {
    const msg = fmtErr(error, httpStatus)
    console.error('[presence-service] upsertPresence failed', msg)
    return { presence: null, errorMessage: msg }
  }
  return { presence: data as MemberPresence, errorMessage: null }
}

/**
 * Fetch all member presence rows for an event.
 * Resolves stale rows to 'offline' status in-memory before returning.
 */
export async function getGroupPresence(
  eventId: string,
): Promise<MemberPresence[]> {
  const { data, error } = await supabase
    .from('member_presence')
    .select('*')
    .eq('event_id', eventId)

  if (error) {
    console.error('[presence-service] getGroupPresence failed', error)
    return []
  }

  return ((data ?? []) as MemberPresence[]).map((row) => ({
    ...row,
    status: resolveStalePresence(row),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience action helpers (called from the hook)
// ─────────────────────────────────────────────────────────────────────────────

export async function markArrived(
  eventId:    string,
  stopIndex:  number,
): Promise<{ errorMessage: string | null }> {
  const { errorMessage } = await upsertPresence(eventId, 'arrived', {
    currentStopIndex: stopIndex,
    distanceMetres:   0,
  })
  return { errorMessage }
}

export async function markRunningLate(
  eventId:     string,
  etaMinutes?: number,
): Promise<{ errorMessage: string | null }> {
  const { errorMessage } = await upsertPresence(eventId, 'running_late', {
    etaMinutes,
  })
  return { errorMessage }
}

export async function markOffline(
  eventId: string,
): Promise<{ errorMessage: string | null }> {
  const { errorMessage } = await upsertPresence(eventId, 'offline')
  return { errorMessage }
}

export async function leaveEvent(
  eventId: string,
): Promise<{ errorMessage: string | null }> {
  const { errorMessage } = await upsertPresence(eventId, 'left_event')
  return { errorMessage }
}

/**
 * Update presence based on a fresh GPS fix and the current stop.
 * Calls upsertPresence only when the computed status has changed.
 */
export async function updatePresenceFromLocation(
  eventId:          string,
  currentPresence:  MemberPresence | null,
  latitude:         number,
  longitude:        number,
  stop:             Pick<EventStop, 'latitude' | 'longitude'> | null,
  arrivalRadiusM:   number,
  stopIndex:        number,
): Promise<MemberPresence | null> {
  const existingStatus = currentPresence?.status ?? 'travelling'

  const { status: newStatus, distanceMetres } = computePresence({
    latitude,
    longitude,
    lastSeenAt:       new Date(),
    currentStopIndex: stopIndex,
    stop,
    arrivalRadiusM,
    existingStatus,
  })

  // No change — skip write.
  if (currentPresence && newStatus === existingStatus) return currentPresence

  const { presence } = await upsertPresence(eventId, newStatus, {
    currentStopIndex: stopIndex,
    distanceMetres:   distanceMetres ?? undefined,
  })

  return presence
}
