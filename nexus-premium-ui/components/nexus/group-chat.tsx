'use client'

import { useState, useEffect, useRef, useCallback, useTransition } from 'react'
import {
  Send, Loader2, MessageCircle, Sparkles, Route,
  MapPin, BarChart2, ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import type { GroupMember } from '@/lib/group-service'
import {
  fetchMessages,
  sendMessage,
  subscribeToMessages,
  type GroupMessage,
} from '@/lib/message-service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface GroupChatProps {
  groupId:   string
  groupName: string
  /** Pass the already-loaded member list so we can show member count. */
  members:   GroupMember[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a timestamp as HH:MM */
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** Format a timestamp as relative (today → time, older → date) */
function formatDateDivider(iso: string) {
  const d    = new Date(iso)
  const now  = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 24 * 60 * 60 * 1000 && now.getDate() === d.getDate()) return 'Today'
  if (diff < 48 * 60 * 60 * 1000) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
}

/** True when msg[i] should not repeat the avatar/name of the previous message. */
function isGrouped(messages: GroupMessage[], i: number): boolean {
  if (i === 0) return false
  const prev = messages[i - 1]
  const curr = messages[i]
  if (curr.message_type === 'system' || prev.message_type === 'system') return false
  if (prev.user_id !== curr.user_id) return false
  const diff = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime()
  return diff < 5 * 60 * 1000 // 5-minute grouping window
}

/** True when a date divider should be shown above msg[i]. */
function needsDateDivider(messages: GroupMessage[], i: number): boolean {
  if (i === 0) return true
  const prev = new Date(messages[i - 1].created_at)
  const curr = new Date(messages[i].created_at)
  return prev.getDate() !== curr.getDate() ||
         prev.getMonth() !== curr.getMonth() ||
         prev.getFullYear() !== curr.getFullYear()
}

// ── Main component ────────────────────────────────────────────────────────────

export function GroupChat({ groupId, groupName, members }: GroupChatProps) {
  const { user } = useAuth()
  const [messages,  setMessages]  = useState<GroupMessage[]>([])
  const [loading,   setLoading]   = useState(true)
  const [input,     setInput]     = useState('')
  const [pending,   startSend]    = useTransition()

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  // ── Load initial messages ────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchMessages(groupId).then(msgs => {
      if (!alive) return
      setMessages(msgs)
      setLoading(false)
    })
    return () => { alive = false }
  }, [groupId])

  // ── Real-time subscription ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToMessages(groupId, (msg) => {
      setMessages(prev =>
        prev.some(m => m.id === msg.id) ? prev : [...prev, msg],
      )
    })
    return unsub
  }, [groupId])

  // ── Auto-scroll to newest message ────────────────────────────────────────
  useEffect(() => {
    // Use a short delay so React has painted the new bubble before scrolling.
    const t = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(t)
  }, [messages])

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || !user?.id) return
    setInput('')
    startSend(async () => {
      await sendMessage(groupId, user.id, text)
    })
  }, [input, user?.id, groupId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col rounded-xl overflow-hidden border border-border/20 bg-black/20"
         style={{ height: 'min(480px, 60vh)' }}>

      {/* ── Message list ─────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 space-y-0.5"
      >
        {loading && (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <EmptyState groupName={groupName} />
        )}

        {!loading && messages.map((msg, i) => {
          const grouped  = isGrouped(messages, i)
          const divider  = needsDateDivider(messages, i)
          const isMine   = msg.user_id === user?.id

          return (
            <div key={msg.id}>
              {divider && <DateDivider label={formatDateDivider(msg.created_at)} />}
              {msg.message_type === 'system'
                ? <SystemBubble msg={msg} />
                : <MessageBubble msg={msg} isMine={isMine} grouped={grouped} />
              }
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Future-ready placeholders (icon row) ─────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border/10">
        <FutureIcon icon={<Route className="w-4 h-4" />}     title="Share Route"    />
        <FutureIcon icon={<MapPin className="w-4 h-4" />}    title="Share Location" />
        <FutureIcon icon={<BarChart2 className="w-4 h-4" />} title="Create Poll"    />
        <FutureIcon icon={<ImageIcon className="w-4 h-4" />} title="Share Photo"    />
        <span className="ml-auto text-[9px] text-muted-foreground/40 font-medium tracking-wider uppercase">
          Coming soon
        </span>
      </div>

      {/* ── Input bar ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-2 py-2 bg-black/30 border-t border-border/20">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={user?.id ? 'Type a message…' : 'Sign in to chat'}
          maxLength={1000}
          disabled={pending || !user?.id}
          className={cn(
            'flex-1 bg-muted/20 border border-border/30 rounded-full',
            'px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground/60',
            'outline-none focus:border-primary/50 transition-colors',
            'disabled:opacity-40',
          )}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || pending || !user?.id}
          aria-label="Send message"
          className={cn(
            'w-9 h-9 rounded-full shrink-0',
            'flex items-center justify-center',
            'bg-primary text-primary-foreground',
            'transition-all duration-200',
            'hover:bg-primary/90 active:scale-95',
            'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
          )}
        >
          {pending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Send className="w-4 h-4" />
          }
        </button>
      </div>
    </div>
  )
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  msg, isMine, grouped,
}: {
  msg:     GroupMessage
  isMine:  boolean
  grouped: boolean
}) {
  const name    = msg.sender_name ?? msg.sender_username ?? 'Member'
  const initial = (name[0] ?? '?').toUpperCase()
  const avatar  = msg.sender_avatar_url
  const time    = formatTime(msg.created_at)

  return (
    <div className={cn(
      'flex items-end gap-2',
      isMine ? 'flex-row-reverse' : 'flex-row',
      grouped ? 'mt-0.5' : 'mt-3',
    )}>
      {/* Avatar — only shown on first in a group */}
      <div className="shrink-0 w-7 h-7 self-end mb-0.5">
        {!grouped && (
          <div className={cn(
            'w-7 h-7 rounded-full overflow-hidden',
            'border border-primary/20',
            'flex items-center justify-center',
            'bg-gradient-to-br from-primary/20 to-primary/5',
          )}>
            {avatar
              ? <img src={avatar} alt={name} className="w-full h-full object-cover" />
              : <span className="text-[10px] font-semibold text-primary">{initial}</span>
            }
          </div>
        )}
      </div>

      {/* Content column */}
      <div className={cn(
        'flex flex-col max-w-[78%]',
        isMine ? 'items-end' : 'items-start',
      )}>
        {/* Sender name + time (first in group only) */}
        {!grouped && (
          <p className={cn(
            'text-[10px] text-muted-foreground mb-1 px-1',
            isMine ? 'text-right' : 'text-left',
          )}>
            {isMine ? 'You' : name}
            <span className="ml-1.5 opacity-60">{time}</span>
          </p>
        )}

        {/* Bubble */}
        <div className={cn(
          'px-3 py-2 text-sm leading-relaxed break-words',
          isMine
            ? [
                'rounded-2xl rounded-br-sm',
                'bg-primary/20 border border-primary/25 text-foreground',
              ]
            : [
                'rounded-2xl rounded-bl-sm',
                'bg-white/5 border border-border/20 text-foreground',
              ],
        )}>
          {msg.message}
        </div>

        {/* Grouped messages show time on hover via a tiny condensed stamp */}
        {grouped && (
          <p className="text-[9px] text-muted-foreground/40 px-1 mt-0.5">{time}</p>
        )}
      </div>
    </div>
  )
}

// ── SystemBubble ──────────────────────────────────────────────────────────────

function SystemBubble({ msg }: { msg: GroupMessage }) {
  const event      = msg.metadata?.event as string | undefined
  const name       = msg.sender_name ?? msg.sender_username ?? 'Someone'

  const isGolden   = event === 'golden_window'
  const isRoute    = event === 'route_generated'
  const isCreated  = event === 'group_created'
  const isJoined   = event === 'member_joined'

  return (
    <div className="flex justify-center my-3">
      <div className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full',
        'text-[11px] font-medium max-w-[90%] text-center',
        isGolden
          ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
          : isRoute
          ? 'bg-primary/10 text-primary border border-primary/20'
          : 'bg-muted/30 text-muted-foreground/80 border border-border/20',
      )}>
        {isGolden  && <Sparkles className="w-3 h-3 shrink-0 text-amber-400" />}
        {isRoute   && <Route    className="w-3 h-3 shrink-0 text-primary"   />}
        {isCreated && <span className="text-base leading-none shrink-0">🎉</span>}
        {isJoined  && <span className="text-base leading-none shrink-0">👋</span>}
        <span>
          <strong className="font-semibold">{name}</strong>{' '}
          {msg.message}
        </span>
      </div>
    </div>
  )
}

// ── DateDivider ───────────────────────────────────────────────────────────────

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-3">
      <div className="flex-1 h-px bg-border/20" />
      <span className="text-[10px] text-muted-foreground/50 font-medium px-2 uppercase tracking-wider">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/20" />
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ groupName }: { groupName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 py-8 text-center px-6">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
        <MessageCircle className="w-6 h-6 text-primary/60" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No messages yet</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Be the first to start the conversation for{' '}
          <span className="text-primary font-medium">{groupName}</span>
        </p>
      </div>
    </div>
  )
}

// ── FutureIcon (placeholder for upcoming attachment types) ────────────────────

function FutureIcon({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <button
      title={title}
      disabled
      className="p-1.5 rounded-lg text-muted-foreground/30 cursor-not-allowed"
    >
      {icon}
    </button>
  )
}
