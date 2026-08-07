'use client'

/**
 * AI Concierge — floating ✨ button + glassmorphism chat panel.
 *
 * Renders on every authenticated screen via nexus-app.tsx.
 * Uses POST /api/ai/chat (SSE) with the OpenAI Responses API.
 */

import {
  useState, useRef, useEffect, useCallback,
  type KeyboardEvent,
} from 'react'
import { Send, X, Sparkles, Loader2, ChevronDown, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import type { ChatMessage, ToolCallStatus, StreamEvent } from '@/lib/ai/types'

// ─── Suggested prompt chips ───────────────────────────────────────────────────

const CHIPS = [
  { id: 'pub',    label: '🍺 Find the best pub' },
  { id: 'why',    label: '✨ Why this Golden Window?' },
  { id: 'midway', label: '📍 Find somewhere halfway' },
  { id: 'coffee', label: '☕ Coffee instead' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface ConciergeProps {
  /** Currently selected group — passed as context to tool calls */
  groupId?: string
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveTool {
  name:   string
  label:  string
  status: 'calling' | 'done'
}

// ─── Unique message id helper ─────────────────────────────────────────────────

let _msgId = 0
const nextId = () => `msg-${++_msgId}`

// ─── Main component ───────────────────────────────────────────────────────────

export function ConciergeChat({ groupId }: ConciergeProps) {
  const { user } = useAuth()

  const [open,     setOpen]     = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([])
  const [hasNew,   setHasNew]   = useState(false)

  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  const abortRef   = useRef<AbortController | null>(null)

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeTools])

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setHasNew(false)
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [open])

  // ── Send a message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setInput('')
    setLoading(true)
    setActiveTools([])

    // Append user message
    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: trimmed }
    setMessages(prev => [...prev, userMsg])

    // Build history to send (exclude the message we just appended — we add it above
    // so the optimistic UI updates, but the API call uses the previous state + new msg)
    const history = [
      ...messages,
      userMsg,
    ].map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    // Placeholder for the streaming assistant reply
    const assistantId = nextId()
    setMessages(prev => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ])

    // Abort any previous request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/ai/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages: history,
          groupId:  groupId ?? undefined,
          userId:   user?.id ?? undefined,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        throw new Error(`Server error ${res.status}`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''
      let   fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          let event: StreamEvent
          try {
            event = JSON.parse(raw)
          } catch {
            continue
          }

          switch (event.type) {
            case 'thinking':
              // spinner already shown via loading=true
              break

            case 'tool_start':
              setActiveTools(prev => [
                ...prev.filter(t => t.name !== event.tool),
                { name: event.tool, label: event.label, status: 'calling' },
              ])
              break

            case 'tool_end':
              setActiveTools(prev =>
                prev.map(t =>
                  t.name === event.tool ? { ...t, status: 'done' } : t,
                ),
              )
              break

            case 'text':
              fullText += event.delta
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: fullText, streaming: true }
                    : m,
                ),
              )
              break

            case 'done':
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, streaming: false, toolCalls: buildToolCallStatuses(activeTools) }
                    : m,
                ),
              )
              setActiveTools([])
              if (!open) setHasNew(true)
              break

            case 'error':
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: `Sorry, something went wrong — ${event.message}`,
                        streaming: false,
                      }
                    : m,
                ),
              )
              setActiveTools([])
              break
          }
        }
      }

      // Mark done if stream ended without a 'done' event
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId && m.streaming
            ? { ...m, streaming: false }
            : m,
        ),
      )
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const errMsg = err instanceof Error ? err.message : 'Request failed.'
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `Sorry, I couldn't reach the AI service. ${errMsg}`, streaming: false }
            : m,
        ),
      )
    } finally {
      setLoading(false)
      setActiveTools([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, messages, groupId, user?.id, open])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleClear = () => {
    abortRef.current?.abort()
    setMessages([])
    setActiveTools([])
    setLoading(false)
    setInput('')
  }

  const isEmpty = messages.length === 0

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Floating ✨ trigger button ──────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close Nexus AI' : 'Open Nexus AI Concierge'}
        className={cn(
          'fixed bottom-[84px] right-4 z-40',
          'w-12 h-12 rounded-full',
          'flex items-center justify-center',
          'bg-primary text-primary-foreground',
          'shadow-lg shadow-primary/30',
          'transition-all duration-300',
          'hover:scale-110 hover:shadow-xl hover:shadow-primary/40',
          'active:scale-95',
          open && 'rotate-12 shadow-primary/50',
          'animate-glow-pulse',
        )}
      >
        <span className="text-xl leading-none select-none" style={{ pointerEvents: 'none' }}>
          ✨
        </span>
        {/* Unread dot */}
        {hasNew && !open && (
          <span className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-background" />
        )}
      </button>

      {/* ── Chat panel ──────────────────────────────────────────────────── */}
      {open && (
        <div
          className={cn(
            'fixed inset-x-3 bottom-[76px] z-50',
            'flex flex-col',
            'rounded-2xl overflow-hidden',
            'glass-card',
            'shadow-2xl shadow-black/30',
            'animate-scale-in',
            // Constrain height: min enough to see content, max ~65vh
            'max-h-[min(65vh,520px)] min-h-[320px]',
          )}
          style={{
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {/* Header */}
          <PanelHeader
            loading={loading}
            hasMessages={!isEmpty}
            onClear={handleClear}
            onClose={() => setOpen(false)}
          />

          {/* Messages */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3 min-h-0">
            {isEmpty ? (
              <EmptyState />
            ) : (
              <>
                {messages.map(msg => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {/* Live tool call chips */}
                {activeTools.length > 0 && (
                  <ToolCallStrip tools={activeTools} />
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Chips */}
          {isEmpty && (
            <ChipRow chips={CHIPS} onSelect={sendMessage} />
          )}

          {/* Input */}
          <InputBar
            ref={inputRef}
            value={input}
            onChange={setInput}
            onSend={() => sendMessage(input)}
            onKeyDown={handleKeyDown}
            loading={loading}
          />
        </div>
      )}
    </>
  )
}

// ─── Helper to snapshot active tool statuses into a message ──────────────────

function buildToolCallStatuses(tools: ActiveTool[]): ToolCallStatus[] {
  return tools.map(t => ({ name: t.name, label: t.label, status: 'done' as const }))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PanelHeader({
  loading,
  hasMessages,
  onClear,
  onClose,
}: {
  loading:     boolean
  hasMessages: boolean
  onClear:     () => void
  onClose:     () => void
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
      <div className="flex items-center gap-2">
        <div className="relative w-6 h-6 flex items-center justify-center">
          <Sparkles
            className={cn('w-4 h-4 text-primary', loading && 'animate-pulse')}
            style={{ pointerEvents: 'none' }}
          />
        </div>
        <div>
          <p className="text-xs font-semibold leading-none">Nexus AI</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {loading ? 'Thinking…' : 'Your group concierge'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {hasMessages && (
          <button
            onClick={onClear}
            title="Clear conversation"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" style={{ pointerEvents: 'none' }} />
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <ChevronDown className="w-4 h-4" style={{ pointerEvents: 'none' }} />
        </button>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 py-6 px-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
        <span className="text-2xl" style={{ pointerEvents: 'none' }}>✨</span>
      </div>
      <div>
        <p className="font-medium text-sm">Ask me anything about your group</p>
        <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
          I can find venues, explain the Golden Window, check the weather, or help plan the meetup.
        </p>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mr-2 mt-0.5">
          <span className="text-xs" style={{ pointerEvents: 'none' }}>✨</span>
        </div>
      )}
      <div
        className={cn(
          'max-w-[82%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'glass-card rounded-bl-sm text-foreground',
        )}
      >
        {message.content || (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" style={{ pointerEvents: 'none' }} />
            <span>Thinking…</span>
          </span>
        )}
        {message.streaming && message.content && (
          <span className="inline-block w-0.5 h-3 bg-current ml-0.5 animate-pulse rounded-full" />
        )}
      </div>
    </div>
  )
}

function ToolCallStrip({ tools }: { tools: ActiveTool[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {tools.map(tool => (
        <span
          key={tool.name}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium',
            tool.status === 'calling'
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
          )}
        >
          {tool.status === 'calling' ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin" style={{ pointerEvents: 'none' }} />
          ) : (
            <span style={{ pointerEvents: 'none' }}>✓</span>
          )}
          {tool.label.replace('…', '')}
        </span>
      ))}
    </div>
  )
}

function ChipRow({
  chips,
  onSelect,
}: {
  chips:    { id: string; label: string }[]
  onSelect: (text: string) => void
}) {
  return (
    <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
      {chips.map(chip => (
        <button
          key={chip.id}
          onClick={() => onSelect(chip.label.replace(/^[^\s]+ /, ''))}
          className={cn(
            'shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-medium',
            'glass-card border border-primary/20 text-primary',
            'hover:bg-primary/10 transition-colors whitespace-nowrap',
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}

import { forwardRef } from 'react'

const InputBar = forwardRef<
  HTMLTextAreaElement,
  {
    value:     string
    onChange:  (v: string) => void
    onSend:    () => void
    onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
    loading:   boolean
  }
>(function InputBar({ value, onChange, onSend, onKeyDown, loading }, ref) {
  return (
    <div className="px-3 pb-3 pt-2 border-t border-border/20 shrink-0">
      <div className="flex items-end gap-2 glass-card rounded-xl px-3 py-2">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about venues, timing, members…"
          className={cn(
            'flex-1 resize-none bg-transparent text-xs leading-relaxed outline-none',
            'placeholder:text-muted-foreground/60 max-h-24 min-h-[20px]',
            'scrollbar-none',
          )}
          style={{ fieldSizing: 'content' } as React.CSSProperties}
          disabled={loading}
        />
        <button
          onClick={onSend}
          disabled={!value.trim() || loading}
          className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5',
            'transition-all duration-200',
            value.trim() && !loading
              ? 'bg-primary text-primary-foreground shadow-sm hover:scale-110'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ pointerEvents: 'none' }} />
          ) : (
            <Send className="w-3.5 h-3.5" style={{ pointerEvents: 'none' }} />
          )}
        </button>
      </div>
      <p className="text-[9px] text-muted-foreground/40 text-center mt-1.5">
        AI suggestions only. Always verify venues before travelling.
      </p>
    </div>
  )
})
