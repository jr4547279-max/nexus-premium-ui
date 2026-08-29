// ─────────────────────────────────────────────────────────────────────────────
// Nexus Message Service
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'

export type MessageType = 'text' | 'system' | 'route' | 'location' | 'poll' | 'image'

export interface PollOption {
  id: string
  text: string
  votes: string[]
}

export interface PollMetadata {
  event: 'poll'
  question: string
  options: PollOption[]
}

export interface GroupMessage {
  id: string
  group_id: string
  user_id: string | null
  message: string
  message_type: MessageType
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  sender_name: string | null
  sender_username: string | null
  sender_avatar_url: string | null
}

interface RawMessageRow {
  id: string
  group_id: string
  user_id: string | null
  message: string
  message_type: string
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  profiles: {
    display_name: string | null
    username: string | null
    avatar_url: string | null
  } | null
}

const COLS = `
  id, group_id, user_id, message, message_type, metadata, created_at, updated_at,
  profiles:user_id ( display_name, username, avatar_url )
`

function toMessage(row: RawMessageRow): GroupMessage {
  return {
    id: row.id,
    group_id: row.group_id,
    user_id: row.user_id,
    message: row.message,
    message_type: row.message_type as MessageType,
    metadata: row.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sender_name: row.profiles?.display_name ?? null,
    sender_username: row.profiles?.username ?? null,
    sender_avatar_url: row.profiles?.avatar_url ?? null,
  }
}

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

async function fetchMessageById(id: string): Promise<GroupMessage | null> {
  const { data, error } = await supabase
    .from('group_messages')
    .select(COLS)
    .eq('id', id)
    .single()

  if (error || !data) return null
  return toMessage(data as unknown as RawMessageRow)
}

export async function sendMessage(
  groupId: string,
  userId: string,
  text: string,
): Promise<GroupMessage | null> {
  const cleanText = text.trim()
  if (!cleanText) return null

  const { data, error } = await supabase
    .from('group_messages')
    .insert({
      group_id: groupId,
      user_id: userId,
      message: cleanText,
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

export async function sendSystemMessage(
  groupId: string,
  userId: string,
  text: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('group_messages')
    .insert({
      group_id: groupId,
      user_id: userId,
      message: text,
      message_type: 'system',
      metadata: metadata ?? null,
    })

  if (error) console.warn('[message-service] sendSystemMessage:', error.message)
}

export async function sendPoll(
  groupId: string,
  userId: string,
  question: string,
  optTexts: string[],
): Promise<GroupMessage | null> {
  const cleanQuestion = question.trim()
  const cleanOptions = optTexts.map(text => text.trim()).filter(Boolean)
  if (!cleanQuestion || cleanOptions.length < 2) return null

  const ts = Date.now()
  const options: PollOption[] = cleanOptions.map((text, i) => ({
    id: `opt-${ts}-${i}`,
    text,
    votes: [],
  }))

  const metadata: PollMetadata = {
    event: 'poll',
    question: cleanQuestion,
    options,
  }

  const { data, error } = await supabase
    .from('group_messages')
    .insert({
      group_id: groupId,
      user_id: userId,
      message: cleanQuestion,
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

export async function castVote(
  messageId: string,
  optionId: string,
  userId: string,
): Promise<boolean> {
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

  const updatedOptions: PollOption[] = meta.options.map(opt => ({
    ...opt,
    votes: opt.id === optionId
      ? [...opt.votes.filter(v => v !== userId), userId]
      : opt.votes.filter(v => v !== userId),
  }))

  const { error: updateErr } = await supabase
    .from('group_messages')
    .update({
      metadata: { ...meta, options: updatedOptions },
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)

  if (updateErr) {
    console.error('[message-service] castVote update:', updateErr.message)
    return false
  }
  return true
}

/**
 * Subscribe to live group messages.
 *
 * Mobile browsers were reaching the Realtime websocket with a 401 even though
 * normal REST reads/writes were authenticated successfully. Explicitly attach
 * the current access token before subscribing. A lightweight REST poll remains
 * as a safety net: if Realtime is unavailable, new messages and poll updates
 * still reach the UI without requiring a page refresh.
 */
export function subscribeToMessages(
  groupId: string,
  onInsert: (msg: GroupMessage) => void,
  onUpdate?: (msg: GroupMessage) => void,
): () => void {
  let disposed = false
  let pollTimer: ReturnType<typeof setInterval> | undefined
  const seen = new Set<string>()

  const rememberCurrent = async () => {
    const initial = await fetchMessages(groupId)
    if (disposed) return
    for (const message of initial) seen.add(message.id)
  }

  const poll = async () => {
    if (disposed) return
    const latest = await fetchMessages(groupId)
    if (disposed) return
    for (const message of latest) {
      if (!seen.has(message.id)) {
        seen.add(message.id)
        onInsert(message)
      } else if (onUpdate && message.message_type === 'poll') {
        onUpdate(message)
      }
    }
  }

  const start = async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (accessToken) {
        supabase.realtime.setAuth(accessToken)
      }
    } catch (error) {
      console.warn('[message-service] realtime auth setup failed:', error)
    }

    if (disposed) return

    const filter = `group_id=eq.${groupId}`
    const channel = supabase
      .channel(`group-chat:${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter },
        async (payload) => {
          const row = payload.new as { id: string }
          const msg = await fetchMessageById(row.id)
          if (!msg || disposed) return
          seen.add(msg.id)
          onInsert(msg)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_messages', filter },
        async (payload) => {
          const row = payload.new as { id: string }
          const msg = await fetchMessageById(row.id)
          if (!msg || disposed) return
          seen.add(msg.id)
          onUpdate?.(msg)
        },
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          console.warn(`[message-service] realtime status: ${status}; REST fallback remains active`)
        }
      })

    await rememberCurrent()
    if (disposed) {
      supabase.removeChannel(channel)
      return
    }

    // Keep this deliberately slow: it is only a fallback for mobile/network
    // cases where the websocket cannot authenticate.
    pollTimer = setInterval(() => { void poll() }, 3000)

    const originalCleanup = () => supabase.removeChannel(channel)
    cleanupChannel = originalCleanup
  }

  let cleanupChannel: (() => void) | null = null
  void start()

  return () => {
    disposed = true
    if (pollTimer) clearInterval(pollTimer)
    cleanupChannel?.()
  }
}
