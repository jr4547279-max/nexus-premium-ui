'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface GoldenRingProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero'
  animated?: boolean
  className?: string
  showInnerRing?: boolean
  intensity?: 'subtle' | 'normal' | 'intense'
}

const sizeMap = {
  sm: 'w-12 h-12',
  md: 'w-20 h-20',
  lg: 'w-28 h-28',
  xl: 'w-40 h-40',
  hero: 'w-52 h-52 md:w-64 md:h-64',
}

function countdownLabel(windowData: { days_until?: number; start_time?: string; end_time?: string }): string | null {
  if (typeof window === 'undefined') return null
  const daysUntil = Number(windowData.days_until)
  const start = windowData.start_time
  const end = windowData.end_time
  if (!Number.isFinite(daysUntil) || !start || !end) return null

  const [hours, minutes] = start.split(':').map(Number)
  const [endHours, endMinutes] = end.split(':').map(Number)
  if (![hours, minutes, endHours, endMinutes].every(Number.isFinite)) return null

  const target = new Date()
  target.setSeconds(0, 0)
  target.setDate(target.getDate() + Math.max(0, Math.floor(daysUntil)))
  target.setHours(hours, minutes, 0, 0)

  const now = Date.now()
  const startMs = target.getTime()
  const endTarget = new Date(target)
  endTarget.setHours(endHours, endMinutes, 0, 0)
  if (endTarget.getTime() < startMs) endTarget.setDate(endTarget.getDate() + 1)
  const endMs = endTarget.getTime()

  const remaining = now < startMs ? startMs - now : now < endMs ? endMs - now : 0
  if (remaining <= 0) return now < endMs ? 'Happening now' : null

  const totalMinutes = Math.floor(remaining / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hoursRemaining = Math.floor((totalMinutes % 1440) / 60)
  const minutesRemaining = totalMinutes % 60

  if (days > 0) return `${days}d ${hoursRemaining}h`
  if (hoursRemaining > 0) return `${hoursRemaining}h ${minutesRemaining}m`
  return `${minutesRemaining}m`
}

function GoldenCountdown() {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    const update = () => {
      try {
        const raw = window.localStorage.getItem('nexus:last-golden-window')
        setLabel(raw ? countdownLabel(JSON.parse(raw) as Record<string, unknown>) : null)
      } catch {
        setLabel(null)
      }
    }
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (!label) return null

  return (
    <div className="absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center pointer-events-none">
      <span className="block text-[9px] uppercase tracking-[0.14em] text-primary/60">Golden Window</span>
      <span className="block text-[10px] font-semibold tabular-nums text-primary">{label}</span>
    </div>
  )
}

export function GoldenRing({
  size = 'md',
  animated = true,
  className,
  showInnerRing = false,
  intensity = 'normal'
}: GoldenRingProps) {
  const glowIntensity = {
    subtle: 'opacity-30',
    normal: 'opacity-50',
    intense: 'opacity-70',
  }

  return (
    <div className={cn('relative flex items-center justify-center', sizeMap[size], className)}>
      <div
        className={cn(
          'absolute inset-0 rounded-full',
          'bg-gradient-to-r from-amber-500/20 via-yellow-400/30 to-amber-600/20',
          'blur-xl',
          glowIntensity[intensity],
          animated && 'animate-glow-pulse'
        )}
      />

      <div
        className={cn(
          'absolute inset-2 rounded-full',
          'bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600',
          'p-[2px]',
          animated && 'orbital-ring'
        )}
        style={{ animationDuration: '20s' }}
      >
        <div className="w-full h-full rounded-full bg-background" />
      </div>

      {showInnerRing && (
        <div
          className={cn(
            'absolute inset-6 rounded-full',
            'border border-amber-500/30',
            animated && 'orbital-ring-reverse'
          )}
        />
      )}

      <GoldenCountdown />

      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1/4 h-2 rounded-full bg-gradient-to-r from-transparent via-yellow-300 to-transparent opacity-60" />
    </div>
  )
}

interface OrbitalBackgroundProps {
  className?: string
  children?: React.ReactNode
}

export function OrbitalBackground({ className, children }: OrbitalBackgroundProps) {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-amber-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] border border-amber-500/5 rounded-full orbital-ring pointer-events-none" />
        <div className="absolute w-[400px] h-[400px] border border-amber-500/10 rounded-full orbital-ring-reverse pointer-events-none" />
        <div className="absolute w-[200px] h-[200px] border border-amber-500/5 rounded-full orbital-ring pointer-events-none" style={{ animationDuration: '15s' }} />
      </div>
      {children}
    </div>
  )
}

interface GlowingDotProps {
  className?: string
  color?: 'gold' | 'green' | 'blue'
}

export function GlowingDot({ className, color = 'gold' }: GlowingDotProps) {
  const colorMap = {
    gold: 'bg-amber-500',
    green: 'bg-emerald-500',
    blue: 'bg-blue-500',
  }

  return (
    <span className={cn('relative inline-flex', className)}>
      <span className={cn('w-2 h-2 rounded-full', colorMap[color])} />
      <span className={cn('absolute inset-0 w-2 h-2 rounded-full animate-ping', colorMap[color], 'opacity-75')} />
    </span>
  )
}
