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

        <main className="px-4 py-4 max-w-md mx-auto">
          {/* Title */}
          <div className={cn(
            'text-center mb-5 transition-all duration-1000',
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}>
            <h1 className="text-xl font-medium flex items-center justify-center gap-1.5">
              Golden Window Found <Sparkles className="w-4 h-4 text-primary" />
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Everyone is free and within 20 min drive.
            </p>
          </div>

          {/* Main Golden Window Card */}
          <div className={cn(
            'transition-all duration-1000 delay-300',
            revealed ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          )}>
            <GlassCard glow className="p-4 text-center relative overflow-hidden">
              {/* Best Match Badge */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-primary/20 text-primary text-[10px] font-medium rounded-full">
                BEST MATCH
              </div>

              {/* Golden Ring Visual */}
              <div className="flex justify-center my-6">
                <div className="relative">
                  <GoldenRing size="lg" intensity="intense" showInnerRing />
                  
                  {/* Time Display in Center */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {group.goldenWindow.date}
                    </span>
                    <span className="text-2xl font-bold">{group.goldenWindow.time.split(' ')[0]}</span>
                    <span className="text-sm font-light text-muted-foreground">{group.goldenWindow.time.split(' ')[1]}</span>
                  </div>
                </div>
              </div>

              {/* Duration */}
              <p className="text-muted-foreground text-xs mb-4">
                {group.goldenWindow.duration} window
              </p>

              {/* Members */}
              <div className="flex items-center justify-center gap-2">
                <AvatarStack avatars={group.members} max={6} size="md" showSyncStatus />
              </div>
              <p className="text-xs text-emerald-500 mt-2 flex items-center justify-center gap-1">
                <Check className="w-3 h-3" />
                All {group.memberCount} are free
              </p>
            </GlassCard>
          </div>

          {/* Stats Row */}
          <div className={cn(
            'flex justify-center gap-5 my-4 transition-all duration-700 delay-500',
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}>
            <div className="text-center">
              <div className="text-lg font-bold text-primary">{group.goldenWindow.confidence}%</div>
              <div className="text-[10px] text-muted-foreground">Confidence</div>
            </div>
            <div className="w-px bg-border/50" />
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-500">{group.goldenWindow.fairness}%</div>
              <div className="text-[10px] text-muted-foreground">Fairness</div>
            </div>
            <div className="w-px bg-border/50" />
            <div className="text-center">
              <div className="text-lg font-bold">{group.goldenWindow.avgTravelTime}min</div>
              <div className="text-[10px] text-muted-foreground">Avg Travel</div>
            </div>
          </div>

          {/* Recommended Venue */}
          <div className={cn(
            'transition-all duration-700 delay-700',
            showVenue ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
              Recommended Spot
            </p>
            
            <GlassCard hover className="p-3">
              <div className="flex gap-3">
                <img 
                  src={mockVenue.image} 
                  alt={mockVenue.name}
                  className="w-16 h-16 rounded-lg object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm">{mockVenue.name}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">{mockVenue.type}</span>
                    {mockVenue.tags.slice(0, 1).map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Car className="w-3 h-3" />
                      {mockVenue.avgTravelTime} min
                    </span>
                    <span>{mockVenue.priceRange}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground self-center shrink-0" />
              </div>
            </GlassCard>

            {/* Why This Spot */}
            <div className="mt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                Why we chose this
              </p>
              <div className="space-y-1.5">
                {mockVenue.reasons.slice(0, 3).map((reason, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    <Check className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Confirm Button */}
          <div className={cn(
            'mt-5 space-y-2 transition-all duration-700 delay-1000',
            showVenue ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}>
            <Button 
              onClick={onConfirm}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl glow-gold-intense text-sm"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              Confirm & Book
            </Button>
            <p className="text-center text-[10px] text-muted-foreground flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" />
              {"We'll hold the table for 15:00"}
            </p>
          </div>
        </main>
      </OrbitalBackground>
    </div>
  )
}
