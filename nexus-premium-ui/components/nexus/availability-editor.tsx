'use client'

import { useEffect, useMemo, useState } from 'react'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getMyAvailability, saveAvailability, getGroupAvailability, type AvailabilitySlot, type GroupAvailabilityRow } from '@/lib/availability-service'

interface AvailabilityEditorProps { groupId: string; currentUserId: string | null }
const DAYS: { idx: number; short: string; long: string }[] = [
  { idx: 1, short: 'Mon', long: 'Monday' }, { idx: 2, short: 'Tue', long: 'Tuesday' }, { idx: 3, short: 'Wed', long: 'Wednesday' },
  { idx: 4, short: 'Thu', long: 'Thursday' }, { idx: 5, short: 'Fri', long: 'Friday' }, { idx: 6, short: 'Sat', long: 'Saturday' }, { idx: 0, short: 'Sun', long: 'Sunday' },
]
const dayLabelByIdx = new Map(DAYS.map((d) => [d.idx, d.short]))
function makeSlot(day: number, start = '18:00', end = '22:00'): AvailabilitySlot { return { day_of_week: day, start_time: start, end_time: end } }
function displayName(row: { display_name: string | null; email: string | null }) { return row.display_name || row.email?.split('@')[0] || 'Member' }

export function AvailabilityEditor({ groupId, currentUserId }: AvailabilityEditorProps) {
  const [mySlots, setMySlots] = useState<AvailabilitySlot[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [groupRows, setGroupRows] = useState<GroupAvailabilityRow[]>([])

  const loadAll = async () => {
    setLoading(true)
    const [mine, group] = await Promise.all([getMyAvailability(groupId), getGroupAvailability(groupId)])
    setMySlots(mine); setGroupRows(group); setDirty(false); setLoading(false)
  }

  useEffect(() => { let cancelled = false; (async () => { const [mine, group] = await Promise.all([getMyAvailability(groupId), getGroupAvailability(groupId)]); if (cancelled) return; setMySlots(mine); setGroupRows(group); setLoading(false) })(); return () => { cancelled = true } }, [groupId])

  const slotsByDay = useMemo(() => { const map = new Map<number, AvailabilitySlot[]>(); for (const s of mySlots) { const arr = map.get(s.day_of_week) ?? []; arr.push(s); map.set(s.day_of_week, arr) } return map }, [mySlots])
  const activeDays = useMemo(() => new Set(mySlots.map((s) => s.day_of_week)), [mySlots])
  const toggleDay = (day: number) => { setDirty(true); if (activeDays.has(day)) setMySlots((prev) => prev.filter((s) => s.day_of_week !== day)); else setMySlots((prev) => [...prev, makeSlot(day)]) }
  const updateSlot = (oldSlot: AvailabilitySlot, idx: number, patch: Partial<AvailabilitySlot>) => { setDirty(true); setMySlots((prev) => { let dayN = -1; return prev.map((s) => { if (s.day_of_week !== oldSlot.day_of_week) return s; dayN += 1; return dayN === idx ? { ...s, ...patch } : s }) }) }
  const removeSlot = (day: number, idx: number) => { setDirty(true); setMySlots((prev) => { let dayN = -1; return prev.filter((s) => { if (s.day_of_week !== day) return true; dayN += 1; return dayN !== idx }) }) }
  const addSlot = (day: number) => { setDirty(true); setMySlots((prev) => [...prev, makeSlot(day)]) }

  const handleSave = async () => {
    const cleaned = mySlots.filter((s) => s.start_time && s.end_time && s.start_time < s.end_time)
    if (cleaned.length !== mySlots.length) { toast.error('Each slot needs a start time earlier than its end time.'); return }
    setSaving(true)
    const { inserted, errorMessage } = await saveAvailability(groupId, cleaned)
    setSaving(false)
    if (errorMessage) { toast.error(errorMessage); return }
    toast.success(inserted === 0 ? 'Availability cleared' : `Saved ${inserted} slot${inserted === 1 ? '' : 's'}`)
    setDirty(false)
    const fresh = await getGroupAvailability(groupId)
    setGroupRows(fresh)

    // The parent GroupDetail owns the Golden Window calculation state. Force it
    // to reload after a successful save so it never calculates against stale
    // availability from before this save. This also makes the flow reliable
    // when another member has just submitted their availability.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nexus:availability-saved', { detail: { groupId } }))
      window.setTimeout(() => window.location.reload(), 150)
    }
  }

  const summaryByMember = useMemo(() => {
    const map = new Map<string, { name: string; days: Set<number>; count: number }>()
    for (const r of groupRows) { const key = r.user_id; const entry = map.get(key) ?? { name: displayName(r), days: new Set<number>(), count: 0 }; entry.days.add(r.day_of_week); entry.count += 1; map.set(key, entry) }
    return Array.from(map.entries()).map(([user_id, v]) => ({ user_id, ...v }))
  }, [groupRows])

  return <div className="space-y-4">
    <GlassCard className="p-4 space-y-4">
      <div><p className="font-medium">Your availability</p><p className="text-xs text-muted-foreground mt-0.5">Tap the days you're free, then add the time windows that work for you.</p></div>
      <div className="flex flex-wrap gap-2">{DAYS.map((d) => { const on = activeDays.has(d.idx); return <button key={d.idx} type="button" onClick={() => toggleDay(d.idx)} className={cn('px-3 py-2 rounded-xl text-sm font-medium transition-all min-w-[3rem]', on ? 'bg-primary/15 text-primary border border-primary/40' : 'bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50')}>{d.short}</button> })}</div>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : activeDays.size === 0 ? <p className="text-xs text-muted-foreground">No days selected — tap a day above to add time windows.</p> : <div className="space-y-3">{DAYS.filter((d) => activeDays.has(d.idx)).map((d) => { const slots = slotsByDay.get(d.idx) ?? []; return <div key={d.idx} className="space-y-2"><p className="text-xs uppercase tracking-widest text-muted-foreground">{d.long}</p>{slots.map((slot, i) => <div key={i} className="flex items-center gap-2"><input type="time" value={slot.start_time} onChange={(e) => updateSlot(slot, i, { start_time: e.target.value })} className="flex-1 h-10 px-3 rounded-lg bg-muted/40 border border-border/40 text-sm" /><span className="text-muted-foreground text-sm">→</span><input type="time" value={slot.end_time} onChange={(e) => updateSlot(slot, i, { end_time: e.target.value })} className="flex-1 h-10 px-3 rounded-lg bg-muted/40 border border-border/40 text-sm" /><button type="button" onClick={() => removeSlot(d.idx, i)} className="p-2 rounded-lg text-muted-foreground hover:bg-muted/40" aria-label="Remove time slot"><Trash2 className="w-4 h-4" /></button></div>)}<button type="button" onClick={() => addSlot(d.idx)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80"><Plus className="w-3.5 h-3.5" />Add another time</button></div> })}</div>}
      <Button onClick={handleSave} disabled={saving || loading || !dirty} className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl">{saving ? 'Saving…' : dirty ? 'Save availability' : 'Saved'}{!saving && !dirty && <Check className="w-4 h-4 ml-2" />}</Button>
    </GlassCard>
    <GlassCard className="p-4 space-y-3"><div><p className="font-medium">Group availability</p><p className="text-xs text-muted-foreground mt-0.5">What everyone in this group has submitted.</p></div>{summaryByMember.length === 0 ? <p className="text-xs text-muted-foreground">No one has shared availability yet. Be the first.</p> : <div className="space-y-2">{summaryByMember.map((m) => { const dayList = Array.from(m.days).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => dayLabelByIdx.get(d) ?? '?').join(', '); const isMe = m.user_id === currentUserId; return <div key={m.user_id} className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2"><div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{m.name}{isMe && <span className="text-muted-foreground"> (you)</span>}</p><p className="text-xs text-muted-foreground truncate">{dayList}</p></div><span className="text-xs text-muted-foreground ml-3 shrink-0">{m.count} slot{m.count === 1 ? '' : 's'}</span></div> })}</div>}</GlassCard>
  </div>
}
