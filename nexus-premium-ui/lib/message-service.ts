// ─────────────────────────────────────────────────────────────────────────────
// Nexus Message Service
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageType = 'text' | 'system' | 'route' | 'location' | 'poll' | 'image'

export interface PollOption {
  id:    string       // stable identifier, e.g. "opt-1234567890-0"
  text:  string
  votes: string[]     // array of user IDs who selected this option
}

export interface PollMetadata {
  event:    'poll'
  question: string
  options:  PollOption[]
}

export interface GroupMessage {
  id:                string
  group_id:          string
  user_id:           string | null
  message:           string
  message_type:      MessageType
  /** Structured payload — poll data, system event keys, future features. */
  metadata:          Record<string, unknown> | null
  created_at:        string
  updated_at:        string
  // ── Joined from profiles ───────────────────────────────────────────────────
  sender_name:       string | null
  sender_username:   string | null
  sender_avatar_url: string | null
}

// ── Internal row shape ────────────────────────────────────────────────────────

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

// ── Column projection ─────────────────────────────────────────────────────────

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

/** Fetch the most recent `limit` messages for a group, oldest-first. */
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

/** Fetch a single message with profile join (used after real-time events). */
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

/** Send a plain text message. */
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
 * Non-blocking — failures are logged but never surface to the UI.
 */
export async function sendSystemMessage(
  groupId:   string,
  userId:    string,
  text:      string,
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

  if (error) console.warn('[message-service] sendSystemMessage:', error.message)
}

/**
 * Create a new poll in the group chat.
 * `optTexts` must contain at least 2 non-empty strings.
 */
export async function sendPoll(
  groupId:  string,
  userId:   string,
  question: string,
  optTexts: string[],
): Promise<GroupMessage | null> {
  const ts      = Date.now()
  const options: PollOption[] = optTexts.map((text, i) => ({
    id:    `opt-${ts}-${i}`,
    text:  text.trim(),
    votes: [],
  }))

  const metadata: PollMetadata = {
    event:    'poll',
    question: question.trim(),
    options,
  }

  const { data, error } = await supabase
    .from('group_messages')
    .insert({
      group_id:     groupId,
      user_id:      userId,
      message:      question.trim(),   // human-readable fallback text
      message_type: 'poll',
      metadata,
    })
    .select(COLS)
    .single()

  if (error) {
    console.error('[message-service] sendPoll:', error.message)
    return null
  }
  return toMessage(data as unknown as RawMessageRow)
}

/**
 * Cast (or change) a vote on a poll.
 *
 * Strategy: read-modify-write on the metadata JSONB.
 * - Removes the user from every option's votes array.
 * - Adds the user to the target option's votes array.
 * This enforces one-vote-per-user client-side. The voting RLS policy
 * ("group_members_can_vote_on_polls") ensures only members can update polls.
 *
 * Returns true on success.
 */
export async function castVote(
  messageId: string,
  optionId:  string,
  userId:    string,
): Promise<boolean> {
  // 1. Fetch current metadata
  const { data: current, error: fetchErr } = await supabase
    .from('group_messages')
    .select('metadata')
    .eq('id', messageId)
    .single()

  if (fetchErr || !current) {
    console.error('[message-service] castVote fetch:', fetchErr?.message)
    return false
  }

  const meta = current.metadata as PollMetadata | null
  if (!meta?.options) return false

  // 2. Build updated options: remove user from all, add to target
  const updatedOptions: PollOption[] = meta.options.map(opt => ({
    ...opt,
    votes: opt.id === optionId
      ? [...opt.votes.filter(v => v !== userId), userId]
      : opt.votes.filter(v => v !== userId),
  }))

  // 3. Persist
  const { error: updateErr } = await supabase
    .from('group_messages')
    .update({
      metadata:   { ...meta, options: updatedOptions },
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)

  if (updateErr) {
    console.error('[message-service] castVote update:', updateErr.message)
    return false
  }
  return true
}

// ── Real-time subscription ────────────────────────────────────────────────────

/**
 * Subscribe to live message events for a group.
 *
 * - `onInsert` fires when a new message arrives.
 * - `onUpdate` fires when a message is updated (e.g. a vote is cast on a poll).
 *
 * Both callbacks receive a fully hydrated GroupMessage (with profile join).
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export function subscribeToMessages(
  groupId:   string,
  onInsert:  (msg: GroupMessage) => void,
  onUpdate?: (msg: GroupMessage) => void,
): () => void {
  const filter = `group_id=eq.${groupId}`

  let channel = supabase
    .channel(`group-chat:${groupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_messages', filter },
      async (payload) => {
        const row = payload.new as { id: string }
        const msg = await fetchMessageById(row.id)
        if (msg) onInsert(msg)
      },
    )

  if (onUpdate) {
    channel = channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'group_messages', filter },
      async (payload) => {
        const row = payload.new as { id: string }
        const msg = await fetchMessageById(row.id)
        if (msg) onUpdate(msg)
      },
    )
  }

  channel.subscribe()
  return () => { supabase.removeChannel(channel) }
}
