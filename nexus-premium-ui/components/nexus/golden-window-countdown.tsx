'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock } from 'lucide-react'

interface GoldenWindowCountdownProps {
  daysUntil: number
  startTime: string
  endTime: string
}

function targetFromWindow(daysUntil: number, time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  const target = new Date()
  target.setSeconds(0, 0)
  target.setDate(target.getDate() + Math.max(0, daysUntil))
  target.setHours(hours || 0, minutes || 0, 0, 0)
  return target.getTime()
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function GoldenWindowCountdown({ daysUntil, startTime, endTime }: GoldenWindowCountdownProps) {
  const [now, setNow] = useState(() => Date.now())
  const startMs = useMemo(() => targetFromWindow(daysUntil, startTime), [daysUntil, startTime])
  const endMs = useMemo(() => targetFromWindow(daysUntil, endTime), [daysUntil, endTime])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const state = now >= startMs && now < endMs ? 'live' : now >= endMs ? 'ended' : 'upcoming'

  if (state === 'live') {
    return (
      <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-medium text-emerald-400">Your Golden Window is happening now</span>
        <span className="text-xs text-muted-foreground">· {formatRemaining(endMs - now)} left</span>
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
    <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-3 py-2">
      <Clock className="w-3.5 h-3.5 text-primary" />
      <span className="text-xs text-muted-foreground">Golden Window in</span>
      <span className="text-sm font-semibold text-primary tabular-nums">{formatRemaining(startMs - now)}</span>
    </div>
  )
}
