'use client'

import { useEffect, useState } from 'react'
import { OrbitalBackground } from './golden-ring'
import { NexusLogoAnimated } from './nexus-logo'
import { cn } from '@/lib/utils'

/**
 * Phase 6B (adjustment pass) — full-screen cinematic searching overlay.
 *
 * Renders as a fixed full-viewport layer that temporarily hides the
 * underlying group detail UI while the "intelligence" sequence plays.
 *
 * Reuses existing primitives:
 *   - <OrbitalBackground>  drifting amber rings + ambient glow spots
 *   - <NexusLogoAnimated>  large floating golden ring with glow-pulse
 *   - .float / .animate-glow-pulse / .animate-weather-fade-in (globals)
 *
 * Pacing is intentionally unhurried — phrases breathe longer and the
 * orb softly intensifies as the sequence approaches the reveal. The
 * parent controls mount/unmount and passes `exiting` so we can fade
 * the whole layer out over ~600ms before yielding to the Golden Window
 * card underneath.
 *
 * prefers-reduced-motion is handled at the parent level — the overlay
 * is simply not rendered in that case.
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
  /** Total active duration in ms (before fade-out). Phrases spread across this span. */
  durationMs?: number
  /** When true, the layer fades to opacity 0 over ~600ms for a smooth handoff. */
  exiting?: boolean
}

export function GoldenWindowSearching({ durationMs = 3000, exiting = false }: Props) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    // Spread phrases evenly across the full active duration so the final
    // phrase ("Finding the Golden Window…") lands right before exit and
    // has time to be read.
    const interval = Math.max(380, Math.floor(durationMs / PHRASES.length))
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 1; i < PHRASES.length; i++) {
      timers.push(setTimeout(() => setStep(i), interval * i))
    }
    return () => timers.forEach(clearTimeout)
  }, [durationMs])

  // As the sequence progresses the orb glow intensifies — a subtle
  // anticipation cue without ever feeling sci-fi.
  const isFinalPhrase = step === PHRASES.length - 1

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 bg-background overflow-hidden',
        'transition-opacity duration-[600ms] ease-out',
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100',
        // First-mount fade-in — soft, not a hard cut.
        'animate-weather-fade-in',
      )}
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <OrbitalBackground className="min-h-screen w-full flex flex-col items-center justify-center px-6">
        {/* Deeper ambient glow layered behind the orb. Two soft spots that
            pulse on the same 6 s cadence as the float — keeps motion calm. */}
        <div
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none',
            'h-[640px] w-[640px] rounded-full blur-3xl',
            'bg-gradient-to-br from-amber-500/20 via-yellow-400/10 to-amber-600/15',
            'animate-glow-pulse',
            'transition-opacity duration-[1200ms] ease-out',
            isFinalPhrase ? 'opacity-100' : 'opacity-70',
          )}
        />

        {/* The orb itself — larger than before. Floats gently. */}
        <div
          className={cn(
            'float relative transition-transform duration-[1200ms] ease-out',
            isFinalPhrase ? 'scale-105' : 'scale-100',
          )}
        >
          <NexusLogoAnimated className="w-56 h-56 md:w-72 md:h-72" />
        </div>

        {/* Rotating phrase — one line, crossfades in place, slow & breathy. */}
        <div className="relative mt-12 h-6 w-full max-w-xs text-center">
          {PHRASES.map((text, i) => (
            <p
              key={i}
              className={cn(
                'absolute inset-0 text-sm md:text-base tracking-wide transition-all duration-700 ease-out',
                i === step
                  ? 'opacity-100 translate-y-0 text-foreground'
                  : 'opacity-0 translate-y-1.5 text-muted-foreground pointer-events-none',
              )}
            >
              {text}
            </p>
          ))}
        </div>
      </OrbitalBackground>
    </div>
  )
}
