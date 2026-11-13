import { nexusApi, nexusApiOrigin } from './nexus-api'

export type MessageType = 'text' | 'system' | 'route' | 'location' | 'poll' | 'image'
export interface PollOption { id: string; text: string; votes: string[] }
export interface PollMetadata { event: 'poll'; question: string; options: PollOption[] }
export interface GroupMessage {
  id: string; group_id: string; user_id: string | null; message: string; message_type: MessageType
  metadata: Record<string, unknown> | null; created_at: string; updated_at: string
  sender_name: string | null; sender_username: string | null; sender_avatar_url: string | null
}

async function postMessage(groupId: string, message: string, messageType: MessageType, metadata?: Record<string, unknown>) {
  try {
    const result = await nexusApi<{ message: GroupMessage }>(`/v1/circles/${encodeURIComponent(groupId)}/messages`, {
      method: 'POST', body: JSON.stringify({ body: message, messageType, metadata }),
    })
    return result.message
  } catch (error) {
    console.error('[message-service] send failed', error)
    return null
  }
}

export async function fetchMessages(groupId: string, limit = 80): Promise<GroupMessage[]> {
  try {
    const result = await nexusApi<{ messages: GroupMessage[] }>(`/v1/circles/${encodeURIComponent(groupId)}/messages?limit=${Math.min(80, limit)}`)
    return result.messages
  } catch (error) {
    console.error('[message-service] fetch failed', error)
    return []
  }
}

export async function sendMessage(groupId: string, _userId: string, text: string) {
  const clean = text.trim()
  return clean ? postMessage(groupId, clean, 'text') : null
}

export async function sendSystemMessage(groupId: string, _userId: string, text: string, metadata?: Record<string, unknown>) {
  await postMessage(groupId, text.trim(), 'system', metadata)
}

export async function sendPoll(groupId: string, _userId: string, question: string, optTexts: string[]) {
  const cleanQuestion = question.trim()
  const options = optTexts.map((text, index) => ({ id: `opt-${crypto.randomUUID()}-${index}`, text: text.trim(), votes: [] })).filter((option) => option.text)
  if (!cleanQuestion || options.length < 2) return null
  return postMessage(groupId, cleanQuestion, 'poll', { event: 'poll', question: cleanQuestion, options })
}

export async function sendRichMessage(groupId: string, text: string, type: Exclude<MessageType, 'text' | 'system' | 'poll'>, metadata: Record<string, unknown>) {
  return postMessage(groupId, text, type, metadata)
}

export async function uploadChatImage(groupId: string, file: File): Promise<string> {
  const form = new FormData()
  form.set('circleId', groupId)
  form.set('file', file)
  const result = await nexusApi<{ key: string }>('/v1/uploads', { method: 'POST', body: form })
  return result.key
}

export function chatImageUrl(key: string): string {
  return `${nexusApiOrigin}/v1/uploads/${key.split('/').map(encodeURIComponent).join('/')}`
}

export async function castVote(messageId: string, optionId: string, _userId: string): Promise<boolean> {
  try {
    await nexusApi(`/v1/messages/${encodeURIComponent(messageId)}/vote`, { method: 'POST', body: JSON.stringify({ optionId }) })
    return true
  } catch (error) {
    console.error('[message-service] poll vote failed', error)
    return false
  }
}

export function subscribeToMessages(groupId: string, onInsert: (message: GroupMessage) => void, onUpdate?: (message: GroupMessage) => void) {
  let disposed = false
  const scheme = nexusApiOrigin ? new URL(nexusApiOrigin).protocol === 'https:' ? 'wss:' : 'ws:' : location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(`${scheme}//${nexusApiOrigin ? new URL(nexusApiOrigin).host : location.host}/v1/circles/${encodeURIComponent(groupId)}/live`)
  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as { type: string; message?: GroupMessage }
      if (!disposed && payload.message) onInsert(payload.message)
    } catch { /* Ignore malformed realtime payloads. */ }
  }
  const poll = window.setInterval(async () => {
    if (disposed || socket.readyState === WebSocket.OPEN) return
    const latest = await fetchMessages(groupId)
    if (!disposed) latest.forEach(onUpdate ?? onInsert)
  }, 5000)
  return () => { disposed = true; window.clearInterval(poll); socket.close() }
}
