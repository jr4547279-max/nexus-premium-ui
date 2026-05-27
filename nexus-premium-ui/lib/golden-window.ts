/**
 * Real Golden Window scoring — Phase 4 v1.
 *
 * Pure, dependency-free. Given a group's members and the availability rows
 * they've submitted, find the time windows where the most members overlap,
 * filtered to a 1-hour minimum and ranked.
 *
 * v1 deliberately ignores: calendars, time zones, venues, weather, fairness
 * across past events. Inputs are weekly recurring availability only.
 */

export interface GoldenWindowMember {
  id: string
  name?: string | null
}

export interface GoldenWindowAvailabilityRow {
  user_id: string
  day_of_week: number   // 0 = Sun .. 6 = Sat
  start_time: string    // "HH:MM"
  end_time: string      // "HH:MM"
}

export interface GoldenWindow {
  day_of_week: number
  start_time: string
  end_time: string
  duration_minutes: number
  available_member_count: number
  total_member_count: number
  available_member_ids: string[]
  confidence_score: number   // 0–100
  fairness_score: number     // 0–100
  days_until: number         // 0 = today, 1 = tomorrow, …
  label: string              // "Best Match" for the top result, "" otherwise
}

export interface ComputeOptions {
  /** Inject the current time for deterministic testing. Defaults to new Date(). */
  now?: Date
  /** Minimum overlap duration in minutes. Defaults to 60. */
  minDurationMinutes?: number
  /** Minimum number of members in an overlap. Defaults to 2. */
  minMembers?: number
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toMinutes(hhmm: string): number {
  const parts = hhmm.split(':')
  const h = Number.parseInt(parts[0] ?? '0', 10)
  const m = Number.parseInt(parts[1] ?? '0', 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return -1
  return h * 60 + m
}

function fromMinutes(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, '0')
  const m = (min % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Convert "HH:MM" 24-hour to a friendly "7:00 PM" 12-hour string.
 */
export function formatTime12h(hhmm: string): string {
  const min = toMinutes(hhmm)
  if (min < 0) return hhmm
  let h = Math.floor(min / 60)
  const m = min % 60
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${m.toString().padStart(2, '0')} ${suffix}`
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return `${h} hour${h === 1 ? '' : 's'}`
  return `${h}h ${m}m`
}

export function dayLabel(dow: number, daysUntil: number): string {
  if (daysUntil === 0) return 'Today'
  if (daysUntil === 1) return 'Tomorrow'
  if (daysUntil < 7) return `This ${DAY_LABELS[dow] ?? '?'}`
  return DAY_LABELS[dow] ?? '?'
}

export function dayShort(dow: number): string {
  return DAY_SHORT[dow] ?? '?'
}

/**
 * Core algorithm — sweep-line over each day-of-week.
 *
 * For each day we walk every interval boundary in chronological order and
 * track the set of currently-active members. Every time the active set
 * changes we close the previous segment. Segments that meet the minimums
 * become candidate Golden Windows. Then we rank.
 *
 * Tie-break order (per spec):
 *   1. more members available
 *   2. higher coverage of the group
 *   3. longer overlap
 *   4. soonest upcoming day
 */
export function computeGoldenWindows(
  members: GoldenWindowMember[],
  rows: GoldenWindowAvailabilityRow[],
  options: ComputeOptions = {},
): GoldenWindow[] {
  const total = members.length
  if (total === 0) return []

  const now = options.now ?? new Date()
  const todayDow = now.getDay()
  const minDuration = options.minDurationMinutes ?? 60
  const minMembers = Math.max(2, options.minMembers ?? 2)

  // Only count rows for members that are actually still in the group.
  const memberIdSet = new Set(members.map((m) => m.id))

  const rowsByDay = new Map<number, GoldenWindowAvailabilityRow[]>()
  for (const r of rows) {
    if (!memberIdSet.has(r.user_id)) continue
    if (r.day_of_week < 0 || r.day_of_week > 6) continue
    const list = rowsByDay.get(r.day_of_week) ?? []
    list.push(r)
    rowsByDay.set(r.day_of_week, list)
  }

  const windows: GoldenWindow[] = []

  for (const [day, dayRows] of rowsByDay) {
    type Ev = { t: number; kind: 0 | 1; uid: string }
    const events: Ev[] = []
    for (const r of dayRows) {
      const s = toMinutes(r.start_time)
      const e = toMinutes(r.end_time)
      if (s < 0 || e < 0 || e <= s) continue
      events.push({ t: s, kind: 1, uid: r.user_id })
      events.push({ t: e, kind: 0, uid: r.user_id })
    }
    if (events.length === 0) continue
    // At equal timestamps process exits BEFORE entries so a slot ending
    // exactly when another begins doesn't briefly inflate the count.
    events.sort((a, b) => a.t - b.t || a.kind - b.kind)

    // A member can submit overlapping slots — count refs, not booleans.
    const active = new Map<string, number>()
    let segStart = -1

    const flushUpTo = (endT: number) => {
      if (segStart < 0 || active.size === 0) return
      const dur = endT - segStart
      const memberIds = Array.from(active.keys())
      if (memberIds.length < minMembers || dur < minDuration) return

      const count = memberIds.length
      const coverage = count / total
      const daysUntil = (day - todayDow + 7) % 7
      const durFactor = Math.min(dur / 240, 1) // saturates at 4h

      windows.push({
        day_of_week: day,
        start_time: fromMinutes(segStart),
        end_time: fromMinutes(endT),
        duration_minutes: dur,
        available_member_count: count,
        total_member_count: total,
        available_member_ids: memberIds,
        confidence_score: Math.round(Math.min(coverage * 70 + durFactor * 30, 100) * 100) / 100 | 0
          || Math.round(coverage * 70 + durFactor * 30),
        fairness_score: Math.round(coverage * 100),
        days_until: daysUntil,
        label: '',
      })
    }

    let i = 0
    while (i < events.length) {
      const t = events[i]!.t
      // Close out the previous segment, which ran from segStart up to t.
      flushUpTo(t)
      // Apply every event at this timestamp.
      while (i < events.length && events[i]!.t === t) {
        const ev = events[i]!
        if (ev.kind === 1) {
          active.set(ev.uid, (active.get(ev.uid) ?? 0) + 1)
        } else {
          const next = (active.get(ev.uid) ?? 0) - 1
          if (next <= 0) active.delete(ev.uid)
          else active.set(ev.uid, next)
        }
        i++
      }
      segStart = active.size > 0 ? t : -1
    }
  }

  // Recompute confidence cleanly (the inline math above hardened against NaN
  // but produces an int; do it in one place for readability).
  for (const w of windows) {
    const coverage = w.available_member_count / w.total_member_count
    const durFactor = Math.min(w.duration_minutes / 240, 1)
    w.confidence_score = Math.round(Math.min(coverage * 70 + durFactor * 30, 100))
  }

  windows.sort((a, b) => {
    if (b.available_member_count !== a.available_member_count)
      return b.available_member_count - a.available_member_count
    const covA = a.available_member_count / a.total_member_count
    const covB = b.available_member_count / b.total_member_count
    if (covB !== covA) return covB - covA
    if (b.duration_minutes !== a.duration_minutes) return b.duration_minutes - a.duration_minutes
    if (a.days_until !== b.days_until) return a.days_until - b.days_until
    return a.start_time.localeCompare(b.start_time)
  })

  if (windows[0]) windows[0].label = 'Best Match'
  return windows
}
