'use client'

import { useState, useEffect } from 'react'
import { NexusLogoAnimated } from './nexus-logo'
import { TopHeader } from './navigation'
import { GlassCard, AvatarStack } from './glass-card'
import { GoldenRing, OrbitalBackground } from './golden-ring'
import { Button } from '@/components/ui/button'
import { Sparkles, Check, Clock, Car, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockGroups, mockVenue } from '@/lib/mock-data'

interface GoldenWindowRevealProps {
  groupId?: string
  onBack: () => void
  onConfirm: () => void
}

const FALLBACK_GOLDEN_WINDOW = {
  date: 'This Saturday',
  time: '7:00 PM',
  duration: '3 hours',
  endTime: '10:00 PM',
  confidence: 91,
  fairness: 95,
  avgTravelTime: 20,
}

const SEARCH_STEPS = [
  'Checking everyone\'s calendars…',
  'Analysing your preferences…',
  'Finding the perfect spot…',
  'Golden Window found ✨',
]

// ─── Searching / loading phase ────────────────────────────────────────────────
function SearchingScreen({ onBack, step }: { onBack: () => void; step: number }) {
  return (
    <div className="min-h-screen bg-background">
      <OrbitalBackground className="min-h-screen flex flex-col">
        <TopHeader title="" showBack onBack={onBack} showNotifications={false} />

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-10">
          {/* Floating animated Nexus ring — the "beautiful animation" */}
          <div className="float">
            <NexusLogoAnimated className="w-52 h-52" />
          </div>

          {/* Status steps — fade each in as search progresses */}
          <div className="space-y-2 min-h-[80px]">
            {SEARCH_STEPS.map((text, i) => (
              <p
                key={i}
                className={cn(
                  'text-sm transition-all duration-500',
                  i <= step
                    ? i === step
                      ? 'opacity-100 text-foreground translate-y-0'
                      : 'opacity-40 text-muted-foreground translate-y-0'
                    : 'opacity-0 translate-y-2 pointer-events-none'
                )}
              >
                {text}
              </p>
            ))}
          </div>
        </div>
      </OrbitalBackground>
    </div>
  )
}

// ─── Results phase ────────────────────────────────────────────────────────────
function ResultsScreen({
  group,
  goldenWindow,
  onBack,
  onConfirm,
  revealed,
  showVenue,
}: {
  group: (typeof mockGroups)[0]
  goldenWindow: typeof FALLBACK_GOLDEN_WINDOW
  onBack: () => void
  onConfirm: () => void
  revealed: boolean
  showVenue: boolean
}) {
  const timeParts = goldenWindow.time.split(' ')
  const timeMain = timeParts[0]
  const timeSuffix = timeParts[1] ?? ''

  return (
    <div className="min-h-screen bg-background">
      <OrbitalBackground className="min-h-screen">
        <TopHeader title="" showBack onBack={onBack} showNotifications={false} />

        <main className="px-4 py-4 max-w-md mx-auto pb-8">

          {/* Title */}
          <div className={cn(
            'text-center mb-5 transition-all duration-700',
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 rounded-full mb-3">
              <Sparkles className="w-3 h-3 text-primary" />
              <span className="text-xs text-primary font-medium">Golden Window Found</span>
            </div>
            <h1 className="text-xl font-semibold">{group.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Everyone is free and within {goldenWindow.avgTravelTime} min.
            </p>
          </div>

          {/* Main card */}
          <div className={cn(
            'transition-all duration-700 delay-200',
            revealed ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          )}>
            <GlassCard glow className="p-4 text-center relative overflow-hidden">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-primary/20 text-primary text-[10px] font-semibold rounded-full tracking-wide">
                BEST MATCH
              </div>

              {/* Golden Ring + time */}
              <div className="flex justify-center my-6">
                <div className="relative">
                  <GoldenRing size="lg" intensity="intense" showInnerRing />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-widest mb-0.5">
                      {goldenWindow.date}
                    </span>
                    <span className="text-2xl font-bold leading-none">{timeMain}</span>
                    <span className="text-sm font-light text-muted-foreground mt-0.5">{timeSuffix}</span>
                  </div>
                </div>
              </div>

              {/* Duration */}
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-4">
                <Clock className="w-3 h-3" />
                <span>{goldenWindow.duration} window · ends {goldenWindow.endTime}</span>
              </div>

              {/* Attendees */}
              <div className="flex items-center justify-center gap-2">
                <AvatarStack avatars={group.members} max={6} size="md" showSyncStatus />
              </div>
              <p className="text-xs text-emerald-500 mt-2 flex items-center justify-center gap-1">
                <Check className="w-3 h-3" />
                All {group.memberCount} members are free
              </p>
            </GlassCard>
          </div>

          {/* Stats row */}
          <div className={cn(
            'flex justify-center gap-5 my-4 transition-all duration-700 delay-300',
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}>
            <div className="text-center">
              <div className="text-lg font-bold text-primary">{goldenWindow.confidence}%</div>
              <div className="text-[10px] text-muted-foreground">Confidence</div>
            </div>
            <div className="w-px bg-border/50" />
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-500">{goldenWindow.fairness}%</div>
              <div className="text-[10px] text-muted-foreground">Fairness</div>
            </div>
            <div className="w-px bg-border/50" />
            <div className="text-center">
              <div className="text-lg font-bold">{goldenWindow.avgTravelTime}min</div>
              <div className="text-[10px] text-muted-foreground">Avg Travel</div>
            </div>
          </div>

          {/* Venue + CTA */}
          <div className={cn(
            'space-y-4 transition-all duration-700 delay-500',
            showVenue ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                Recommended Spot
              </p>
              <GlassCard hover className="p-3">
                <div className="flex gap-3">
                  <img
                    src={mockVenue.image}
                    alt={mockVenue.name}
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSI4IiBmaWxsPSIjMUYyOTM3Ii8+PHBhdGggZD0iTTI0IDI0aDMuNXYxNkgyNHptOC41IDBIMzZ2MTZoLTMuNXoiIGZpbGw9IiM0QjU1NjMiLz48L3N2Zz4='
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-medium text-sm">{mockVenue.name}</h3>
                      <span className="text-[10px] text-amber-400">★ {mockVenue.rating}</span>
                    </div>
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
                        {mockVenue.avgTravelTime} min avg
                      </span>
                      <span>{mockVenue.priceRange}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground self-center shrink-0" />
                </div>
              </GlassCard>
            </div>

            {/* Why this spot */}
            <div>
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

            {/* CTA */}
            <div className="space-y-2 pt-1">
              <Button
                onClick={onConfirm}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl glow-gold-intense text-sm font-medium"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                Confirm &amp; Book
              </Button>
              <p className="text-center text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" />
                {"We'll hold the table for 15 minutes"}
              </p>
            </div>
          </div>

        </main>
      </OrbitalBackground>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function GoldenWindowReveal({ groupId = '1', onBack, onConfirm }: GoldenWindowRevealProps) {
  const group = mockGroups.find(g => g.id === groupId) ?? mockGroups[0]
  const goldenWindow = group.goldenWindow ?? FALLBACK_GOLDEN_WINDOW

  // Searching phase state
  const [isSearching, setIsSearching] = useState(true)
  const [step, setStep] = useState(0)

  // Results phase state
  const [revealed, setRevealed] = useState(false)
  const [showVenue, setShowVenue] = useState(false)

  useEffect(() => {
    const timers = [
      // Step through status messages
      setTimeout(() => setStep(1), 750),
      setTimeout(() => setStep(2), 1500),
      setTimeout(() => setStep(3), 2200),
      // Transition out of searching at 2.8 s
      setTimeout(() => setIsSearching(false), 2800),
      // Stagger the results reveal
      setTimeout(() => setRevealed(true), 3200),
      setTimeout(() => setShowVenue(true), 4000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  if (isSearching) {
    return <SearchingScreen onBack={onBack} step={step} />
  }

  return (
    <ResultsScreen
      group={group}
      goldenWindow={goldenWindow}
      onBack={onBack}
      onConfirm={onConfirm}
      revealed={revealed}
      showVenue={showVenue}
    />
  )
}
