// ─────────────────────────────────────────────────────────────────────────────
// Nexus Message Service
// ─────────────────────────────────────────────────────────────────────────────
// Handles group message CRUD and real-time Supabase subscriptions.
// System messages (join, create, route, golden window) use message_type='system'
// and are attributed to the triggering user (required by RLS).
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageType = 'text' | 'system' | 'route' | 'location' | 'poll' | 'image'

export interface GroupMessage {
  id:                string
  group_id:          string
  user_id:           string | null
  message:           string
  message_type:      MessageType
  /** Structured payload for future-ready features (reactions, route data, etc.) */
  metadata:          Record<string, unknown> | null
  created_at:        string
  updated_at:        string
  // ── Joined from profiles ───────────────────────────────────────────────────
  sender_name:       string | null
  sender_username:   string | null
  sender_avatar_url: string | null
}

// ── Internal row shape returned by Supabase ───────────────────────────────────

interface RawMessageRow {
  id:           string
  group_id:     string
  user_id:      string | null
  message:      string
  message_type: string
  metadata:     Record<string, unknown> | null
  created_at:   string
  updated_at:   string
  profiles: {
    display_name: string | null
    username:     string | null
    avatar_url:   string | null
  } | null
}

// ── Column projection used across all queries ─────────────────────────────────

const COLS = `
  id, group_id, user_id, message, message_type, metadata, created_at, updated_at,
  profiles:user_id ( display_name, username, avatar_url )
`

// ── Row → domain model ────────────────────────────────────────────────────────

function toMessage(row: RawMessageRow): GroupMessage {
  return {
    id:                row.id,
    group_id:          row.group_id,
    user_id:           row.user_id,
    message:           row.message,
    message_type:      row.message_type as MessageType,
    metadata:          row.metadata,
    created_at:        row.created_at,
    updated_at:        row.updated_at,
    sender_name:       row.profiles?.display_name  ?? null,
    sender_username:   row.profiles?.username      ?? null,
    sender_avatar_url: row.profiles?.avatar_url    ?? null,
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Fetch the most recent `limit` messages for a group, oldest-first.
 */
export async function fetchMessages(groupId: string, limit = 80): Promise<GroupMessage[]> {
  const { data, error } = await supabase
    .from('group_messages')
    .select(COLS)
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[message-service] fetchMessages:', error.message)
    return []
  }
  return (data ?? []).map(r => toMessage(r as unknown as RawMessageRow))
}

/** Fetch a single message by id (used after real-time INSERT to hydrate profile data). */
async function fetchMessageById(id: string): Promise<GroupMessage | null> {
  const { data, error } = await supabase
    .from('group_messages')
    .select(COLS)
    .eq('id', id)
    .single()

  if (error || !data) return null
  return toMessage(data as unknown as RawMessageRow)
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Send a plain text message. Returns the saved message or null on error.
 */
export async function sendMessage(
  groupId: string,
  userId:  string,
  text:    string,
): Promise<GroupMessage | null> {
  const { data, error } = await supabase
    .from('group_messages')
    .insert({
      group_id:     groupId,
      user_id:      userId,
      message:      text.trim(),
      message_type: 'text',
    })
    .select(COLS)
    .single()

  if (error) {
    console.error('[message-service] sendMessage:', error.message)
    return null
  }
  return toMessage(data as unknown as RawMessageRow)
}

/**
 * Send a system event message attributed to the triggering user.
 * Non-blocking — failures are logged but not surfaced to the UI.
 *
 * `text` should be a short human-readable description of the event,
 *   e.g. "created this group" or "joined the group".
 *
 * `metadata` can carry structured context for the UI renderer,
 *   e.g. { event: 'golden_window' } or { event: 'route_generated', distance_km: 5.2 }.
 */
export async function sendSystemMessage(
  groupId:  string,
  userId:   string,
  text:     string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('group_messages')
    .insert({
      group_id:     groupId,
      user_id:      userId,
      message:      text,
      message_type: 'system',
      metadata:     metadata ?? null,
    })

  if (error) {
    console.warn('[message-service] sendSystemMessage:', error.message)
  }
}

// ── Real-time subscription ────────────────────────────────────────────────────

/**
 * Subscribe to new messages in a group.
 * Automatically hydrates profile data on each new INSERT so the caller
 * receives a fully populated GroupMessage.
 *
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export function subscribeToMessages(
  groupId:   string,
  onMessage: (msg: GroupMessage) => void,
): () => void {
  const channel = supabase
    .channel(`group-chat:${groupId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'group_messages',
        filter: `group_id=eq.${groupId}`,
      },
      async (payload) => {
        const row = payload.new as { id: string }
        // Re-fetch with profile join — the raw CDC payload has no joined cols.
        const msg = await fetchMessageById(row.id)
        if (msg) onMessage(msg)
      },
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}
