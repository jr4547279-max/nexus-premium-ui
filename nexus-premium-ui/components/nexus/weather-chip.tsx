'use client'

import {
  Sun,
  Moon,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudFog,
  Zap,
  Wind,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Weather } from '@/lib/weather-service'

/**
 * Phase 6A: compact weather chip for the Golden Window area.
 *
 * Dark-navy + gold styling to match the rest of Nexus. Renders nothing when
 * we have no weather (preserves layout if the call failed) — caller can
 * decide whether to show a skeleton.
 */
export function WeatherChip({
  weather,
  loading,
  className,
}: {
  weather: Weather | null
  loading?: boolean
  className?: string
}) {
  if (loading) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-400/15 bg-white/[0.02] text-[11px] text-muted-foreground',
          className,
        )}
        aria-live="polite"
        aria-busy="true"
      >
        <span className="w-3 h-3 rounded-full bg-amber-400/30 animate-pulse" />
        Checking weather…
      </div>
    )
  }
  if (!weather || weather.error) return null

  const Icon = iconFor(weather.condition)
  const tone = toneFor(weather.condition)
  const precip = weather.precipitation_pct

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-white/[0.02]',
        tone.border,
        className,
      )}
      role="group"
      aria-label={`Weather: ${weather.short_label}`}
    >
      <Icon className={cn('w-3.5 h-3.5 shrink-0', tone.icon)} aria-hidden="true" />
      <span className="text-[11px] font-medium text-foreground/90 leading-none">
        {weather.short_label}
      </span>
      {precip != null && precip >= 30 && (
        <span className="text-[10px] text-blue-300/90 leading-none">
          · {precip}% rain
        </span>
      )}
      {weather.wind_kph != null && weather.wind_kph >= 25 && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground leading-none">
          <Wind className="w-2.5 h-2.5" aria-hidden="true" />
          {Math.round(weather.wind_kph)} km/h
        </span>
      )}
      {!weather.is_forecast && (
        <span className="text-[9px] text-muted-foreground/70 tracking-wide uppercase leading-none">
          now
        </span>
      )}
    </div>
  )
}

function iconFor(c: Weather['condition']) {
  switch (c) {
    case 'clear':  return Sun
    case 'night':  return Moon
    case 'cloudy': return Cloud
    case 'rain':   return CloudRain
    case 'snow':   return CloudSnow
    case 'fog':    return CloudFog
    case 'storm':  return Zap
    default:       return Cloud
  }
}

function toneFor(c: Weather['condition']) {
  switch (c) {
    case 'clear':  return { border: 'border-amber-400/30',  icon: 'text-amber-300' }
    case 'night':  return { border: 'border-indigo-400/25', icon: 'text-indigo-200' }
    case 'cloudy': return { border: 'border-slate-400/25',  icon: 'text-slate-300' }
    case 'rain':   return { border: 'border-blue-400/30',   icon: 'text-blue-300' }
    case 'snow':   return { border: 'border-blue-200/25',   icon: 'text-blue-100' }
    case 'fog':    return { border: 'border-slate-400/20',  icon: 'text-slate-300' }
    case 'storm':  return { border: 'border-indigo-400/35', icon: 'text-indigo-300' }
    default:       return { border: 'border-border/40',     icon: 'text-muted-foreground' }
  }
}
