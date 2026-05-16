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
      case 'subtle':   return 0.4
      case 'medium':   return 0.7
      case 'dramatic': return 1.0
      default:         return 0.4
    }
  }, [intensity])

  const particles = useMemo(() => {
    const base = condition.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
      + (intensity === 'subtle' ? 0 : intensity === 'medium' ? 500 : 1000)
    return makeParticles(100, base)
  }, [condition, intensity])

  const rainCount = intensity === 'dramatic' ? 80 : intensity === 'medium' ? 50 : 30
  const snowCount = intensity === 'dramatic' ? 100 : 50

  const renderWeatherEffect = () => {
    switch (condition) {
      case 'clear':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-radial-[at_50%_50%] from-nexus-gold/10 via-transparent to-transparent opacity-50" />
            {particles.slice(0, 15).map((p, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-nexus-gold/30 rounded-full animate-weather-float"
                style={{
                  left: `${p.r1 * 100}%`,
                  top: `${p.r2 * 100}%`,
                  animationDelay: `${p.r3 * 5}s`,
                  animationDuration: `${10 + p.r1 * 10}s`,
                  opacity: intensityValue * (0.2 + p.r2 * 0.3),
                }}
              />
            ))}
          </div>
        )

      case 'sunset':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-linear-to-t from-orange-500/20 via-nexus-gold/5 to-transparent opacity-60" />
            <div
              className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-nexus-gold/10 blur-[120px] rounded-full animate-pulse"
              style={{ animationDuration: '8s', opacity: intensityValue }}
            />
            <div className="absolute top-10 right-10 w-32 h-32 bg-nexus-gold/5 blur-3xl rounded-full" />
          </div>
        )

      case 'rain':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none bg-black/20">
            {particles.slice(0, rainCount).map((p, i) => (
              <div
                key={i}
                className="absolute w-[1px] h-12 bg-linear-to-b from-transparent via-blue-200/30 to-transparent animate-weather-rain"
                style={{
                  left: `${p.r1 * 100}%`,
                  top: `-${p.r2 * 20}%`,
                  animationDelay: `${p.r3 * 2}s`,
                  animationDuration: `${0.5 + p.r1 * 0.5}s`,
                  opacity: intensityValue,
                }}
              />
            ))}
          </div>
        )

      case 'cloudy':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.slice(0, 5).map((p, i) => (
              <div
                key={i}
                className="absolute bg-white/5 blur-[100px] rounded-full animate-weather-drift"
                style={{
                  width: `${300 + p.r1 * 400}px`,
                  height: `${200 + p.r2 * 300}px`,
                  left: `${-20 + p.r3 * 120}%`,
                  top: `${p.r1 * 80}%`,
                  animationDelay: `${p.r2 * 10}s`,
                  animationDuration: `${30 + p.r3 * 30}s`,
                  opacity: intensityValue * 0.5,
                }}
              />
            ))}
          </div>
        )

      case 'storm':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none bg-black/30">
            <div className="absolute inset-0 animate-weather-lightning" style={{ opacity: intensityValue * 0.3 }} />
            {particles.slice(0, 60).map((p, i) => (
              <div
                key={i}
                className="absolute w-[1px] h-16 bg-blue-100/20 animate-weather-rain"
                style={{
                  left: `${p.r1 * 100}%`,
                  top: `-${p.r2 * 20}%`,
                  animationDelay: `${p.r3 * 1}s`,
                  animationDuration: `${0.4 + p.r1 * 0.3}s`,
                }}
              />
            ))}
          </div>
        )

      case 'snow':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.slice(0, snowCount).map((p, i) => (
              <div
                key={i}
                className="absolute w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px] animate-weather-snow"
                style={{
                  left: `${p.r1 * 100}%`,
                  top: `-${p.r2 * 10}%`,
                  animationDelay: `${p.r3 * 5}s`,
                  animationDuration: `${5 + p.r1 * 5}s`,
                  opacity: intensityValue * (0.5 + p.r2 * 0.5),
                }}
              />
            ))}
          </div>
        )

      case 'fog':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.slice(0, 4).map((p, i) => (
              <div
                key={i}
                className="absolute inset-x-0 h-[40%] bg-white/5 blur-[80px] animate-weather-fog-drift"
                style={{
                  top: `${20 + i * 15}%`,
                  animationDelay: `${i * 2}s`,
                  animationDuration: `${20 + p.r1 * 10}s`,
                  opacity: intensityValue * 0.4,
                }}
              />
            ))}
          </div>
        )

      case 'night':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none bg-black/40">
            {particles.slice(0, 40).map((p, i) => (
              <div
                key={i}
                className="absolute w-0.5 h-0.5 bg-white rounded-full animate-weather-twinkle"
                style={{
                  left: `${p.r1 * 100}%`,
                  top: `${p.r2 * 100}%`,
                  animationDelay: `${p.r3 * 5}s`,
                  animationDuration: `${2 + p.r1 * 3}s`,
                  opacity: p.r2,
                }}
              />
            ))}
            <div className="absolute inset-0 bg-radial-[at_50%_20%] from-nexus-gold/5 via-transparent to-transparent" />
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className={cn('relative min-h-screen w-full bg-nexus-navy overflow-hidden', className)}>
      <div
        key={`${condition}-${intensity}`}
        className="fixed inset-0 z-0 pointer-events-none motion-reduce:hidden animate-weather-fade-in"
      >
        {renderWeatherEffect()}
      </div>

      <div className="relative z-10 w-full">
        {children}
      </div>
    </div>
  )
}
