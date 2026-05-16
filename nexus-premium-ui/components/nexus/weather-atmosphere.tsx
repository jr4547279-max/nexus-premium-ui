'use client'

import React, { useMemo } from 'react'
import { cn } from '@/lib/utils'

export type WeatherCondition = 'clear' | 'rain' | 'cloudy' | 'storm' | 'snow' | 'fog' | 'night' | 'sunset'
export type WeatherIntensity = 'subtle' | 'medium' | 'dramatic'

interface WeatherAtmosphereProps {
  condition: WeatherCondition
  intensity?: WeatherIntensity
  children?: React.ReactNode
  className?: string
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000
  return x - Math.floor(x)
}

function makeParticles(count: number, baseSeed: number) {
  return Array.from({ length: count }, (_, i) => ({
    r1: seededRandom(baseSeed + i * 3),
    r2: seededRandom(baseSeed + i * 3 + 1),
    r3: seededRandom(baseSeed + i * 3 + 2),
  }))
}

export function WeatherAtmosphere({
  condition,
  intensity = 'subtle',
  children,
  className,
}: WeatherAtmosphereProps) {
  const intensityValue = useMemo(() => {
    switch (intensity) {
      case 'subtle':   return 0.55
      case 'medium':   return 0.80
      case 'dramatic': return 1.0
      default:         return 0.55
    }
  }, [intensity])

  const particles = useMemo(() => {
    const base = condition.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
      + (intensity === 'subtle' ? 0 : intensity === 'medium' ? 500 : 1000)
    return makeParticles(120, base)
  }, [condition, intensity])

  const rainCount   = intensity === 'dramatic' ? 90 : intensity === 'medium' ? 60 : 40
  const snowCount   = intensity === 'dramatic' ? 100 : intensity === 'medium' ? 70 : 50

  const renderEffect = () => {
    switch (condition) {

      /* ── CLEAR: warm gold ambient glow + drifting motes ─────────────── */
      case 'clear':
        return (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute inset-0 bg-radial-[at_50%_40%] from-yellow-500/20 via-amber-500/5 to-transparent" />
            <div className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-yellow-400/10 blur-[100px] rounded-full" />
            {particles.slice(0, 24).map((p, i) => (
              <div
                key={i}
                className="absolute rounded-full animate-weather-float"
                style={{
                  width:  `${3 + p.r3 * 4}px`,
                  height: `${3 + p.r3 * 4}px`,
                  background: `oklch(0.78 0.14 75 / ${intensityValue * (0.3 + p.r2 * 0.5)})`,
                  left:   `${p.r1 * 100}%`,
                  top:    `${p.r2 * 100}%`,
                  animationDelay:    `${p.r3 * 6}s`,
                  animationDuration: `${8 + p.r1 * 12}s`,
                }}
              />
            ))}
          </div>
        )

      /* ── SUNSET: warm orange-gold horizon glow ───────────────────────── */
      case 'sunset':
        return (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-t from-orange-600/40 via-amber-500/15 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-[55%] bg-linear-to-t from-orange-700/30 via-amber-400/10 to-transparent" />
            <div
              className="absolute left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-amber-400/20 blur-[120px] rounded-full animate-pulse"
              style={{ bottom: '-10%', animationDuration: '6s', opacity: intensityValue }}
            />
            <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-orange-300/10 blur-[80px] rounded-full" style={{ opacity: intensityValue * 0.7 }} />
            {particles.slice(0, 8).map((p, i) => (
              <div
                key={i}
                className="absolute rounded-full blur-sm animate-weather-float"
                style={{
                  width: `${60 + p.r1 * 80}px`,
                  height: `${40 + p.r2 * 60}px`,
                  background: `oklch(0.75 0.18 60 / ${intensityValue * 0.12})`,
                  left:  `${p.r3 * 90}%`,
                  top:   `${40 + p.r1 * 40}%`,
                  animationDelay:    `${p.r2 * 4}s`,
                  animationDuration: `${12 + p.r3 * 8}s`,
                }}
              />
            ))}
          </div>
        )

      /* ── RAIN: blue-grey overlay + falling streaks ───────────────────── */
      case 'rain':
        return (
          <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ background: `rgba(10,20,40,${intensityValue * 0.35})` }}>
            <div className="absolute inset-0 bg-linear-to-b from-slate-900/20 to-slate-800/10" />
            {particles.slice(0, rainCount).map((p, i) => (
              <div
                key={i}
                className="absolute animate-weather-rain"
                style={{
                  width: '1.5px',
                  height: `${28 + p.r1 * 28}px`,
                  background: `linear-gradient(to bottom, transparent, rgba(147,197,253,${intensityValue * (0.4 + p.r2 * 0.4)}), transparent)`,
                  left:  `${p.r1 * 100}%`,
                  top:   `-${p.r2 * 20}%`,
                  animationDelay:    `${p.r3 * 2}s`,
                  animationDuration: `${0.4 + p.r1 * 0.5}s`,
                  transform: 'rotate(10deg)',
                }}
              />
            ))}
          </div>
        )

      /* ── CLOUDY: drifting soft cloud masses ──────────────────────────── */
      case 'cloudy':
        return (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-b from-slate-700/15 via-transparent to-transparent" />
            {particles.slice(0, 6).map((p, i) => (
              <div
                key={i}
                className="absolute rounded-full blur-[80px] animate-weather-drift"
                style={{
                  width:  `${350 + p.r1 * 400}px`,
                  height: `${180 + p.r2 * 220}px`,
                  background: `rgba(148,163,184,${intensityValue * (0.12 + p.r3 * 0.1)})`,
                  left:  `${-20 + p.r3 * 100}%`,
                  top:   `${p.r1 * 70}%`,
                  animationDelay:    `${p.r2 * 8}s`,
                  animationDuration: `${25 + p.r3 * 30}s`,
                }}
              />
            ))}
          </div>
        )

      /* ── STORM: dark overlay + lightning + heavy rain ────────────────── */
      case 'storm':
        return (
          <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ background: `rgba(5,10,20,${intensityValue * 0.55})` }}>
            <div className="absolute inset-0 animate-weather-lightning" style={{ opacity: intensityValue * 0.6 }} />
            <div className="absolute inset-0 bg-linear-to-b from-indigo-950/30 via-transparent to-slate-950/20" />
            {particles.slice(0, 70).map((p, i) => (
              <div
                key={i}
                className="absolute animate-weather-rain"
                style={{
                  width: '1px',
                  height: `${22 + p.r1 * 22}px`,
                  background: `linear-gradient(to bottom, transparent, rgba(199,210,254,${intensityValue * (0.3 + p.r2 * 0.4)}), transparent)`,
                  left:  `${p.r1 * 100}%`,
                  top:   `-${p.r2 * 20}%`,
                  animationDelay:    `${p.r3 * 1}s`,
                  animationDuration: `${0.3 + p.r1 * 0.3}s`,
                  transform: 'rotate(12deg)',
                }}
              />
            ))}
          </div>
        )

      /* ── SNOW: white floating flakes ─────────────────────────────────── */
      case 'snow':
        return (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-b from-slate-800/20 via-transparent to-transparent" />
            <div className="absolute inset-0 bg-radial-[at_50%_0%] from-blue-100/5 to-transparent" />
            {particles.slice(0, snowCount).map((p, i) => (
              <div
                key={i}
                className="absolute rounded-full animate-weather-snow"
                style={{
                  width:  `${2 + p.r3 * 4}px`,
                  height: `${2 + p.r3 * 4}px`,
                  background: `rgba(255,255,255,${intensityValue * (0.5 + p.r2 * 0.5)})`,
                  boxShadow: `0 0 ${3 + p.r1 * 4}px rgba(200,220,255,${intensityValue * 0.4})`,
                  left:  `${p.r1 * 100}%`,
                  top:   `-${p.r2 * 10}%`,
                  animationDelay:    `${p.r3 * 6}s`,
                  animationDuration: `${4 + p.r1 * 6}s`,
                }}
              />
            ))}
          </div>
        )

      /* ── FOG: layered drifting mist bands ────────────────────────────── */
      case 'fog':
        return (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-b from-slate-600/10 via-slate-500/5 to-transparent" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="absolute inset-x-0 animate-weather-fog-drift"
                style={{
                  height: '35%',
                  background: `rgba(200,210,220,${intensityValue * (0.08 + i * 0.025)})`,
                  filter: 'blur(40px)',
                  top:  `${10 + i * 16}%`,
                  animationDelay:    `${i * 2.5}s`,
                  animationDuration: `${18 + particles[i].r1 * 12}s`,
                }}
              />
            ))}
          </div>
        )

      /* ── NIGHT: deep dark + twinkling stars + moon glow ─────────────── */
      case 'night':
        return (
          <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ background: `rgba(0,5,20,${intensityValue * 0.55})` }}>
            <div className="absolute inset-0 bg-radial-[at_70%_15%] from-indigo-100/8 via-transparent to-transparent" />
            {particles.slice(0, 55).map((p, i) => (
              <div
                key={i}
                className="absolute rounded-full animate-weather-twinkle"
                style={{
                  width:  `${1 + Math.round(p.r3 * 2)}px`,
                  height: `${1 + Math.round(p.r3 * 2)}px`,
                  background: i % 8 === 0 ? `rgba(255,230,160,${intensityValue * (0.6 + p.r1 * 0.4)})` : `rgba(255,255,255,${intensityValue * (0.4 + p.r1 * 0.6)})`,
                  boxShadow: p.r3 > 0.7 ? `0 0 ${3 + p.r1 * 4}px rgba(255,255,255,0.6)` : 'none',
                  left: `${p.r1 * 100}%`,
                  top:  `${p.r2 * 75}%`,
                  animationDelay:    `${p.r3 * 5}s`,
                  animationDuration: `${2 + p.r1 * 4}s`,
                }}
              />
            ))}
            <div
              className="absolute rounded-full blur-[60px]"
              style={{
                width: '200px', height: '200px',
                background: `rgba(200,210,255,${intensityValue * 0.12})`,
                top: '8%', right: '12%',
              }}
            />
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className={cn('relative min-h-screen w-full bg-nexus-navy', className)}>
      {/* Weather background — absolute so it's correctly contained and never clipped by fixed quirks */}
      <div
        key={`${condition}::${intensity}`}
        className="absolute inset-0 z-0 pointer-events-none motion-reduce:hidden animate-weather-fade-in overflow-hidden"
      >
        {renderEffect()}
      </div>

      {/* Content layer */}
      <div className="relative z-10 w-full min-h-screen">
        {children}
      </div>
    </div>
  )
}
