/**
 * Real Golden Window scoring — Phase 4 v2.
 *
 * Pure, dependency-free. Given a group's members and their availability rows,
 * finds the best possible meeting time using a progressive scoring model rather
 * than a binary pass/fail rule.
 *
 * v2 changes from v1:
 * - No arbitrary minimum overlap duration — any genuine overlap is captured.
 *   A 5-minute overlap scores low but is never rejected outright.
 * - Added match_quality tiers: perfect | strong | partial | compromise.
 * - Compromise windows generated when there is no direct overlap on a day but
 *   multiple members have availability — finds the nearest consensus time.
 * - Never returns empty when meaningful data exists; always attempts a result.
 * - Added checkGoldenWindowRequirements() so callers explain exactly what is
 *   missing rather than silently showing "No Golden Window."
 */

export type MatchQuality = 'perfect' | 'strong' | 'partial' | 'compromise'

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
  confidence_score: number    // 0–100
  fairness_score: number      // 0–100
  days_until: number          // 0 = today, 1 = tomorrow, …
  label: string               // "Best Match" for the top result, "" otherwise
  match_quality: MatchQuality
  is_compromise: boolean
  /** Human-readable note for partial or compromise results. null for perfect/strong. */
  compromise_note: string | null
}

export interface ComputeOptions {
  /** Inject the current time for deterministic testing. Defaults to new Date(). */
  now?: Date
  /**
   * Minimum overlap duration in minutes for a direct-overlap segment to be
   * recorded. Defaults to 1 — any genuine overlap is captured and scored.
   * A short overlap will simply receive a lower duration-factor contribution
   * to confidence_score rather than being rejected.
   */
  minDurationMinutes?: number
  /** Minimum number of members that must overlap. Defaults to 2. */
  minMembers?: number
}

/** Minimum data required to attempt a Golden Window computation. */
export interface GoldenWindowRequirements {
  canCompute: boolean
  /** Human-readable explanation of what is missing. null when canCompute is true. */
  missingExplanation: string | null
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
  const clamped = Math.max(0, Math.min(min, 23 * 60 + 59))
  const h = Math.floor(clamped / 60).toString().padStart(2, '0')
  const m = (clamped % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

/** Convert "HH:MM" 24-hour to a friendly "7:00 PM" 12-hour string. */
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

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function assignMatchQuality(count: number, total: number): MatchQuality {
  if (count >= total) return 'perfect'
  if (count / total >= 0.75) return 'strong'
  return 'partial'
}

/**
 * Progressive confidence score.
 *
 * For direct overlaps:
 *   coverage_factor (0–70) + duration_factor (0–30) = 0–100
 *   where coverage_factor = (available / total) * 70
 *         duration_factor = min(duration / 240, 1) * 30   (saturates at 4 h)
 *
 * A 5-minute overlap between 2 of 2 members scores: 70 + ~1 = 71.
 * A 2-hour overlap between 3 of 4 members scores: 52.5 + 15 = ~68.
 *
 * For compromises: capped at 35 (always less confident than any direct overlap).
 */
function computeConfidence(
  count: number,
  total: number,
  durationMinutes: number,
  quality: MatchQuality,
): number {
  if (quality === 'compromise') {
    return Math.round((count / total) * 35)
  }
  const coverage  = count / total
  const durFactor = Math.min(durationMinutes / 240, 1)
  return Math.round(Math.min(coverage * 70 + durFactor * 30, 100))
}

// ─── Compromise generation ────────────────────────────────────────────────────

/**
 * When a day has availability for 2+ members but no direct overlap, generate
 * a "closest compromise" window instead of leaving the day blank.
 *
 * Strategy: find the median centre-of-availability across all member slots,
 * place a 60-minute window centred there, then count how many members have
 * availability within ±30 minutes of that window.
 */
function buildCompromiseWindow(
  day: number,
  dayRows: GoldenWindowAvailabilityRow[],
  total: number,
  todayDow: number,
): GoldenWindow | null {
  const memberIds = [...new Set(dayRows.map((r) => r.user_id))]
  if (memberIds.length < 2) return null

  // For each member, use the midpoint of their longest slot on this day.
  const memberInfo = memberIds.map((uid) => {
    const slots = dayRows.filter((r) => r.user_id === uid)
    const best  = slots.reduce((acc, r) => {
      const dur    = toMinutes(r.end_time)   - toMinutes(r.start_time)
      const accDur = toMinutes(acc.end_time) - toMinutes(acc.start_time)
      return dur > accDur ? r : acc
    })
    const s = toMinutes(best.start_time)
    const e = toMinutes(best.end_time)
    return { uid, centre: (s + e) / 2, start: s, end: e }
  })

  // Compromise centre = median of all member centres (robust against outliers).
  const sorted       = [...memberInfo].sort((a, b) => a.centre - b.centre)
  const medianCentre = sorted[Math.floor(sorted.length / 2)]!.centre

  const compStart = Math.round(medianCentre - 30)
  const compEnd   = compStart + 60

  // Members whose availability is within ±30 min of the compromise window.
  const reachable = memberInfo.filter(({ start, end }) =>
    start <= compEnd + 30 && end >= compStart - 30,
  )
  if (reachable.length < 2) return null

  const count     = reachable.length
  const daysUntil = (day - todayDow + 7) % 7
  const note      =
    count >= total
      ? `No perfect overlap found — this is the nearest time that works for everyone.`
      : `No direct overlap — this is the closest time for ${count} of ${total} members.`

  return {
    day_of_week:            day,
    start_time:             fromMinutes(compStart),
    end_time:               fromMinutes(compEnd),
    duration_minutes:       60,
    available_member_count: count,
    total_member_count:     total,
    available_member_ids:   reachable.map((m) => m.uid),
    confidence_score:       computeConfidence(count, total, 60, 'compromise'),
    fairness_score:         Math.round((count / total) * 100),
    days_until:             daysUntil,
    label:                  '',
    match_quality:          'compromise',
    is_compromise:          true,
    compromise_note:        note,
  }
}

// ─── Core algorithm ───────────────────────────────────────────────────────────

/**
 * Sweep-line over each day-of-week to find all time segments where the
 * required minimum of members are simultaneously available.
 *
 * Scoring tiers (match_quality):
 *   perfect    — all members available at that time
 *   strong     — ≥ 75 % of members available
 *   partial    — < 75 % but at least 2 members overlap
 *   compromise — no direct overlap; nearest consensus time generated
 *
 * Every real overlap (even 1 minute) produces a result. Duration contributes
 * to confidence_score progressively — shorter overlaps score lower but are
 * never rejected on duration alone.
 *
 * Tie-break order:
 *   1. higher match_quality tier  (perfect > strong > partial > compromise)
 *   2. more members available
 *   3. higher group coverage fraction
 *   4. longer overlap duration
 *   5. soonest upcoming day
 */
export function computeGoldenWindows(
  members: GoldenWindowMember[],
  rows: GoldenWindowAvailabilityRow[],
  options: ComputeOptions = {},
): GoldenWindow[] {
  const total = members.length
  if (total === 0) return []

  const now         = options.now ?? new Date()
  const todayDow    = now.getDay()
  const minDuration = options.minDurationMinutes ?? 1  // any genuine overlap
  const minMembers  = Math.max(2, options.minMembers ?? 2)

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

    // At equal timestamps: exits (kind=0) before entries (kind=1) so a slot
    // ending exactly when another starts doesn't briefly inflate the count.
    events.sort((a, b) => a.t - b.t || a.kind - b.kind)

    // A member can submit overlapping slots — track ref counts, not booleans.
    const active = new Map<string, number>()
    let segStart = -1
    let foundDirectOverlap = false

    const flushUpTo = (endT: number) => {
      if (segStart < 0 || active.size === 0) return
      const dur       = endT - segStart
      const memberIds = Array.from(active.keys())
      if (memberIds.length < minMembers || dur < minDuration) return

      foundDirectOverlap = true
      const count     = memberIds.length
      const quality   = assignMatchQuality(count, total)
      const daysUntil = (day - todayDow + 7) % 7

      windows.push({
        day_of_week:            day,
        start_time:             fromMinutes(segStart),
        end_time:               fromMinutes(endT),
        duration_minutes:       dur,
        available_member_count: count,
        total_member_count:     total,
        available_member_ids:   memberIds,
        confidence_score:       computeConfidence(count, total, dur, quality),
        fairness_score:         Math.round((count / total) * 100),
        days_until:             daysUntil,
        label:                  '',
        match_quality:          quality,
        is_compromise:          false,
        compromise_note:
          quality === 'partial'
            ? `${count} of ${total} members are free at this time.`
            : null,
      })
    }

    let i = 0
    while (i < events.length) {
      const t = events[i]!.t
      flushUpTo(t)
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

    // If this day had 2+ members' availability but zero qualifying direct
    // overlaps, generate a compromise window so the day isn't left blank.
    if (!foundDirectOverlap) {
      const uniqueMembers = new Set(dayRows.map((r) => r.user_id)).size
      if (uniqueMembers >= 2) {
        const compromise = buildCompromiseWindow(day, dayRows, total, todayDow)
        if (compromise) windows.push(compromise)
      }
    }
  }

  // Sort: quality tier first, then coverage, duration, soonest day.
  const qualityRank: Record<MatchQuality, number> = {
    perfect: 3, strong: 2, partial: 1, compromise: 0,
  }

  windows.sort((a, b) => {
    const qDiff = qualityRank[b.match_quality] - qualityRank[a.match_quality]
    if (qDiff !== 0) return qDiff
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

// ─── Requirements check ───────────────────────────────────────────────────────

/**
 * Returns whether there is enough data to attempt a Golden Window computation,
 * and if not, explains exactly what is missing.
 *
 * Callers use this instead of silently showing "No Golden Window."
 */
export function checkGoldenWindowRequirements(
  members: GoldenWindowMember[],
  rows: GoldenWindowAvailabilityRow[],
): GoldenWindowRequirements {
  if (members.length < 2) {
    return {
      canCompute: false,
      missingExplanation:
        'You need at least 2 members to find a Golden Window. Invite someone to join the group.',
    }
  }

  const memberIdSet = new Set(members.map((m) => m.id))
  const membersWithSlots = new Set(
    rows.filter((r) => memberIdSet.has(r.user_id)).map((r) => r.user_id),
  )

  if (membersWithSlots.size === 0) {
    return {
      canCompute: false,
      missingExplanation:
        'No members have added their availability yet. Go to the Availability tab to add yours.',
    }
  }

  if (membersWithSlots.size === 1) {
    return {
      canCompute: false,
      missingExplanation:
        'Only 1 member has added their availability. Waiting for at least 1 more to get started.',
    }
  }

  return { canCompute: true, missingExplanation: null }
}
