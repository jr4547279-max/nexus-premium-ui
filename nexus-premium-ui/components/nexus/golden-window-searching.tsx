'use client'

import { useEffect, useState } from 'react'
import { GlassCard } from './glass-card'
import { OrbitalBackground } from './golden-ring'
import { NexusLogoAnimated } from './nexus-logo'
import { cn } from '@/lib/utils'

/**
 * Phase 6B — cinematic searching overlay.
 *
 * Renders inside the group detail layout where the Golden Window card will
 * eventually appear. Drives a short atmospheric loading sequence that
 * rotates through the six "intelligence" phrases before the real card
 * fades in.
 *
 * Reuses existing primitives so we don't duplicate the aesthetic:
 *   - <OrbitalBackground>     — drifting amber rings + ambient glow
 *   - <NexusLogoAnimated>     — floating golden ring with pulse + spin
 *   - .float / .animate-glow-pulse from globals.css
 *
 * Honors prefers-reduced-motion at the parent level — the parent simply
 * skips this overlay when motion is reduced.
 */

const PHRASES = [
  'Scanning availability…',
  'Balancing the group…',
  "Checking tonight's forecast…",
  'Calculating travel fairness…',
  'Aligning schedules…',
  'Finding the Golden Window…',
]

interface Props {
  /** Approx total duration in ms. Phrases rotate evenly across this span. */
  durationMs?: number
}

export function GoldenWindowSearching({ durationMs = 2200 }: Props) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    // Step through every phrase except the final one, which lingers until
    // the parent unmounts us. Spread across roughly 80 % of duration so
    // "Finding the Golden Window…" has time to land before the reveal.
    const interval = Math.max(280, Math.floor((durationMs * 0.8) / PHRASES.length))
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 1; i < PHRASES.length; i++) {
      timers.push(setTimeout(() => setStep(i), interval * i))
    }
    return () => timers.forEach(clearTimeout)
  }, [durationMs])

  return (
    <GlassCard
      glow
      className="relative mb-6 overflow-hidden p-0"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Atmospheric backdrop — contained inside the card, never full-screen */}
      <div className="relative h-[280px] w-full">
        <OrbitalBackground className="absolute inset-0 flex flex-col items-center justify-center">
          {/* Floating Nexus ring */}
          <div className="float">
            <NexusLogoAnimated className="w-32 h-32 md:w-36 md:h-36" />
          </div>

          {/* Rotating phrase — single line that crossfades in place */}
          <div className="relative mt-6 h-5 w-full text-center">
            {PHRASES.map((text, i) => (
              <p
                key={i}
                className={cn(
                  'absolute inset-0 text-sm transition-all duration-500',
                  i === step
                    ? 'opacity-100 translate-y-0 text-foreground'
                    : 'opacity-0 translate-y-1 text-muted-foreground pointer-events-none',
                )}
              >
                {text}
              </p>
            ))}
          </div>
        </OrbitalBackground>
      </div>
    </GlassCard>
  )
}
