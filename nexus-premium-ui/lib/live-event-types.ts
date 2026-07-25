import type { GoldenWindow } from './golden-window'

// ─────────────────────────────────────────────────────────────────────────────
// Core domain types
// ─────────────────────────────────────────────────────────────────────────────

export type LiveEventStatus = 'pending' | 'active' | 'completed' | 'cancelled'
export type RsvpStatus      = 'going' | 'maybe' | 'not_going'

/** Mirrors the `live_events` Postgres row. All timestamps are ISO 8601 strings. */
export interface LiveEvent {
  id:                  string
  group_id:            string
  title:               string
  description:         string | null
  status:              LiveEventStatus
  scheduled_start:     string
  scheduled_end:       string
  activated_at:        string | null
  completed_at:        string | null
  cancelled_at:        string | null
  /** Snapshot of the GoldenWindow used to schedule this event. */
  golden_window_data:  Partial<GoldenWindow>
  /** Member IDs that were invited at scheduling time. */
  invited_member_ids:  string[]
  created_by:          string
  created_at:          string
  updated_at:          string
}

/** Mirrors the `live_event_rsvps` Postgres row. */
export interface LiveEventRsvp {
  event_id:     string
  user_id:      string
  status:       RsvpStatus
  responded_at: string
}

/** A LiveEvent with its RSVPs eagerly loaded. */
export interface LiveEventWithRsvps extends LiveEvent {
  rsvps: LiveEventRsvp[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Service call parameters / results
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduleLiveEventParams {
  groupId:           string
  scheduledStart:    Date
  scheduledEnd:      Date
  goldenWindowData:  Partial<GoldenWindow>
  title?:            string
  description?:      string
  invitedMemberIds?: string[]
}

export interface ScheduleLiveEventResult {
  event:        LiveEvent | null
  errorMessage: string | null
}

export interface CancelLiveEventResult {
  success:      boolean
  errorMessage: string | null
}

export interface RsvpResult {
  rsvp:         LiveEventRsvp | null
  errorMessage: string | null
}
