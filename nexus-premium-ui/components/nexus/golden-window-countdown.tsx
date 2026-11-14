'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock, Sparkles } from 'lucide-react'

interface GoldenWindowCountdownProps {
  daysUntil: number
  startTime: string
  endTime: string
  endDayOffset?: number
  timeZone?: string
}

function targetFromWindow(daysUntil: number, time: string, timeZone?: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  const hour = Number.isFinite(hours) ? hours : 0
  const minute = Number.isFinite(minutes) ? minutes : 0
  if (!timeZone) {
    const target = new Date()
    target.setSeconds(0, 0)
    target.setDate(target.getDate() + Math.max(0, daysUntil))
    target.setHours(hour, minute, 0, 0)
    return target.getTime()
  }
  try {
    const now = new Date()
    const today = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now).map(({ type, value }) => [type, Number(value)])) as { year: number; month: number; day: number }
    const civilDate = new Date(Date.UTC(today.year, today.month - 1, today.day + Math.max(0, daysUntil)))
    const targetCivil = Date.UTC(civilDate.getUTCFullYear(), civilDate.getUTCMonth(), civilDate.getUTCDate(), hour, minute)
    let guess = targetCivil
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(({ type, value }) => [type, Number(value)])) as {
        year: number; month: number; day: number; hour: number; minute: number
      }
      const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
      guess += targetCivil - represented
    }
    return guess
  } catch {
    return targetFromWindow(daysUntil, time)
  }
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} ${hours} ${hours === 1 ? 'hour' : 'hours'}`
  if (hours > 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

export function GoldenWindowCountdown({ daysUntil, startTime, endTime, endDayOffset = 0, timeZone }: GoldenWindowCountdownProps) {
  const [now, setNow] = useState(() => Date.now())
  const startMs = useMemo(() => targetFromWindow(daysUntil, startTime, timeZone), [daysUntil, startTime, timeZone])
  const endMs = useMemo(() => targetFromWindow(daysUntil + endDayOffset, endTime, timeZone), [daysUntil, endTime, endDayOffset, timeZone])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const state = now >= startMs && now < endMs ? 'live' : now >= endMs ? 'ended' : 'upcoming'

  if (state === 'live') {
    return (
      <div className="mt-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5">
        <div className="flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-medium text-emerald-400">Your Golden Window is happening now</span>
        </div>
        <p className="mt-1 text-center text-xs text-muted-foreground tabular-nums">{formatRemaining(endMs - now)} remaining</p>
      </div>
    )
  }

  if (state === 'ended') {
    return (
      <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-muted/20 border border-border/30 px-3 py-2">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Golden Window completed</span>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl bg-primary/10 border border-primary/20 px-3 py-2.5">
      <div className="flex items-center justify-center gap-2">
        <Clock className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs text-muted-foreground">Golden Window in</span>
      </div>
      <p className="mt-1 text-center text-sm font-semibold text-primary tabular-nums">{formatRemaining(startMs - now)}</p>
    </div>
  )
}
