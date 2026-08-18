'use client'

import { useState, useEffect, useRef, useCallback, useTransition } from 'react'
import {
  Send, Loader2, MessageCircle, Sparkles, Route,
  MapPin, BarChart2, ImageIcon, X, Plus, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import type { GroupMember } from '@/lib/group-service'
import {
  fetchMessages,
  sendMessage,
  sendPoll,
  castVote,
  subscribeToMessages,
  type GroupMessage,
  type PollMetadata,
} from '@/lib/message-service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface GroupChatProps {
  groupId:   string
  groupName: string
  members:   GroupMember[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDateDivider(iso: string) {
  const d   = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 24 * 60 * 60 * 1000 && now.getDate() === d.getDate()) return 'Today'
  if (diff < 48 * 60 * 60 * 1000) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
}

function isGrouped(messages: GroupMessage[], i: number): boolean {
  if (i === 0) return false
  const prev = messages[i - 1]
  const curr = messages[i]
  if (curr.message_type === 'system' || prev.message_type === 'system') return false
  if (curr.message_type === 'poll'   || prev.message_type === 'poll')   return false
  if (prev.user_id !== curr.user_id) return false
  return (new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60 * 1000
}

function needsDateDivider(messages: GroupMessage[], i: number): boolean {
  if (i === 0) return true
  const prev = new Date(messages[i - 1].created_at)
  const curr = new Date(messages[i].created_at)
  return prev.getDate() !== curr.getDate()
      || prev.getMonth() !== curr.getMonth()
      || prev.getFullYear() !== curr.getFullYear()
}

// ── Main component ────────────────────────────────────────────────────────────

export function GroupChat({ groupId, groupName, members }: GroupChatProps) {
  const { user } = useAuth()
  const [messages,  setMessages]  = useState<GroupMessage[]>([])
  const [loading,   setLoading]   = useState(true)
  const [input,     setInput]     = useState('')
  const [pending,   startSend]    = useTransition()
  const [pollOpen,  setPollOpen]  = useState(false)

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

  // ── Real-time: INSERT + UPDATE (for vote counts) ─────────────────────────
  useEffect(() => {
    const unsub = subscribeToMessages(
      groupId,
      // INSERT → append if not already present
      (msg) => setMessages(prev =>
        prev.some(m => m.id === msg.id) ? prev : [...prev, msg],
      ),
      // UPDATE → replace existing row in-place (poll votes, etc.)
      (msg) => setMessages(prev =>
        prev.map(m => m.id === msg.id ? msg : m),
      ),
    )
    return unsub
  }, [groupId])

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(t)
  }, [messages])

  // ── Send text ────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || !user?.id) return
    setInput('')
    startSend(async () => { await sendMessage(groupId, user.id, text) })
  }, [input, user?.id, groupId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ── Vote on a poll ───────────────────────────────────────────────────────
  const handleVote = useCallback(async (messageId: string, optionId: string) => {
    if (!user?.id) return
    await castVote(messageId, optionId, user.id)
    // The UPDATE subscription updates messages state automatically
  }, [user?.id])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div
        className="flex flex-col rounded-xl overflow-hidden border border-border/20 bg-black/20"
        style={{ height: 'min(480px, 60vh)' }}
      >
        {/* ── Message list ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 space-y-0.5">
          {loading && (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            </div>
          )}

          {!loading && messages.length === 0 && (
            <EmptyState groupName={groupName} />
          )}

          {!loading && messages.map((msg, i) => {
            const grouped = isGrouped(messages, i)
            const divider = needsDateDivider(messages, i)
            const isMine  = msg.user_id === user?.id

            return (
              <div key={msg.id}>
                {divider && <DateDivider label={formatDateDivider(msg.created_at)} />}
                {msg.message_type === 'system'
                  ? <SystemBubble msg={msg} />
                  : msg.message_type === 'poll'
                  ? <PollCard msg={msg} currentUserId={user?.id} onVote={handleVote} />
                  : <MessageBubble msg={msg} isMine={isMine} grouped={grouped} />
                }
              </div>
            )
          })}

          <div ref={bottomRef} />
        </div>

        {/* ── Action bar (Route, Location, Poll, Photo) ─────────────── */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-t border-border/10">
          <ActionIcon
            icon={<Route    className="w-4 h-4" />}
            title="Share Route"
            disabled
          />
          <ActionIcon
            icon={<MapPin   className="w-4 h-4" />}
            title="Share Location"
            disabled
          />
          <ActionIcon
            icon={<BarChart2 className="w-4 h-4" />}
            title="Create Poll"
            onClick={() => { if (user?.id) setPollOpen(true) }}
            active={!!user?.id}
          />
          <ActionIcon
            icon={<ImageIcon className="w-4 h-4" />}
            title="Share Photo"
            disabled
          />
        </div>

        {/* ── Input bar ─────────────────────────────────────────────── */}
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
              'w-9 h-9 rounded-full shrink-0 flex items-center justify-center',
              'bg-primary text-primary-foreground',
              'transition-all duration-200 hover:bg-primary/90 active:scale-95',
              'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
            )}
          >
            {pending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send    className="w-4 h-4" />
            }
          </button>
        </div>
      </div>

      {/* ── Poll creator modal ─────────────────────────────────────── */}
      {pollOpen && user?.id && (
        <PollCreatorModal
          groupId={groupId}
          userId={user.id}
          onClose={() => setPollOpen(false)}
        />
      )}
    </>
  )
}

// ── ActionIcon ────────────────────────────────────────────────────────────────

function ActionIcon({
  icon, title, onClick, disabled = false, active = false,
}: {
  icon:      React.ReactNode
  title:     string
  onClick?:  () => void
  disabled?: boolean
  active?:   boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled || !active && !onClick}
      className={cn(
        'p-1.5 rounded-lg transition-all duration-150',
        active && onClick
          ? 'text-primary hover:bg-primary/10 hover:text-primary cursor-pointer'
          : 'text-muted-foreground/30 cursor-not-allowed',
      )}
    >
      {icon}
    </button>
  )
}

// ── PollCreatorModal ──────────────────────────────────────────────────────────

function PollCreatorModal({
  groupId, userId, onClose,
}: {
  groupId: string
  userId:  string
  onClose: () => void
}) {
  const [question, setQuestion]   = useState('')
  const [options,  setOptions]    = useState(['', ''])
  const [creating, setCreating]   = useState(false)
  const optRefs = useRef<(HTMLInputElement | null)[]>([])

  const isValid = question.trim().length > 0
    && options.filter(o => o.trim()).length >= 2

  const addOption = () => {
    if (options.length >= 6) return
    setOptions(prev => [...prev, ''])
    setTimeout(() => optRefs.current[options.length]?.focus(), 40)
  }

  const removeOption = (i: number) => {
    if (options.length <= 2) return
    setOptions(prev => prev.filter((_, idx) => idx !== i))
  }

  const updateOption = (i: number, val: string) =>
    setOptions(prev => prev.map((o, idx) => idx === i ? val : o))

  const handleOptionKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (i === options.length - 1) addOption()
      else optRefs.current[i + 1]?.focus()
    }
  }

  const handleCreate = async () => {
    if (!isValid || creating) return
    const validOptions = options.filter(o => o.trim())
    setCreating(true)
    await sendPoll(groupId, userId, question.trim(), validOptions)
    setCreating(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className={cn(
        'relative w-full max-w-md rounded-2xl p-5 space-y-4',
        'bg-[hsl(var(--card))] border border-border/40',
        'shadow-2xl',
      )}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
              <BarChart2 className="w-3.5 h-3.5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">Create Poll</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Question */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Question
          </label>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Ask the group something…"
            autoFocus
            maxLength={200}
            className={cn(
              'w-full bg-muted/20 border border-border/40 rounded-xl',
              'px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50',
              'outline-none focus:border-primary/50 transition-colors',
            )}
          />
        </div>

        {/* Options */}
        <div className="space-y-2">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Options
          </label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground/50 w-4 text-right shrink-0 font-medium">
                  {i + 1}
                </span>
                <input
                  ref={el => { optRefs.current[i] = el }}
                  value={opt}
                  onChange={e => updateOption(i, e.target.value)}
                  onKeyDown={e => handleOptionKeyDown(e, i)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={100}
                  className={cn(
                    'flex-1 bg-muted/20 border border-border/30 rounded-xl',
                    'px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40',
                    'outline-none focus:border-primary/40 transition-colors',
                  )}
                />
                {options.length > 2 && (
                  <button
                    onClick={() => removeOption(i)}
                    className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {options.length < 6 && (
            <button
              onClick={addOption}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl',
                'text-xs text-primary/70 hover:text-primary',
                'border border-dashed border-primary/20 hover:border-primary/40',
                'transition-all duration-150 w-full justify-center mt-1',
              )}
            >
              <Plus className="w-3 h-3" />
              Add option
            </button>
          )}
        </div>

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={!isValid || creating}
          className={cn(
            'w-full py-2.5 rounded-xl text-sm font-medium',
            'bg-primary/20 text-primary border border-primary/30',
            'hover:bg-primary/30 transition-all duration-150',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'flex items-center justify-center gap-2',
          )}
        >
          {creating
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
            : 'Create Poll'
          }
        </button>
      </div>
    </div>
  )
}

// ── PollCard ──────────────────────────────────────────────────────────────────

function PollCard({
  msg, currentUserId, onVote,
}: {
  msg:           GroupMessage
  currentUserId: string | undefined
  onVote:        (messageId: string, optionId: string) => Promise<void>
}) {
  const meta = msg.metadata as PollMetadata | null
  if (!meta?.options) return null

  const [voting, setVoting] = useState<string | null>(null) // optionId being voted on

  const totalVotes    = meta.options.reduce((s, o) => s + o.votes.length, 0)
  const myVoteOptId   = currentUserId
    ? (meta.options.find(o => o.votes.includes(currentUserId))?.id ?? null)
    : null
  const hasVoted      = myVoteOptId !== null

  const name = msg.sender_name ?? msg.sender_username ?? 'Someone'
  const time = formatTime(msg.created_at)

  const handleVote = async (optionId: string) => {
    if (!currentUserId || voting) return
    setVoting(optionId)
    await onVote(msg.id, optionId)
    setVoting(null)
  }

  return (
    <div className="my-3 w-full">
      <div className={cn(
        'rounded-2xl border border-border/25 overflow-hidden',
        'bg-gradient-to-b from-white/[0.04] to-black/20',
      )}>
        {/* Poll header */}
        <div className="flex items-start gap-2.5 px-4 pt-4 pb-3 border-b border-border/15">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
            <BarChart2 className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug">{meta.question}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {name} · {time}
              {totalVotes > 0 && (
                <> · <span className="text-primary/70">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span></>
              )}
            </p>
          </div>
        </div>

        {/* Options */}
        <div className="px-3 py-3 space-y-2">
          {meta.options.map(opt => {
            const count   = opt.votes.length
            const pct     = totalVotes > 0 ? (count / totalVotes) * 100 : 0
            const isMine  = opt.id === myVoteOptId
            const isVoting = voting === opt.id

            if (hasVoted) {
              // Result view — progress bar
              return (
                <div
                  key={opt.id}
                  className={cn(
                    'relative h-10 rounded-xl overflow-hidden border transition-colors',
                    isMine
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/20 bg-white/[0.02]',
                  )}
                >
                  {/* Fill bar */}
                  <div
                    className={cn(
                      'absolute inset-y-0 left-0 transition-all duration-700 ease-out rounded-xl',
                      isMine ? 'bg-primary/25' : 'bg-white/5',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                  {/* Label row */}
                  <div className="relative flex items-center justify-between h-full px-3 gap-2">
                    <span className={cn(
                      'text-xs font-medium truncate',
                      isMine ? 'text-primary' : 'text-foreground/80',
                    )}>
                      {isMine && <Check className="w-3 h-3 inline mr-1 shrink-0" />}
                      {opt.text}
                    </span>
                    <span className={cn(
                      'text-[10px] shrink-0 tabular-nums',
                      isMine ? 'text-primary font-medium' : 'text-muted-foreground',
                    )}>
                      {count}{totalVotes > 0 ? ` · ${Math.round(pct)}%` : ''}
                    </span>
                  </div>
                </div>
              )
            }

            // Vote view — tappable option
            return (
              <button
                key={opt.id}
                onClick={() => handleVote(opt.id)}
                disabled={!!voting || !currentUserId}
                className={cn(
                  'w-full h-10 rounded-xl border border-border/30',
                  'px-3 flex items-center justify-between text-left',
                  'bg-white/[0.03] hover:bg-primary/10 hover:border-primary/35',
                  'transition-all duration-150 group',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <span className="text-xs text-foreground/80 group-hover:text-foreground transition-colors truncate">
                  {opt.text}
                </span>
                {isVoting && (
                  <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 pb-3">
          {!hasVoted && currentUserId && (
            <p className="text-[10px] text-muted-foreground/50 text-center">
              Tap an option to cast your vote
            </p>
          )}
          {!currentUserId && (
            <p className="text-[10px] text-muted-foreground/50 text-center">
              Sign in to vote
            </p>
          )}
          {hasVoted && (
            <p className="text-[10px] text-muted-foreground/50 text-center">
              You've voted · tap another option to change
            </p>
          )}
        </div>
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
      <div className="shrink-0 w-7 h-7 self-end mb-0.5">
        {!grouped && (
          <div className={cn(
            'w-7 h-7 rounded-full overflow-hidden border border-primary/20',
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

      <div className={cn(
        'flex flex-col max-w-[78%]',
        isMine ? 'items-end' : 'items-start',
      )}>
        {!grouped && (
          <p className={cn(
            'text-[10px] text-muted-foreground mb-1 px-1',
            isMine ? 'text-right' : 'text-left',
          )}>
            {isMine ? 'You' : name}
            <span className="ml-1.5 opacity-60">{time}</span>
          </p>
        )}
        <div className={cn(
          'px-3 py-2 text-sm leading-relaxed break-words',
          isMine
            ? 'rounded-2xl rounded-br-sm bg-primary/20 border border-primary/25 text-foreground'
            : 'rounded-2xl rounded-bl-sm bg-white/5 border border-border/20 text-foreground',
        )}>
          {msg.message}
        </div>
        {grouped && (
          <p className="text-[9px] text-muted-foreground/40 px-1 mt-0.5">{time}</p>
        )}
      </div>
    </div>
  )
}

// ── SystemBubble ──────────────────────────────────────────────────────────────

function SystemBubble({ msg }: { msg: GroupMessage }) {
  const event     = msg.metadata?.event as string | undefined
  const name      = msg.sender_name ?? msg.sender_username ?? 'Someone'
  const isGolden  = event === 'golden_window'
  const isRoute   = event === 'route_generated'
  const isCreated = event === 'group_created'
  const isJoined  = event === 'member_joined'

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
          <strong className="font-semibold">{name}</strong>{' '}{msg.message}
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
