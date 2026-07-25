/**
 * Live Event Engine — Core Types (Phase 1A)
 *
 * Shared across all services and the useLiveEvent hook.
 * No runtime dependencies — pure TypeScript.
 */

import type { GoldenWindow } from './golden-window'

// ─────────────────────────────────────────────────────────────────────────────
// Status enumerations
// ─────────────────────────────────────────────────────────────────────────────

export type LiveEventStatus = 'pending' | 'live' | 'ended' | 'cancelled'

export type PresenceStatus =
  | 'travelling'
  | 'arrived'
  | 'running_late'
  | 'offline'
  | 'left_event'

export type NotificationType =
  | 'event_started'
  | 'event_ended'
  | 'member_arrived'
  | 'member_late'
  | 'next_stop_soon'
  | 'stop_skipped'
  | 'stop_delayed'
  | 'member_left'
  | 'plan_shared'

// ─────────────────────────────────────────────────────────────────────────────
// Event stop (stored as JSONB in live_events.stops)
// ─────────────────────────────────────────────────────────────────────────────

export interface EventStop {
  id: string
  name: string
  address?: string
  latitude?: number
  longitude?: number
  duration_minutes: number
  notes?: string
  order: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Database row types (mirror Postgres columns exactly)
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveEvent {
  id:                    string
  group_id:              string
  title:                 string
  description:           string | null
  status:                LiveEventStatus
  window_start:          string   // ISO 8601 timestamptz
  window_end:            string
  golden_window_data:    Partial<GoldenWindow>
  stops:                 EventStop[]
  current_stop_index:    number
  host_id:               string
  sharing_enabled:       boolean
  arrival_radius_metres: number
  invited_member_ids:    string[]
  activated_at:          string | null
  ended_at:              string | null
  cancelled_at:          string | null
  created_by:            string
  created_at:            string
  updated_at:            string
}

export interface LiveLocation {
  id:          string
  event_id:    string
  user_id:     string
  latitude:    number
  longitude:   number
  accuracy:    number | null
  heading:     number | null
  speed:       number | null
  recorded_at: string
  created_at:  string
}

export interface MemberPresence {
  event_id:           string
  user_id:            string
  status:             PresenceStatus
  current_stop_index: number | null
  distance_metres:    number | null
  eta_minutes:        number | null
  last_seen_at:       string
  updated_at:         string
}

export interface EventNotification {
  id:              string
  event_id:        string
  type:            NotificationType
  actor_user_id:   string | null
  target_user_id:  string | null
  payload:         Record<string, unknown>
  created_at:      string
}

// ─────────────────────────────────────────────────────────────────────────────
// Enriched / composite types
// ─────────────────────────────────────────────────────────────────────────────

/** Latest GPS fix per user (returned by get_latest_locations RPC). */
export interface LatestLocation {
  user_id:     string
  latitude:    number
  longitude:   number
  accuracy:    number | null
  heading:     number | null
  speed:       number | null
  recorded_at: string
}

/** Full event detail used by the hook. */
export interface LiveEventWithDetails extends LiveEvent {
  presence:      MemberPresence[]
  locations:     LatestLocation[]
  notifications: EventNotification[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Service parameter / result types
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduleLiveEventParams {
  groupId:            string
  windowStart:        Date
  windowEnd:          Date
  goldenWindowData?:  Partial<GoldenWindow>
  title?:             string
  description?:       string
  stops?:             EventStop[]
  invitedMemberIds?:  string[]
  arrivalRadiusM?:    number
}

export interface ScheduleLiveEventResult {
  event:        LiveEvent | null
  errorMessage: string | null
}

export interface CancelLiveEventResult {
  success:      boolean
  errorMessage: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook types
// ─────────────────────────────────────────────────────────────────────────────

export interface CountdownData {
  /** Total remaining seconds (negative = overdue). */
  totalSeconds: number
  hours:        number
  minutes:      number
  seconds:      number
  /** Human label e.g. "Starts in" or "Ends in". */
  label:        string
}

export interface LocationTrackingOptions {
  /** How often to push an update to the server (ms). Default 7 000. */
  intervalMs?:       number
  /** Minimum metres of movement to trigger an update. Default 10. */
  minDistanceM?:     number
  /** enableHighAccuracy passed to watchPosition. Default true. */
  highAccuracy?:     boolean
}

export type LocationPermissionStatus = 'unknown' | 'granted' | 'denied' | 'unavailable'
