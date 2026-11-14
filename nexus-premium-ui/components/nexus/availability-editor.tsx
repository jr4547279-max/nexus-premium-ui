'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Clock3, Copy, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatTime12h, formatTimeZoneLabel } from '@/lib/golden-window'
import { type GroupMember } from '@/lib/group-service'
import {
  getGroupAvailabilitySnapshot,
  saveAvailability,
  type AvailabilitySlot,
  type GroupAvailabilityRow,
} from '@/lib/availability-service'
import { GlassCard } from './glass-card'

interface AvailabilityEditorProps {
  groupId: string
  currentUserId: string | null
  members: GroupMember[]
  timezone: string
  canFindGoldenWindow: boolean
  findingGoldenWindow: boolean
  goldenWindowHelp: string | null
  onSaved: (slots: AvailabilitySlot[]) => void
  onDirtyChange: (dirty: boolean) => void
  onFindGoldenWindow: () => void
}

const DAYS = [
  { idx: 1, short: 'Mon', long: 'Monday' }, { idx: 2, short: 'Tue', long: 'Tuesday' },
  { idx: 3, short: 'Wed', long: 'Wednesday' }, { idx: 4, short: 'Thu', long: 'Thursday' },
  { idx: 5, short: 'Fri', long: 'Friday' }, { idx: 6, short: 'Sat', long: 'Saturday' },
  { idx: 0, short: 'Sun', long: 'Sunday' },
]

const dayLabelByIdx = new Map(DAYS.map((day) => [day.idx, day.short]))
const sortSlots = (slots: AvailabilitySlot[]) => [...slots].sort((a, b) =>
  a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time),
)
const slotsKey = (slots: AvailabilitySlot[]) => JSON.stringify(sortSlots(slots).map((slot) => [
  slot.day_of_week, slot.start_time, slot.end_time, slot.end_day_offset ?? 0,
]))
const displayName = (member: GroupMember) => member.display_name || member.email?.split('@')[0] || 'Circle member'
const makeSlot = (day: number): AvailabilitySlot => ({ day_of_week: day, start_time: '18:00', end_time: '22:00', end_day_offset: 0 })
const validTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
const slotIsValid = (slot: AvailabilitySlot) => {
  if (!validTime(slot.start_time) || !validTime(slot.end_time)) return false
  return slot.end_day_offset === 1 ? slot.end_time < slot.start_time : slot.start_time < slot.end_time
}

export function AvailabilityEditor({
  groupId, currentUserId, members, timezone, canFindGoldenWindow, findingGoldenWindow,
  goldenWindowHelp, onSaved, onDirtyChange, onFindGoldenWindow,
}: AvailabilityEditorProps) {
  const [mySlots, setMySlots] = useState<AvailabilitySlot[]>([])
  const [savedSlots, setSavedSlots] = useState<AvailabilitySlot[]>([])
  const [groupRows, setGroupRows] = useState<GroupAvailabilityRow[]>([])
  const [submittedMemberIds, setSubmittedMemberIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [copyFromDay, setCopyFromDay] = useState<number | null>(null)
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set())

  const dirty = slotsKey(mySlots) !== slotsKey(savedSlots)
  const isValid = mySlots.every(slotIsValid)
  const invalidCount = mySlots.filter((slot) => !slotIsValid(slot)).length

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setRefreshWarning(null)
    setSuccessMessage(null)
    getGroupAvailabilitySnapshot(groupId).then((snapshot) => {
      if (cancelled) return
      const rows = snapshot.slots
      const ownSlots = rows
        .filter((row) => row.user_id === currentUserId)
        .map(({ day_of_week, start_time, end_time, end_day_offset }) => ({ day_of_week, start_time, end_time, end_day_offset: end_day_offset ?? 0 }))
      setGroupRows(rows)
      setSubmittedMemberIds(new Set(snapshot.submittedUserIds))
      setMySlots(ownSlots)
      setSavedSlots(ownSlots)
    }).catch((error) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load your saved availability. Try again.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [groupId, currentUserId, loadAttempt])

  useEffect(() => {
    if (!dirty) return
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeClose)
    return () => window.removeEventListener('beforeunload', warnBeforeClose)
  }, [dirty])

  const slotsByDay = useMemo(() => {
    const result = new Map<number, AvailabilitySlot[]>()
    for (const slot of mySlots) result.set(slot.day_of_week, [...(result.get(slot.day_of_week) ?? []), slot])
    return result
  }, [mySlots])
  const activeDays = useMemo(() => new Set(mySlots.map((slot) => slot.day_of_week)), [mySlots])
  const savedMemberIds = submittedMemberIds

  const setSlot = (day: number, index: number, patch: Partial<AvailabilitySlot>) => {
    setSuccessMessage(null)
    setMySlots((current) => {
      let position = -1
      return current.map((slot) => {
        if (slot.day_of_week !== day) return slot
        position += 1
        return position === index ? { ...slot, ...patch } : slot
      })
    })
  }

  const toggleDay = (day: number) => {
    setSuccessMessage(null)
    setMySlots((current) => activeDays.has(day) ? current.filter((slot) => slot.day_of_week !== day) : [...current, makeSlot(day)])
  }

  const addSlot = (day: number) => setMySlots((current) => [...current, makeSlot(day)])

  const removeSlot = (day: number, index: number) => {
    setMySlots((current) => {
      let position = -1
      return current.filter((slot) => slot.day_of_week !== day || ++position !== index)
    })
  }

  const toggleCopyTarget = (day: number) => setCopyTargets((current) => {
    const next = new Set(current)
    if (next.has(day)) next.delete(day)
    else next.add(day)
    return next
  })

  const applyCopy = () => {
    if (copyFromDay === null || copyTargets.size === 0) return
    const source = slotsByDay.get(copyFromDay) ?? []
    setMySlots((current) => {
      const kept = current.filter((slot) => !copyTargets.has(slot.day_of_week))
      return [...kept, ...Array.from(copyTargets).flatMap((day) => source.map((slot) => ({ ...slot, day_of_week: day })))]
    })
    setSuccessMessage(null)
    setCopyFromDay(null)
    setCopyTargets(new Set())
    toast.success('Times copied. Save to share the changes with your Circle.')
  }

  const handleSave = async () => {
    if (!dirty || !isValid || saving) return
    setSaving(true)
    setSuccessMessage(null)
    setSaveError(null)
    const { inserted, errorMessage } = await saveAvailability(groupId, sortSlots(mySlots))
    setSaving(false)
    if (errorMessage) {
      setSaveError(errorMessage)
      toast.error(errorMessage)
      return
    }
    const committed = sortSlots(mySlots)
    setSavedSlots(committed)
    setSuccessMessage(`${inserted === 0 ? 'Availability cleared' : `${inserted} time window${inserted === 1 ? '' : 's'} saved`} for your Circle.`)
    if (currentUserId) setSubmittedMemberIds((current) => new Set([...current, currentUserId]))
    toast.success('Availability saved')
    onSaved(committed)
    try {
      const snapshot = await getGroupAvailabilitySnapshot(groupId)
      setGroupRows(snapshot.slots)
      setSubmittedMemberIds(new Set(snapshot.submittedUserIds))
      setRefreshWarning(null)
    } catch {
      setGroupRows((current) => [
        ...current.filter((row) => row.user_id !== currentUserId),
        ...committed.map((slot) => ({ ...slot, user_id: currentUserId ?? '', display_name: null, email: null })),
      ])
      setRefreshWarning('Your changes are saved. The Circle status could not refresh just now.')
    }
  }

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-5 p-4 sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-base font-medium text-foreground">When are you free?</h2>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Choose the days and times that work for you.</p>
          <p className="mt-2 text-xs text-muted-foreground">Times shown in <span className="text-foreground/80">{formatTimeZoneLabel(timezone)}</span>.</p>
        </div>

        {dirty && <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary" role="status">Unsaved edits</p>}
        {successMessage && <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300" role="status" aria-live="polite">{successMessage}</p>}
        {refreshWarning && <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs leading-relaxed text-amber-100" role="status">{refreshWarning}</p>}
        {saveError && <div className="rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-3" role="alert"><p className="text-xs leading-relaxed text-red-100">{saveError}</p><Button type="button" onClick={() => void handleSave()} disabled={saving || !isValid} className="mt-2 min-h-10 rounded-lg bg-red-400/10 px-3 text-xs text-red-100">{saving ? 'Retrying…' : 'Retry save'}</Button></div>}

        {loading ? (
          <p className="py-4 text-sm text-muted-foreground" role="status" aria-live="polite">Loading your saved times…</p>
        ) : loadError ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3" role="alert">
            <p className="text-sm text-amber-100">{loadError}</p>
            <Button type="button" onClick={() => setLoadAttempt((n) => n + 1)} className="mt-2 min-h-11 rounded-lg bg-muted/30 px-3 text-sm">Try again</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7" role="group" aria-label="Choose days you are available">
              {DAYS.map((day) => {
                const selected = activeDays.has(day.idx)
                const daySlots = slotsByDay.get(day.idx) ?? []
                return (
                  <button
                    key={day.idx}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${day.long}${selected ? `, ${daySlots.length} time window${daySlots.length === 1 ? '' : 's'}` : ', not selected'}`}
                    onClick={() => toggleDay(day.idx)}
                    className={cn(
                      'min-h-12 rounded-xl border px-2 text-sm font-medium transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      selected ? 'border-primary/50 bg-primary/10 text-primary shadow-[0_0_18px_rgba(255,91,48,0.08)]' : 'border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    <span>{day.short}</span>
                    {selected && <span className="mt-0.5 block text-[10px] font-normal opacity-80">{daySlots.length} window{daySlots.length === 1 ? '' : 's'}</span>}
                  </button>
                )
              })}
            </div>

            {activeDays.size === 0 ? (
              <p className="rounded-xl border border-border/30 bg-muted/10 px-3 py-4 text-sm text-muted-foreground">Tap a day to add your first time window.</p>
            ) : (
              <div className="space-y-3">
                {DAYS.filter((day) => activeDays.has(day.idx)).map((day) => {
                  const daySlots = slotsByDay.get(day.idx) ?? []
                  return (
                    <section key={day.idx} className="rounded-2xl border border-border/35 bg-black/20 p-3" aria-labelledby={`availability-day-${day.idx}`}>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 id={`availability-day-${day.idx}`} className="text-sm font-medium text-foreground">{day.long}</h3>
                        <Button type="button" variant="ghost" onClick={() => { setCopyFromDay(copyFromDay === day.idx ? null : day.idx); setCopyTargets(new Set()) }} className="min-h-10 gap-1.5 px-2 text-xs text-muted-foreground hover:text-primary" aria-expanded={copyFromDay === day.idx}>
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy to…
                        </Button>
                      </div>
                      <div className="space-y-2.5">
                        {daySlots.map((slot, index) => (
                          <div key={`${day.idx}-${index}`} className="rounded-xl border border-border/30 bg-background/50 p-3">
                            <div className="grid grid-cols-1 min-[400px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] [&>button]:justify-self-end items-end gap-2">
                              <div className="min-w-0">
                                <label htmlFor={`availability-${day.idx}-${index}-start`} className="mb-1 block text-xs text-muted-foreground">From</label>
                                <input id={`availability-${day.idx}-${index}-start`} type="time" value={slot.start_time} aria-label={`${day.long}, window ${index + 1}, start time`} onChange={(event) => setSlot(day.idx, index, { start_time: event.target.value })} className="h-11 w-full min-w-0 rounded-lg border border-border/40 bg-muted/30 px-2 text-base text-foreground touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                                <span className="mt-1 block text-xs tabular-nums text-primary">{formatTime12h(slot.start_time)}</span>
                              </div>
                              <span className="hidden min-[400px]:block pb-11 text-muted-foreground" aria-hidden="true">to</span>
                              <div className="min-w-0">
                                <label htmlFor={`availability-${day.idx}-${index}-end`} className="mb-1 block text-xs text-muted-foreground">Until</label>
                                <input id={`availability-${day.idx}-${index}-end`} type="time" value={slot.end_time} aria-label={`${day.long}, window ${index + 1}, end time`} onChange={(event) => setSlot(day.idx, index, { end_time: event.target.value })} className="h-11 w-full min-w-0 rounded-lg border border-border/40 bg-muted/30 px-2 text-base text-foreground touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                                <span className="mt-1 block text-xs tabular-nums text-primary">{formatTime12h(slot.end_time)}{slot.end_day_offset === 1 ? ' · next day' : ''}</span>
                              </div>
                              <Button type="button" variant="ghost" onClick={() => removeSlot(day.idx, index)} aria-label={`Remove ${day.long} window ${index + 1}`} className="mb-7 h-11 w-11 shrink-0 p-0 text-muted-foreground hover:text-red-300"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                            <label className="mt-3 flex min-h-11 items-center gap-2 rounded-lg text-xs text-muted-foreground touch-manipulation">
                              <input type="checkbox" checked={slot.end_day_offset === 1} onChange={(event) => setSlot(day.idx, index, { end_day_offset: event.target.checked ? 1 : 0 })} className="h-4 w-4 accent-[var(--primary)]" aria-label={`${day.long}, window ${index + 1}, ends the next day`} />
                              Ends the next day
                            </label>
                            {!slotIsValid(slot) && <p className="mt-1 text-xs text-amber-200" role="alert">{slot.end_day_offset === 1 ? 'Choose an end time earlier than the start time for an overnight window.' : 'End time must be later than the start time.'}</p>}
                          </div>
                        ))}
                      </div>
                      <Button type="button" variant="ghost" onClick={() => addSlot(day.idx)} className="mt-2 min-h-11 gap-2 px-2 text-sm text-primary hover:bg-primary/5">
                        <Plus className="h-4 w-4" aria-hidden="true" /> Add a time window
                      </Button>

                      {copyFromDay === day.idx && (
                        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                          <p className="text-xs text-muted-foreground">Copy {day.long}'s windows to:</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {DAYS.filter((target) => target.idx !== day.idx).map((target) => (
                              <button key={target.idx} type="button" aria-pressed={copyTargets.has(target.idx)} onClick={() => toggleCopyTarget(target.idx)} className={cn('min-h-10 min-w-11 rounded-lg border px-3 text-xs touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', copyTargets.has(target.idx) ? 'border-primary/50 bg-primary/15 text-primary' : 'border-border/40 bg-background/50 text-muted-foreground')}>
                                {target.short}
                              </button>
                            ))}
                          </div>
                          <Button type="button" onClick={applyCopy} disabled={copyTargets.size === 0} className="mt-3 min-h-10 bg-primary px-3 text-xs text-primary-foreground disabled:opacity-40">Copy to {copyTargets.size || 'selected'} day{copyTargets.size === 1 ? '' : 's'}</Button>
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            )}

            {invalidCount > 0 && <p className="text-xs text-amber-200" role="status">Fix {invalidCount} time window{invalidCount === 1 ? '' : 's'} to save your changes.</p>}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button type="button" onClick={handleSave} disabled={!dirty || !isValid || saving} aria-busy={saving} className="min-h-12 flex-1 rounded-xl bg-primary text-primary-foreground glow-gold disabled:cursor-not-allowed disabled:opacity-40">
                {saving ? 'Saving…' : 'Save availability'}
                {!saving && <Check className="ml-2 h-4 w-4" aria-hidden="true" />}
              </Button>
              {dirty && <span className="text-center text-xs text-muted-foreground sm:text-left">Changes aren’t shared until saved.</span>}
            </div>
            {successMessage && !dirty && mySlots.length > 0 && canFindGoldenWindow && (
              <Button type="button" onClick={onFindGoldenWindow} disabled={findingGoldenWindow} className="min-h-12 w-full rounded-xl border border-primary/30 bg-transparent text-primary hover:bg-primary/5" aria-busy={findingGoldenWindow}>
                {findingGoldenWindow ? 'Finding a shared time…' : 'Find Golden Window'}
              </Button>
            )}
            {mySlots.length > 0 && !canFindGoldenWindow && goldenWindowHelp && <p className="rounded-xl border border-border/30 bg-muted/15 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground" role="status">{goldenWindowHelp}</p>}
          </>
        )}
      </GlassCard>

      <GlassCard className="space-y-3 p-4 sm:p-5">
        <div>
          <h2 className="text-sm font-medium text-foreground">Circle availability</h2>
          <p className="mt-1 text-xs text-muted-foreground">Your schedule is private to Circle members.</p>
        </div>
        {loading ? <p className="text-sm text-muted-foreground" role="status">Loading member status…</p> : loadError ? <p className="text-xs text-amber-100" role="alert">Member status couldn’t load. Retry above to refresh.</p> : members.map((member) => {
          const submitted = savedMemberIds.has(member.user_id)
          const memberRows = groupRows.filter((row) => row.user_id === member.user_id)
          const memberDays = Array.from(new Set(memberRows.map((row) => row.day_of_week)))
            .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
            .map((day) => dayLabelByIdx.get(day) ?? '?').join(', ')
          return (
            <div key={member.user_id} className="flex items-center justify-between gap-3 rounded-xl border border-border/25 bg-muted/15 px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{displayName(member)}{member.user_id === currentUserId ? <span className="text-muted-foreground"> · you</span> : null}</p>
                {submitted && <p className="mt-0.5 truncate text-xs text-muted-foreground">{memberDays || 'No active time windows'}</p>}
              </div>
              <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[11px]', submitted ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200' : 'border-border/40 bg-background/30 text-muted-foreground')}>
                {submitted ? 'Availability saved' : 'Waiting for availability'}
              </span>
            </div>
          )
        })}
      </GlassCard>
    </div>
  )
}
