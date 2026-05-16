'use client'

import React, { useState } from 'react'
import { WeatherAtmosphere, WeatherCondition, WeatherIntensity } from '@/components/nexus/weather-atmosphere'
import { GlassCard } from '@/components/nexus/glass-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Cloud, Sun, CloudRain, Zap, Snowflake, Wind, Moon, Sunrise } from 'lucide-react'

export default function WeatherDemoPage() {
  const [condition, setCondition] = useState<WeatherCondition>('clear')
  const [intensity, setIntensity] = useState<WeatherIntensity>('subtle')

  const conditions: { id: WeatherCondition; icon: any; label: string }[] = [
    { id: 'clear', icon: Sun, label: 'Clear' },
    { id: 'sunset', icon: Sunrise, label: 'Sunset' },
    { id: 'rain', icon: CloudRain, label: 'Rain' },
    { id: 'cloudy', icon: Cloud, label: 'Cloudy' },
    { id: 'storm', icon: Zap, label: 'Storm' },
    { id: 'snow', icon: Snowflake, label: 'Snow' },
    { id: 'fog', icon: Wind, label: 'Fog' },
    { id: 'night', icon: Moon, label: 'Night' },
  ]

  const intensities: WeatherIntensity[] = ['subtle', 'medium', 'dramatic']

  return (
    <WeatherAtmosphere condition={condition} intensity={intensity}>
      <div className="container mx-auto px-4 py-12 max-w-4xl min-h-screen flex flex-col justify-center">
        <div className="space-y-8 animate-fade-in-up">
          <div className="text-center space-y-4">
            <Badge className="bg-nexus-gold/20 text-nexus-gold border-nexus-gold/30 hover:bg-nexus-gold/30">
              New Feature
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white text-glow-gold">
              Weather Atmosphere
            </h1>
            <p className="text-lg text-white/60 max-w-2xl mx-auto">
              A premium, cinematic background layer for Nexus that adapts to your environment while preserving the elite dark navy and gold aesthetic.
            </p>
          </div>

          <GlassCard className="p-8 space-y-8" glow>
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-white/40 uppercase tracking-wider mb-4">Select Condition</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {conditions.map((item) => (
                    <Button
                      key={item.id}
                      variant={condition === item.id ? 'default' : 'outline'}
                      className={cn(
                        'h-auto py-4 flex flex-col gap-2 border-white/10 transition-all duration-300',
                        condition === item.id 
                          ? 'bg-nexus-gold text-nexus-navy hover:bg-nexus-gold-bright' 
                          : 'bg-white/5 hover:bg-white/10 text-white'
                      )}
                      onClick={() => setCondition(item.id)}
                    >
                      <item.icon className="w-6 h-6" />
                      <span className="text-xs font-semibold">{item.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-white/40 uppercase tracking-wider mb-4">Intensity Level</h3>
                <div className="flex gap-3">
                  {intensities.map((level) => (
                    <Button
                      key={level}
                      variant={intensity === level ? 'default' : 'outline'}
                      className={cn(
                        'flex-1 capitalize border-white/10 transition-all duration-300',
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
            </div>

            <div className="pt-6 border-t border-white/10">
              <div className="flex items-center justify-between text-white/60 text-sm">
                <span>Current Atmosphere:</span>
                <span className="font-mono text-nexus-gold capitalize">{condition} ({intensity})</span>
              </div>
            </div>
          </GlassCard>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GlassCard className="p-6 space-y-2">
              <h4 className="font-semibold text-white">Non-Intrusive</h4>
              <p className="text-sm text-white/60">Uses pointer-events-none to ensure the background never blocks user interactions.</p>
            </GlassCard>
            <GlassCard className="p-6 space-y-2">
              <h4 className="font-semibold text-white">Performance First</h4>
              <p className="text-sm text-white/60">Lightweight CSS-based animations that respect system motion preferences.</p>
            </GlassCard>
            <GlassCard className="p-6 space-y-2">
              <h4 className="font-semibold text-white">Nexus Ready</h4>
              <p className="text-sm text-white/60">Perfectly color-matched to the Nexus Premium v0 design language.</p>
            </GlassCard>
          </div>
        </div>
      </div>
    </WeatherAtmosphere>
  )
}
