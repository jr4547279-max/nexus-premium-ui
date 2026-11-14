'use client'

import { useEffect, useMemo, useState } from 'react'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  saveAvailability,
  getGroupAvailability,
  type AvailabilitySlot,
  type GroupAvailabilityRow,
} from '@/lib/availability-service'

interface AvailabilityEditorProps {
  groupId: string
  currentUserId: string | null
  canFindGoldenWindow: boolean
  findingGoldenWindow: boolean
  goldenWindowHelp: string | null
  onSaved: (slots: AvailabilitySlot[]) => void
  onFindGoldenWindow: () => void
}

const DAYS: { idx: number; short: string; long: string }[] = [
  { idx: 1, short: 'Mon', long: 'Monday' },
  { idx: 2, short: 'Tue', long: 'Tuesday' },
  { idx: 3, short: 'Wed', long: 'Wednesday' },
  { idx: 4, short: 'Thu', long: 'Thursday' },
  { idx: 5, short: 'Fri', long: 'Friday' },
  { idx: 6, short: 'Sat', long: 'Saturday' },
  { idx: 0, short: 'Sun', long: 'Sunday' },
]

const dayLabelByIdx = new Map(DAYS.map((d) => [d.idx, d.short]))

function makeSlot(day: number, start = '18:00', end = '22:00'): AvailabilitySlot {
  return { day_of_week: day, start_time: start, end_time: end }
}

function displayName(row: { display_name: string | null; email: string | null }) {
  return row.display_name || row.email?.split('@')[0] || 'Member'
}

export function AvailabilityEditor({ groupId, currentUserId, canFindGoldenWindow, findingGoldenWindow, goldenWindowHelp, onSaved, onFindGoldenWindow }: AvailabilityEditorProps) {
  const [mySlots, setMySlots] = useState<AvailabilitySlot[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [groupRows, setGroupRows] = useState<GroupAvailabilityRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setRefreshWarning(null)
    ;(async () => {
      try {
        // One authorized Circle read provides both the member summary and the
        // current user's editable rows, avoiding two competing snapshots.
        const group = await getGroupAvailability(groupId)
        if (cancelled) return
        setGroupRows(group)
        setMySlots(group
          .filter((slot) => slot.user_id === currentUserId)
          .map(({ day_of_week, start_time, end_time }) => ({ day_of_week, start_time, end_time })))
        setDirty(false)
      } catch (error) {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : 'Could not load availability. Try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [groupId, currentUserId, loadAttempt])

  const slotsByDay = useMemo(() => {
    const map = new Map<number, AvailabilitySlot[]>()
    for (const s of mySlots) {
      const arr = map.get(s.day_of_week) ?? []
      arr.push(s)
      map.set(s.day_of_week, arr)
    }
    return map
  }, [mySlots])

  const activeDays = useMemo(() => new Set(mySlots.map((s) => s.day_of_week)), [mySlots])

  const toggleDay = (day: number) => {
    setDirty(true)
    if (activeDays.has(day)) {
      setMySlots((prev) => prev.filter((s) => s.day_of_week !== day))
    } else {
      setMySlots((prev) => [...prev, makeSlot(day)])
    }
  }

  const updateSlot = (oldSlot: AvailabilitySlot, idx: number, patch: Partial<AvailabilitySlot>) => {
    setDirty(true)
    setMySlots((prev) => {
      // Build a fresh list, swapping only the n-th slot for this day.
      let dayN = -1
      return prev.map((s) => {
        if (s.day_of_week !== oldSlot.day_of_week) return s
        dayN += 1
        if (dayN === idx) return { ...s, ...patch }
        return s
      })
    })
  }

  const removeSlot = (day: number, idx: number) => {
    setDirty(true)
    setMySlots((prev) => {
      let dayN = -1
      return prev.filter((s) => {
        if (s.day_of_week !== day) return true
        dayN += 1
        return dayN !== idx
      })
    })
  }

  const addSlot = (day: number) => {
    setDirty(true)
    setMySlots((prev) => [...prev, makeSlot(day)])
  }

  const handleSave = async () => {
    // Strip invalid rows before sending; surface a helpful toast.
    const cleaned = mySlots.filter((s) => s.start_time && s.end_time && s.start_time < s.end_time)
    if (cleaned.length !== mySlots.length) {
      toast.error('Each slot needs a start time earlier than its end time.')
      return
    }
    setSaving(true)
    const { inserted, errorMessage } = await saveAvailability(groupId, cleaned)
    setSaving(false)
    if (errorMessage) {
      toast.error(errorMessage)
      return
    }
    toast.success(
      inserted === 0 ? 'Availability cleared' : `Saved ${inserted} slot${inserted === 1 ? '' : 's'}`,
    )
    setDirty(false)
    onSaved(cleaned)
    // The write is already confirmed. Refresh the summary, but never turn a
    // successful save into a silent failure if this optional follow-up read
    // has a transient network error.
    try {
      const fresh = await getGroupAvailability(groupId)
      setGroupRows(fresh)
      setRefreshWarning(null)
    } catch {
      setGroupRows((current) => [
        ...current.filter((row) => row.user_id !== currentUserId),
        ...cleaned.map((slot) => ({
          ...slot,
          user_id: currentUserId ?? '',
          display_name: null,
          email: null,
        })),
      ])
      setRefreshWarning('Saved successfully. The Circle summary could not refresh; retry when your connection is back.')
    }
  }

  // ── Group summary: aggregate slots per member.
  const summaryByMember = useMemo(() => {
    const map = new Map<
      string,
      { name: string; days: Set<number>; count: number }
    >()
    for (const r of groupRows) {
      const key = r.user_id
      const entry = map.get(key) ?? { name: displayName(r), days: new Set<number>(), count: 0 }
      entry.days.add(r.day_of_week)
      entry.count += 1
      map.set(key, entry)
    }
    return Array.from(map.entries()).map(([user_id, v]) => ({ user_id, ...v }))
  }, [groupRows])

  return (
    <div className="space-y-4">
      {/* Editor */}
      <GlassCard className="p-4 space-y-4">
        <div>
          <p className="font-medium">Your availability</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tap the days you're free, then add the time windows that work for you.
          </p>
        </div>

        {refreshWarning && (
          <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5 text-xs leading-relaxed text-amber-100" role="status">
            {refreshWarning}
          </p>
        )}

        {/* Day chips */}
        {loading ? (
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">Loading saved availability…</p>
        ) : loadError ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3" role="alert">
            <p className="text-sm text-amber-100">{loadError}</p>
            <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="mt-2 min-h-11 rounded-lg px-3 text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Retry loading
            </button>
          </div>
        ) : (
        <>
        <div className="flex flex-wrap gap-2" aria-label="Days of the week">
          {DAYS.map((d) => {
            const on = activeDays.has(d.idx)
            return (
              <button
                key={d.idx}
                type="button"
                onClick={() => toggleDay(d.idx)}
                aria-pressed={on}
                aria-label={`${d.long}, ${on ? 'selected' : 'not selected'}`}
                className={cn(
                  'min-h-11 min-w-11 px-3 py-2 rounded-xl text-sm font-medium transition-all touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  on
                    ? 'bg-primary/15 text-primary border border-primary/40'
                    : 'bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50',
                )}
              >
                {d.short}
              </button>
            )
          })}
        </div>

        {/* Per-day time slots */}
        {activeDays.size === 0 ? (
          <p className="text-xs text-muted-foreground">
            No days selected — tap a day above to add time windows.
          </p>
        ) : (
          <div className="space-y-3">
            {DAYS.filter((d) => activeDays.has(d.idx)).map((d) => {
              const slots = slotsByDay.get(d.idx) ?? []
              return (
                <div key={d.idx} className="space-y-2">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    {d.long}
                  </p>
                  {slots.map((slot, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`availability-${d.idx}-${i}-start`}>Start time for {d.long}, slot {i + 1}</label>
                      <input
                        id={`availability-${d.idx}-${i}-start`}
                        type="time"
                        value={slot.start_time}
                        aria-label={`Start time for ${d.long}, slot ${i + 1}`}
                        onChange={(e) => updateSlot(slot, i, { start_time: e.target.value })}
                        className="flex-1 min-w-0 h-11 px-3 rounded-lg bg-muted/40 border border-border/40 text-base sm:text-sm touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                      <span className="text-muted-foreground text-sm">→</span>
                      <label className="sr-only" htmlFor={`availability-${d.idx}-${i}-end`}>End time for {d.long}, slot {i + 1}</label>
                      <input
                        id={`availability-${d.idx}-${i}-end`}
                        type="time"
                        value={slot.end_time}
                        aria-label={`End time for ${d.long}, slot ${i + 1}`}
                        onChange={(e) => updateSlot(slot, i, { end_time: e.target.value })}
                        className="flex-1 min-w-0 h-11 px-3 rounded-lg bg-muted/40 border border-border/40 text-base sm:text-sm touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => removeSlot(d.idx, i)}
                        className="h-11 w-11 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary touch-manipulation"
                        aria-label={`Remove ${d.long} time slot ${i + 1}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addSlot(d.idx)}
                    className="min-h-11 flex items-center gap-1.5 rounded-lg pr-3 text-sm text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary touch-manipulation"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add another time
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || loading || !dirty}
          className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
        >
          {saving ? 'Saving…' : dirty ? 'Save availability' : 'Saved'}
          {!saving && !dirty && <Check className="w-4 h-4 ml-2" />}
        </Button>
        </>
        )}
        {!loading && !loadError && !dirty && mySlots.length > 0 && canFindGoldenWindow && (
          <div className="space-y-2" aria-live="polite">
            <Button type="button" onClick={onFindGoldenWindow} disabled={findingGoldenWindow} aria-busy={findingGoldenWindow} className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground glow-gold">
              <Check className="h-4 w-4" /> {findingGoldenWindow ? 'Checking saved availability…' : 'Find Golden Window'}
            </Button>
          </div>
        )}
        {!loading && !loadError && !dirty && mySlots.length > 0 && !canFindGoldenWindow && goldenWindowHelp && (
          <p className="rounded-xl border border-border/30 bg-muted/20 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground" role="status">
            {goldenWindowHelp}
          </p>
        )}
      </GlassCard>

      {/* Group summary */}
      <GlassCard className="p-4 space-y-3">
        <div>
          <p className="font-medium">Group availability</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            What everyone in this group has submitted.
          </p>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground" role="status">Loading Circle availability…</p>
        ) : loadError ? (
          <p className="text-xs text-amber-100" role="alert">Circle availability could not be refreshed.</p>
        ) : summaryByMember.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No one has shared availability yet. Be the first.
          </p>
        ) : (
          <div className="space-y-2">
            {summaryByMember.map((m) => {
              const dayList = Array.from(m.days)
                .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) // Mon-first ordering
                .map((d) => dayLabelByIdx.get(d) ?? '?')
                .join(', ')
              const isMe = m.user_id === currentUserId
              return (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {m.name}
                      {isMe && <span className="text-muted-foreground"> (you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {dayList}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground ml-3 shrink-0">
                    {m.count} slot{m.count === 1 ? '' : 's'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
