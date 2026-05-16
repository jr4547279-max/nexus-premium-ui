'use client'

import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { WeatherAtmosphere, WeatherCondition, WeatherIntensity } from '@/components/nexus/weather-atmosphere'
import { GlassCard } from '@/components/nexus/glass-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Cloud, Sun, CloudRain, Zap, Snowflake, Wind, Moon, Sunrise } from 'lucide-react'

const CONDITION_COLORS: Record<WeatherCondition, string> = {
  clear:   'text-yellow-300',
  sunset:  'text-orange-400',
  rain:    'text-blue-300',
  cloudy:  'text-slate-300',
  storm:   'text-indigo-300',
  snow:    'text-white',
  fog:     'text-slate-400',
  night:   'text-indigo-200',
}

export default function WeatherDemoPage() {
  const [condition, setCondition] = useState<WeatherCondition>('clear')
  const [intensity, setIntensity] = useState<WeatherIntensity>('subtle')

  const conditions: { id: WeatherCondition; icon: React.ElementType; label: string }[] = [
    { id: 'clear',  icon: Sun,      label: 'Clear'  },
    { id: 'sunset', icon: Sunrise,  label: 'Sunset' },
    { id: 'rain',   icon: CloudRain,label: 'Rain'   },
    { id: 'cloudy', icon: Cloud,    label: 'Cloudy' },
    { id: 'storm',  icon: Zap,      label: 'Storm'  },
    { id: 'snow',   icon: Snowflake,label: 'Snow'   },
    { id: 'fog',    icon: Wind,     label: 'Fog'    },
    { id: 'night',  icon: Moon,     label: 'Night'  },
  ]

  const intensities: WeatherIntensity[] = ['subtle', 'medium', 'dramatic']

  return (
    <WeatherAtmosphere condition={condition} intensity={intensity}>
      <div className="container mx-auto px-4 py-12 max-w-4xl min-h-screen flex flex-col justify-center">
        <div className="space-y-6">

          {/* Header */}
          <div className="text-center space-y-3">
            <Badge className="bg-nexus-gold/20 text-nexus-gold border-nexus-gold/30 hover:bg-nexus-gold/30">
              Demo
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white text-glow-gold">
              Weather Atmosphere
            </h1>
            <p className="text-base text-white/50 max-w-xl mx-auto">
              Select a condition below — the background updates immediately.
            </p>
          </div>

          {/* ── DEBUG LABEL ─────────────────────────────────────────── */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-3 px-5 py-3 rounded-xl border border-white/20 bg-black/40 backdrop-blur-sm">
              <span className="text-white/40 text-xs uppercase tracking-widest font-medium">Live state</span>
              <span className="w-px h-4 bg-white/20" />
              <span className="text-xs font-mono">
                condition:{' '}
                <span className={cn('font-bold capitalize', CONDITION_COLORS[condition])}>
                  {condition}
                </span>
              </span>
              <span className="w-px h-4 bg-white/20" />
              <span className="text-xs font-mono">
                intensity:{' '}
                <span className="font-bold text-nexus-gold capitalize">{intensity}</span>
              </span>
            </div>
          </div>

          {/* Controls card */}
          <GlassCard className="p-6 space-y-6" glow>

            {/* Condition grid */}
            <div>
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-widest mb-3">
                Select Condition
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {conditions.map((item) => (
                  <Button
                    key={item.id}
                    variant={condition === item.id ? 'default' : 'outline'}
                    className={cn(
                      'h-auto py-4 flex flex-col gap-2 border-white/10 transition-all duration-200',
                      condition === item.id
                        ? 'bg-nexus-gold text-nexus-navy hover:bg-nexus-gold-bright shadow-lg'
                        : 'bg-white/5 hover:bg-white/10 text-white'
                    )}
                    onClick={() => setCondition(item.id)}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-xs font-semibold">{item.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Intensity row */}
            <div>
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-widest mb-3">
                Intensity
              </h3>
              <div className="flex gap-3">
                {intensities.map((level) => (
                  <Button
                    key={level}
                    variant={intensity === level ? 'default' : 'outline'}
                    className={cn(
                      'flex-1 capitalize border-white/10 transition-all duration-200',
                      intensity === level
                        ? 'bg-nexus-gold text-nexus-navy hover:bg-nexus-gold-bright'
                        : 'bg-white/5 hover:bg-white/10 text-white'
                    )}
                    onClick={() => setIntensity(level)}
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Info cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <GlassCard className="p-5 space-y-1.5">
              <h4 className="font-semibold text-white text-sm">Non-Intrusive</h4>
              <p className="text-xs text-white/50 leading-relaxed">
                pointer-events-none keeps all interactions intact.
              </p>
            </GlassCard>
            <GlassCard className="p-5 space-y-1.5">
              <h4 className="font-semibold text-white text-sm">Performance First</h4>
              <p className="text-xs text-white/50 leading-relaxed">
                CSS-only animations, respects prefers-reduced-motion.
              </p>
            </GlassCard>
            <GlassCard className="p-5 space-y-1.5">
              <h4 className="font-semibold text-white text-sm">Nexus Ready</h4>
              <p className="text-xs text-white/50 leading-relaxed">
                Matched to the Nexus Premium dark navy and gold palette.
              </p>
            </GlassCard>
          </div>

        </div>
      </div>
    </WeatherAtmosphere>
  )
}
