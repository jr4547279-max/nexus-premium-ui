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

export function WeatherAtmosphere({
  condition,
  intensity = 'subtle',
  children,
  className,
}: WeatherAtmosphereProps) {
  const intensityValue = useMemo(() => {
    switch (intensity) {
      case 'subtle': return 0.4
      case 'medium': return 0.7
      case 'dramatic': return 1.0
      default: return 0.4
    }
  }, [intensity])

  const renderWeatherEffect = () => {
    switch (condition) {
      case 'clear':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-radial-[at_50%_50%] from-nexus-gold/10 via-transparent to-transparent opacity-50" />
            {[...Array(15)].map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-nexus-gold/30 rounded-full animate-weather-float"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${10 + Math.random() * 10}s`,
                  opacity: intensityValue * (0.2 + Math.random() * 0.3),
                }}
              />
            ))}
          </div>
        )
      case 'sunset':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-linear-to-t from-orange-500/20 via-nexus-gold/5 to-transparent opacity-60" />
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-nexus-gold/10 blur-[120px] rounded-full animate-pulse" style={{ animationDuration: '8s' }} />
            <div className="absolute top-10 right-10 w-32 h-32 bg-nexus-gold/5 blur-3xl rounded-full" />
          </div>
        )
      case 'rain':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none bg-black/20">
            {[...Array(intensity === 'dramatic' ? 80 : intensity === 'medium' ? 50 : 30)].map((_, i) => (
              <div
                key={i}
                className="absolute w-[1px] h-12 bg-linear-to-b from-transparent via-blue-200/30 to-transparent animate-weather-rain"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-${Math.random() * 20}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${0.5 + Math.random() * 0.5}s`,
                  opacity: intensityValue,
                }}
              />
            ))}
          </div>
        )
      case 'cloudy':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="absolute bg-white/5 blur-[100px] rounded-full animate-weather-drift"
                style={{
                  width: `${300 + Math.random() * 400}px`,
                  height: `${200 + Math.random() * 300}px`,
                  left: `${-20 + Math.random() * 120}%`,
                  top: `${Math.random() * 80}%`,
                  animationDelay: `${Math.random() * 10}s`,
                  animationDuration: `${30 + Math.random() * 30}s`,
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
            {[...Array(60)].map((_, i) => (
              <div
                key={i}
                className="absolute w-[1px] h-16 bg-blue-100/20 animate-weather-rain"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-${Math.random() * 20}%`,
                  animationDelay: `${Math.random() * 1}s`,
                  animationDuration: `${0.4 + Math.random() * 0.3}s`,
                }}
              />
            ))}
          </div>
        )
      case 'snow':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(intensity === 'dramatic' ? 100 : 50)].map((_, i) => (
              <div
                key={i}
                className="absolute w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px] animate-weather-snow"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-${Math.random() * 10}%`,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${5 + Math.random() * 5}s`,
                  opacity: intensityValue * (0.5 + Math.random() * 0.5),
                }}
              />
            ))}
          </div>
        )
      case 'fog':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="absolute inset-x-0 h-[40%] bg-white/5 blur-[80px] animate-weather-fog-drift"
                style={{
                  top: `${20 + i * 15}%`,
                  animationDelay: `${i * 2}s`,
                  animationDuration: `${20 + Math.random() * 10}s`,
                  opacity: intensityValue * 0.4,
                }}
              />
            ))}
          </div>
        )
      case 'night':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none bg-black/40">
            {[...Array(40)].map((_, i) => (
              <div
                key={i}
                className="absolute w-0.5 h-0.5 bg-white rounded-full animate-weather-twinkle"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${2 + Math.random() * 3}s`,
                  opacity: Math.random(),
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
      {/* Weather Background Layer */}
      <div className="fixed inset-0 z-0 pointer-events-none motion-reduce:hidden">
        {renderWeatherEffect()}
      </div>

      {/* Content Layer */}
      <div className="relative z-10 w-full">
        {children}
      </div>
    </div>
  )
}
