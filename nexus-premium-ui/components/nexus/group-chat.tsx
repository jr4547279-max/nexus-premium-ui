'use client'

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { BarChart2, ExternalLink, ImageIcon, Loader2, MapPin, MessageCircle, Plus, Route, Send, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import type { GroupMember } from '@/lib/group-service'
import {
  castVote,
  fetchMessages,
  sendMessage,
  sendPoll,
  subscribeToMessages,
  type GroupMessage,
  type PollMetadata,
} from '@/lib/message-service'
import { supabase } from '@/lib/supabase'

interface GroupChatProps {
  groupId: string
  groupName: string
  members: GroupMember[]
}

type RichMessageType = 'route' | 'location' | 'image'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDateDivider(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 24 * 60 * 60 * 1000 && now.getDate() === date.getDate()) return 'Today'
  if (diff < 48 * 60 * 60 * 1000) return 'Yesterday'
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
}

function isGrouped(messages: GroupMessage[], index: number) {
  if (index === 0) return false
  const previous = messages[index - 1]
  const current = messages[index]
  if (current.message_type === 'system' || previous.message_type === 'system') return false
  if (current.message_type === 'poll' || previous.message_type === 'poll') return false
  if (previous.user_id !== current.user_id) return false
  return new Date(current.created_at).getTime() - new Date(previous.created_at).getTime() < 5 * 60 * 1000
}

function needsDateDivider(messages: GroupMessage[], index: number) {
  if (index === 0) return true
  return new Date(messages[index - 1].created_at).toDateString() !== new Date(messages[index].created_at).toDateString()
}

async function sendRichMessage(
  groupId: string,
  userId: string,
  message: string,
  messageType: RichMessageType,
  metadata: Record<string, unknown>,
) {
  const { error } = await supabase.from('group_messages').insert({
    group_id: groupId,
    user_id: userId,
    message,
    message_type: messageType,
    metadata,
  })
  if (error) {
    console.error('[group-chat] rich message failed:', error.message)
    return false
  }
  return true
}

export function GroupChat({ groupId, groupName }: GroupChatProps) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [pending, startSend] = useTransition()
  const [pollOpen, setPollOpen] = useState(false)
  const [routeOpen, setRouteOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchMessages(groupId).then((nextMessages) => {
      if (!alive) return
      setMessages(nextMessages)
      setLoading(false)
    })
    return () => { alive = false }
  }, [groupId])

  useEffect(() => {
    const unsubscribe = subscribeToMessages(
      groupId,
      (message) => setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]),
      (message) => setMessages((current) => current.map((item) => item.id === message.id ? message : item)),
    )
    return unsubscribe
  }, [groupId])

  useEffect(() => {
    const timer = window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
    return () => window.clearTimeout(timer)
  }, [messages])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || !user?.id) return
    setInput('')
    startSend(async () => {
      const sent = await sendMessage(groupId, user.id, text)
      if (!sent) setInput(text)
    })
  }, [groupId, input, user?.id])

  const handleVote = useCallback(async (messageId: string, optionId: string) => {
    if (user?.id) await castVote(messageId, optionId, user.id)
  }, [user?.id])

  const shareLocation = useCallback(async () => {
    if (!user?.id) return
    setLocationOpen(false)
    if (!navigator.geolocation) {
      window.alert('Location sharing is not supported on this device.')
      return
    }
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const lat = coords.latitude
          const lng = coords.longitude
          const url = `https://www.google.com/maps?q=${lat},${lng}`
          const ok = await sendRichMessage(groupId, user.id, 'Shared their location', 'location', {
            location: { lat, lng },
            url,
          })
          if (!ok) window.alert('We could not share your location. Please try again.')
          resolve()
        },
        () => {
          window.alert('Location permission was denied. You can enable it in your browser settings.')
          resolve()
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      )
    })
  }, [groupId, user?.id])

  const shareRoute = useCallback(async (destination: string) => {
    if (!user?.id) return false
    const cleanDestination = destination.trim()
    if (!cleanDestination) return false
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleanDestination)}`
    const ok = await sendRichMessage(groupId, user.id, `Route to ${cleanDestination}`, 'route', {
      destination: cleanDestination,
      url,
    })
    if (!ok) window.alert('We could not share that route. Please try again.')
    if (ok) setRouteOpen(false)
    return ok
  }, [groupId, user?.id])

  const uploadPhoto = useCallback(async (file: File) => {
    if (!user?.id || photoBusy) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) {
      window.alert('Please choose a JPG, PNG, WebP or GIF.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      window.alert('That image is over 10MB. Please choose a smaller photo.')
      return
    }

    setPhotoBusy(true)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${groupId}/${user.id}/${crypto.randomUUID()}-${safeName}`
      const { error } = await supabase.storage.from('group-chat-media').upload(path, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      })
      if (error) {
        console.error('[group-chat] photo upload failed:', error.message)
        window.alert('Photo upload failed. Please try again.')
        return
      }
      const { data } = supabase.storage.from('group-chat-media').getPublicUrl(path)
      const ok = await sendRichMessage(groupId, user.id, 'Shared a photo', 'image', { url: data.publicUrl, path })
      if (!ok) window.alert('The photo uploaded but could not be shared in the chat.')
    } finally {
      setPhotoBusy(false)
    }
  }, [groupId, photoBusy, user?.id])

  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-xl border border-border/20 bg-black/20" style={{ height: 'min(520px, 65vh)' }}>
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2">
          {loading && (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && messages.length === 0 && <EmptyState groupName={groupName} />}

          {!loading && messages.map((message, index) => {
            const grouped = isGrouped(messages, index)
            const divider = needsDateDivider(messages, index)
            const mine = message.user_id === user?.id
            return (
              <div key={message.id}>
                {divider && <DateDivider label={formatDateDivider(message.created_at)} />}
                {message.message_type === 'system' && <SystemBubble message={message} />}
                {message.message_type === 'poll' && <PollCard message={message} currentUserId={user?.id} onVote={handleVote} />}
                {message.message_type === 'route' && <RouteBubble message={message} mine={mine} />}
                {message.message_type === 'location' && <LocationBubble message={message} mine={mine} />}
                {message.message_type === 'image' && <ImageBubble message={message} mine={mine} />}
                {message.message_type === 'text' && <MessageBubble message={message} mine={mine} grouped={grouped} />}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <div className="flex items-center gap-1 border-t border-border/10 px-2 py-1.5">
          <ActionIcon icon={<Route className="h-4 w-4" />} title="Share route" active={!!user?.id} onClick={() => setRouteOpen(true)} />
          <ActionIcon icon={<MapPin className="h-4 w-4" />} title="Share location" active={!!user?.id} onClick={() => setLocationOpen(true)} />
          <ActionIcon icon={<BarChart2 className="h-4 w-4" />} title="Create poll" active={!!user?.id} onClick={() => setPollOpen(true)} />
          <ActionIcon icon={photoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} title="Share photo" active={!!user?.id && !photoBusy} onClick={() => fileRef.current?.click()} />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void uploadPhoto(file) }} />
        </div>

        <div className="flex items-center gap-2 border-t border-border/20 bg-black/30 px-2 py-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend() } }}
            placeholder={user?.id ? 'Type a message…' : 'Sign in to chat'}
            maxLength={1000}
            disabled={pending || !user?.id}
            className={cn('min-w-0 flex-1 rounded-full border border-border/30 bg-muted/20 px-4 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/50', 'disabled:opacity-40')}
          />
          <button type="button" onClick={handleSend} disabled={!input.trim() || pending || !user?.id} aria-label="Send message" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {pollOpen && user?.id && <PollCreatorModal groupId={groupId} userId={user.id} onClose={() => setPollOpen(false)} />}
      {routeOpen && <RouteModal onClose={() => setRouteOpen(false)} onShare={shareRoute} />}
      {locationOpen && <ConfirmModal title="Share your location?" description="Your current location will be visible to everyone in this group." confirm="Share location" onCancel={() => setLocationOpen(false)} onConfirm={shareLocation} />}
    </>
  )
}

function ActionIcon({ icon, title, onClick, active }: { icon: ReactNode; title: string; onClick?: () => void; active: boolean }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} disabled={!active || !onClick} className={cn('rounded-lg p-2 transition-all', active ? 'text-primary hover:bg-primary/10' : 'cursor-not-allowed text-muted-foreground/30')}>{icon}</button>
}

function EmptyState({ groupName }: { groupName: string }) {
  return <div className="flex h-full flex-col items-center justify-center px-6 text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10"><MessageCircle className="h-5 w-5 text-primary" /></div><p className="text-sm font-medium">Start the conversation</p><p className="mt-1 max-w-xs text-xs text-muted-foreground">Plan {groupName} together, share a route or location, post a poll, or send a photo.</p></div>
}

function DateDivider({ label }: { label: string }) {
  return <div className="flex items-center gap-3 py-3"><div className="h-px flex-1 bg-border/20" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span><div className="h-px flex-1 bg-border/20" /></div>
}

function MessageBubble({ message, mine, grouped }: { message: GroupMessage; mine: boolean; grouped: boolean }) {
  const sender = message.sender_name || (message.sender_username ? `@${message.sender_username}` : 'Member')
  return <div className={cn('flex max-w-[88%] gap-2', mine ? 'ml-auto flex-row-reverse' : 'mr-auto', grouped ? 'mt-0.5' : 'mt-2')}>
    <div className={cn('h-7 w-7 shrink-0 overflow-hidden rounded-full bg-primary/10', grouped && 'invisible')}>
      {message.sender_avatar_url ? <img src={message.sender_avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[10px] text-primary">{sender[0]?.toUpperCase()}</span>}
    </div>
    <div className="min-w-0">
      <div className="mb-0.5 flex items-baseline gap-2">{!mine && !grouped && <span className="text-[10px] text-muted-foreground">{sender}</span>}<span className="text-[9px] text-muted-foreground/50">{formatTime(message.created_at)}</span></div>
      <div className={cn('break-words rounded-2xl px-3 py-2 text-sm leading-relaxed', mine ? 'rounded-tr-md bg-primary text-primary-foreground' : 'rounded-tl-md border border-border/20 bg-muted/30 text-foreground')}>{message.message}</div>
    </div>
  </div>
}

function SystemBubble({ message }: { message: GroupMessage }) {
  return <div className="flex items-center justify-center py-2"><div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60"><Sparkles className="h-3 w-3" />{message.message}</div></div>
}

function LocationBubble({ message, mine }: { message: GroupMessage; mine: boolean }) {
  const metadata = message.metadata || {}
  const location = metadata.location as { lat?: number; lng?: number } | undefined
  const url = typeof metadata.url === 'string' ? metadata.url : ''
  return <div className={cn('mt-2 max-w-[86%]', mine ? 'ml-auto' : 'mr-auto')}><div className="overflow-hidden rounded-2xl border border-border/20 bg-muted/20"><div className="flex items-center gap-3 p-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15"><MapPin className="h-5 w-5 text-primary" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium">{mine ? 'You shared your location' : `${message.sender_name || 'A member'} shared a location`}</p>{typeof location?.lat === 'number' && typeof location?.lng === 'number' && <p className="text-[10px] text-muted-foreground">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</p>}</div>{url && <a href={url} target="_blank" rel="noreferrer" aria-label="Open location" className="rounded-lg p-2 hover:bg-muted/40"><ExternalLink className="h-4 w-4" /></a>}</div></div></div>
}

function RouteBubble({ message, mine }: { message: GroupMessage; mine: boolean }) {
  const metadata = message.metadata || {}
  const url = typeof metadata.url === 'string' ? metadata.url : ''
  const destination = typeof metadata.destination === 'string' ? metadata.destination : 'Shared route'
  return <div className={cn('mt-2 max-w-[86%]', mine ? 'ml-auto' : 'mr-auto')}><div className="flex items-center gap-3 rounded-2xl border border-border/20 bg-muted/20 p-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15"><Route className="h-5 w-5 text-primary" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{destination}</p><p className="text-[10px] text-muted-foreground">{mine ? 'You shared directions' : `${message.sender_name || 'A member'} shared directions`}</p></div>{url && <a href={url} target="_blank" rel="noreferrer" className="rounded-xl bg-primary/10 px-3 py-2 text-xs font-medium text-primary">Open</a>}</div></div>
}

function ImageBubble({ message, mine }: { message: GroupMessage; mine: boolean }) {
  const url = typeof message.metadata?.url === 'string' ? message.metadata.url : ''
  if (!url) return null
  return <div className={cn('mt-2 max-w-[78%]', mine ? 'ml-auto' : 'mr-auto')}><div className="overflow-hidden rounded-2xl border border-border/20 bg-muted/20"><a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Shared photo" loading="lazy" className="max-h-80 w-full object-cover" /></a><div className="px-3 py-2 text-[10px] text-muted-foreground">{mine ? 'You' : (message.sender_name || 'A member')} · {formatTime(message.created_at)}</div></div></div>
}

function ConfirmModal({ title, description, confirm, onCancel, onConfirm }: { title: string; description: string; confirm: string; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const run = async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }
  return <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"><button type="button" aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} /><div className="relative w-full max-w-sm rounded-2xl border border-border/40 bg-[hsl(var(--card))] p-5 shadow-2xl"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm text-muted-foreground">{description}</p><div className="mt-5 flex gap-2"><button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border/40 py-2.5 text-sm">Cancel</button><button type="button" onClick={run} disabled={busy} className="flex-1 rounded-xl bg-primary py-2.5 text-sm text-primary-foreground disabled:opacity-40">{busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : confirm}</button></div></div></div>
}

function RouteModal({ onClose, onShare }: { onClose: () => void; onShare: (destination: string) => Promise<boolean> }) {
  const [destination, setDestination] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => { if (!destination.trim() || busy) return; setBusy(true); try { await onShare(destination) } finally { setBusy(false) } }
  return <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"><button type="button" aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} /><div className="relative w-full max-w-sm rounded-2xl border border-border/40 bg-[hsl(var(--card))] p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h3 className="font-semibold">Share a route</h3><p className="mt-1 text-xs text-muted-foreground">Send the group directions to a place.</p></div><button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-muted/40"><X className="h-4 w-4" /></button></div><input autoFocus value={destination} onChange={(event) => setDestination(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submit() }} placeholder="Where are you going?" className="mt-4 w-full rounded-xl border border-border/40 bg-muted/20 px-3 py-3 text-sm outline-none focus:border-primary/50" /><button type="button" disabled={!destination.trim() || busy} onClick={() => void submit()} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-40">{busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Share route'}</button></div></div>
}

function PollCreatorModal({ groupId, userId, onClose }: { groupId: string; userId: string; onClose: () => void }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [busy, setBusy] = useState(false)
  const valid = question.trim().length > 0 && options.filter(Boolean).filter((option) => option.trim()).length >= 2
  const create = async () => {
    const validOptions = options.map((option) => option.trim()).filter(Boolean)
    if (!question.trim() || validOptions.length < 2 || busy) return
    setBusy(true)
    try {
      const result = await sendPoll(groupId, userId, question.trim(), validOptions)
      if (result) onClose()
      else window.alert('Could not create the poll. Please try again.')
    } finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"><button type="button" aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} /><div className="relative w-full max-w-md rounded-2xl border border-border/40 bg-[hsl(var(--card))] p-5 shadow-2xl"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15"><BarChart2 className="h-3.5 w-3.5 text-primary" /></div><h3 className="text-sm font-semibold">Create poll</h3></div><button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-muted/40"><X className="h-4 w-4" /></button></div><input autoFocus value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask the group something…" maxLength={200} className="mt-4 w-full rounded-xl border border-border/40 bg-muted/20 px-3 py-3 text-sm outline-none focus:border-primary/50" /><div className="mt-3 space-y-2">{options.map((option, index) => <div key={`${index}-${options.length}`} className="flex gap-2"><input value={option} onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`Option ${index + 1}`} maxLength={100} className="min-w-0 flex-1 rounded-xl border border-border/30 bg-muted/20 px-3 py-2.5 text-sm outline-none" />{options.length > 2 && <button type="button" onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}</div>)}</div>{options.length < 6 && <button type="button" onClick={() => setOptions((current) => [...current, ''])} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/30 py-2 text-xs text-primary"><Plus className="h-3.5 w-3.5" /> Add option</button>}<button type="button" disabled={!valid || busy} onClick={() => void create()} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-40">{busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Create poll'}</button></div></div>
}

function PollCard({ message, currentUserId, onVote }: { message: GroupMessage; currentUserId?: string; onVote: (messageId: string, optionId: string) => void }) {
  const metadata = message.metadata as PollMetadata | null
  if (!metadata?.options?.length) return null
  const totalVotes = metadata.options.reduce((total, option) => total + option.votes.length, 0)
  return <div className="mr-auto mt-2 max-w-[92%] rounded-2xl border border-border/30 bg-muted/20 p-4"><div className="flex items-start gap-2"><BarChart2 className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-sm font-medium">{metadata.question}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{totalVotes} vote{totalVotes === 1 ? '' : 's'}</p></div></div><div className="mt-3 space-y-2">{metadata.options.map((option) => { const percent = totalVotes ? Math.round(option.votes.length / totalVotes * 100) : 0; const mine = !!currentUserId && option.votes.includes(currentUserId); return <button type="button" key={option.id} onClick={() => { if (currentUserId) onVote(message.id, option.id) }} disabled={!currentUserId} className={cn('relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-70', mine ? 'border-primary/60' : 'border-border/30')}><span className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${percent}%` }} /><span className="relative flex justify-between gap-3"><span>{option.text}</span><span className="text-xs text-muted-foreground">{percent}%</span></span></button> })}</div></div>
}
