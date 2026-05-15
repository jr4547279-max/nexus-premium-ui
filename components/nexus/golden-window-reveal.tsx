'use client'

import { useState, useEffect } from 'react'
import { TopHeader } from './navigation'
import { GlassCard, AvatarStack, StatBadge } from './glass-card'
import { GoldenRing, OrbitalBackground } from './golden-ring'
import { Button } from '@/components/ui/button'
import { 
  Sparkles, Check, Clock, MapPin, Car, Star, 
  ChevronRight, Users, Calendar, Shield
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockGroups, mockVenue } from '@/lib/mock-data'

interface GoldenWindowRevealProps {
  groupId?: string
  onBack: () => void
  onConfirm: () => void
}

export function GoldenWindowReveal({ groupId = '1', onBack, onConfirm }: GoldenWindowRevealProps) {
  const group = mockGroups.find(g => g.id === groupId) || mockGroups[0]
  const [revealed, setRevealed] = useState(false)
  const [showVenue, setShowVenue] = useState(false)

  useEffect(() => {
    // Dramatic reveal animation
    const timer1 = setTimeout(() => setRevealed(true), 500)
    const timer2 = setTimeout(() => setShowVenue(true), 1500)
    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [])

  if (!group.goldenWindow) return null

  return (
    <div className="min-h-screen bg-background">
      <OrbitalBackground className="min-h-screen">
        {/* Header */}
        <TopHeader 
          title=""
          showBack
          onBack={onBack}
          showNotifications={false}
        />

        <main className="px-4 py-6 max-w-md mx-auto">
          {/* Title */}
          <div className={cn(
            'text-center mb-8 transition-all duration-1000',
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}>
            <h1 className="text-2xl font-medium flex items-center justify-center gap-2">
              Golden Window Found <Sparkles className="w-5 h-5 text-primary" />
            </h1>
            <p className="text-muted-foreground mt-2">
              Everyone is free and within 20 min drive.
            </p>
          </div>

          {/* Main Golden Window Card */}
          <div className={cn(
            'transition-all duration-1000 delay-300',
            revealed ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          )}>
            <GlassCard glow className="p-6 text-center relative overflow-hidden">
              {/* Best Match Badge */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary/20 text-primary text-xs font-medium rounded-full">
                BEST MATCH
              </div>

              {/* Golden Ring Visual */}
              <div className="flex justify-center my-8">
                <div className="relative">
                  <GoldenRing size="xl" intensity="intense" showInnerRing />
                  
                  {/* Time Display in Center */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-sm text-muted-foreground uppercase tracking-wider">
                      {group.goldenWindow.date}
                    </span>
                    <span className="text-4xl font-bold mt-1">{group.goldenWindow.time.split(' ')[0]}</span>
                    <span className="text-xl font-light text-muted-foreground">{group.goldenWindow.time.split(' ')[1]}</span>
                  </div>
                </div>
              </div>

              {/* Duration */}
              <p className="text-muted-foreground mb-6">
                {group.goldenWindow.duration} • {group.goldenWindow.time} - {group.goldenWindow.endTime}
              </p>

              {/* Members */}
              <div className="flex items-center justify-center gap-3">
                <AvatarStack avatars={group.members} max={6} size="lg" showSyncStatus />
              </div>
              <p className="text-sm text-emerald-500 mt-3 flex items-center justify-center gap-1">
                <Check className="w-4 h-4" />
                All {group.memberCount} are free
              </p>
            </GlassCard>
          </div>

          {/* Stats Row */}
          <div className={cn(
            'flex justify-center gap-4 my-6 transition-all duration-700 delay-500',
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{group.goldenWindow.confidence}%</div>
              <div className="text-xs text-muted-foreground">Confidence</div>
            </div>
            <div className="w-px bg-border/50" />
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-500">{group.goldenWindow.fairness}%</div>
              <div className="text-xs text-muted-foreground">Fairness</div>
            </div>
            <div className="w-px bg-border/50" />
            <div className="text-center">
              <div className="text-2xl font-bold">{group.goldenWindow.avgTravelTime}min</div>
              <div className="text-xs text-muted-foreground">Avg Travel</div>
            </div>
          </div>

          {/* Recommended Venue */}
          <div className={cn(
            'transition-all duration-700 delay-700',
            showVenue ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
              Recommended Spot
            </p>
            
            <GlassCard hover className="p-4">
              <div className="flex gap-4">
                <img 
                  src={mockVenue.image} 
                  alt={mockVenue.name}
                  className="w-20 h-20 rounded-xl object-cover"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">{mockVenue.name}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">{mockVenue.type}</span>
                    {mockVenue.tags.map((tag) => (
                      <span key={tag} className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Car className="w-3 h-3" />
                      {mockVenue.avgTravelTime} min avg
                    </span>
                  </div>
                  <p className="text-sm mt-1">{mockVenue.priceRange}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground self-center" />
              </div>
            </GlassCard>

            {/* Why This Spot */}
            <div className="mt-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                Why we chose this
              </p>
              <div className="space-y-2">
                {mockVenue.reasons.map((reason, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Confirm Button */}
          <div className={cn(
            'mt-8 space-y-3 transition-all duration-700 delay-1000',
            showVenue ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}>
            <Button 
              onClick={onConfirm}
              className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl glow-gold-intense"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              Confirm & Book
            </Button>
            <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" />
              {"We'll hold the table for 15:00"}
            </p>
          </div>
        </main>
      </OrbitalBackground>
    </div>
  )
}
