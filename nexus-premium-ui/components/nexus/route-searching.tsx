'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Route Searching Screen
// ─────────────────────────────────────────────────────────────────────────────
// Premium full-screen loading overlay shown while the OSRM planner runs.
// Shared by all three route planners (walking, jogging, cycling/hiking).
//
// Design language:
//   Mirrors GoldenWindowSearching exactly — same OrbitalBackground, same
//   NexusLogoAnimated float, same fixed-inset-0 layer, same exit fade pattern.
//
// Lifecycle:
//   1. Mounts immediately when phase becomes 'searching'.
//   2. Stages advance on fixed timers that mirror the expected OSRM batching
//      cadence (~10 s typical success).
//   3. When revealing=true the stage list fades out and the "routes ready"
//      success card fades in.
//   4. After 1 600 ms of success display the overlay fades to opacity-0 over
//      600 ms, then calls onExitComplete — parent advances phase to 'results'.
//
// Long-running signals:
//   10 s → "Still searching. This location is taking longer than expected."
//   20 s → "We're still exploring routes near you."
//
// Loop notice:
//   When noLoopFound=true the reveal card shows a secondary amber notice.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { OrbitalBackground } from './golden-ring'
import { NexusLogoAnimated } from './nexus-logo'
import { cn } from '@/lib/utils'

// ── Stage definitions ─────────────────────────────────────────────────────────

const STAGES = [
  { id: 'location',   label: 'Getting your location'            },
  { id: 'roads',      label: 'Exploring nearby roads and paths' },
  { id: 'candidates', label: 'Generating candidate routes'      },
  { id: 'testing',    label: 'Testing route options'            },
  { id: 'ranking',    label: 'Ranking the best matches'         },
  { id: 'building',   label: 'Building your route'              },
] as const

// Absolute time (ms from mount) at which each stage activates.
// Spread across the expected 8–12 s OSRM batched search cadence so the
// progress always feels live rather than frozen on one step.
const STAGE_TIMINGS = [0, 1200, 3200, 5500, 7500, 9000] as const

// Ready message keyed by activityId
const ACTIVITY_GERUND: Record<string, string> = {
  jogging: 'running',
  walking: 'walking',
  cycling: 'cycling',
  hiking:  'hiking',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface RouteSearchingScreenProps {
  /** Activity identifier — determines the ready-message verb */
  activityId:     string
  /** Target distance shown in the footer */
  distanceKm:     number
  /**
   * Controlled by the parent: set to true when the planner returns results.
   * The component plays the success card for 1 600 ms then calls onExitComplete.
   */
  revealing:      boolean
  /**
   * When true and revealing, appends "No genuine loop was found. Showing the
   * best available alternatives." beneath the ready message.
   */
  noLoopFound:    boolean
  /** Called after the exit fade completes — parent should advance phase. */
  onExitComplete: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RouteSearchingScreen({
  activityId,
  distanceKm,
  revealing,
  noLoopFound,
  onExitComplete,
}: RouteSearchingScreenProps) {
  const [currentStage, setCurrentStage] = useState(0)
  const [timeoutMsg,   setTimeoutMsg]   = useState<'slow' | 'verySlow' | null>(null)
  const [exiting,      setExiting]      = useState(false)
  const exitFired = useRef(false)

  const activityLabel = ACTIVITY_GERUND[activityId] ?? activityId
  const isFinalStage  = currentStage >= STAGES.length - 1

  // ── Stage timer — freeze when revealing ──────────────────────────────────────
  useEffect(() => {
    if (revealing) return
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 1; i < STAGES.length; i++) {
      timers.push(setTimeout(() => setCurrentStage(i), STAGE_TIMINGS[i]!))
    }
    return () => timers.forEach(clearTimeout)
  }, [revealing])

  // ── Long-running signals ──────────────────────────────────────────────────────
  useEffect(() => {
    if (revealing) return
    const t1 = setTimeout(() => setTimeoutMsg('slow'),     10_000)
    const t2 = setTimeout(() => setTimeoutMsg('verySlow'), 20_000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [revealing])

  // ── Reveal → exit sequence ───────────────────────────────────────────────────
  // Display success card for 1 600 ms → begin 600 ms CSS fade → call onExitComplete.
  useEffect(() => {
    if (!revealing) return
    const t1 = setTimeout(() => setExiting(true), 1600)
    const t2 = setTimeout(() => {
      if (!exitFired.current) {
        exitFired.current = true
        onExitComplete()
      }
    }, 2200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [revealing, onExitComplete])

  return (
    <div
      className={cn(
        // Fixed overlay — same layer architecture as GoldenWindowSearching
        'fixed inset-0 z-50 bg-background overflow-hidden',
        'transition-opacity duration-[600ms] ease-out',
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100',
        // First-mount soft fade-in (0.6 s, matches GoldenWindowSearching)
        'animate-weather-fade-in',
      )}
      aria-busy={!revealing}
      aria-live="polite"
      role="status"
    >
      <OrbitalBackground className="min-h-screen w-full flex flex-col items-center justify-center px-8">

        {/* ── Ambient glow — intensifies as stages progress ── */}
        <div
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none',
            'h-[560px] w-[560px] rounded-full blur-3xl',
            'bg-gradient-to-br from-amber-500/20 via-yellow-400/10 to-amber-600/15',
            'animate-glow-pulse',
            'transition-opacity duration-[1200ms] ease-out',
            revealing || isFinalStage ? 'opacity-100' : 'opacity-60',
          )}
        />

        {/* ── Floating orb — scales gently on reveal ── */}
        <div
          className={cn(
            'float relative mb-10 transition-transform duration-[1200ms] ease-out',
            revealing      ? 'scale-110' :
            isFinalStage   ? 'scale-105' : 'scale-100',
          )}
        >
          <NexusLogoAnimated className="w-44 h-44 md:w-60 md:h-60" />
        </div>

        {/* ── Content: stages list ↔ reveal card ── */}
        <div className="relative w-full max-w-[272px]">

          {/* Stage list */}
          <ul
            className={cn(
              'space-y-3 transition-all duration-500 ease-out',
              revealing ? 'opacity-0 translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0',
            )}
            aria-label="Search progress"
          >
            {STAGES.map((stage, i) => {
              const done   = i < currentStage
              const active = i === currentStage
              const future = i > currentStage
              return (
                <li
                  key={stage.id}
                  className={cn(
                    'flex items-center gap-3 text-sm transition-all duration-500 ease-out',
                    done   && 'opacity-35 text-muted-foreground',
                    active && 'opacity-100 text-foreground font-medium',
                    future && 'opacity-0 translate-y-1.5 pointer-events-none',
                  )}
                >
                  {/* Stage indicator */}
                  <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                    {done ? (
                      // Completed: small gold check
                      <Check
                        className="w-3 h-3 text-primary/60"
                        strokeWidth={3}
                        aria-hidden
                      />
                    ) : active ? (
                      // Active: pulsing gold dot
                      <span
                        className="w-2 h-2 rounded-full bg-primary animate-pulse block"
                        aria-hidden
                      />
                    ) : (
                      // Future: dim placeholder dot
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-border/40 block"
                        aria-hidden
                      />
                    )}
                  </span>
                  {stage.label}
                </li>
              )
            })}
          </ul>

          {/* Long-running timeout notice */}
          {timeoutMsg && !revealing && (
            <p
              className={cn(
                'mt-5 text-xs text-amber-400/70 text-center leading-relaxed',
                'animate-fade-in-up',
              )}
            >
              {timeoutMsg === 'slow'
                ? 'Still searching. This location is taking longer than expected.'
                : 'We\u2019re still exploring routes near you.'}
            </p>
          )}

          {/* Reveal card — crossfades over the stage list */}
          <div
            className={cn(
              'absolute inset-0 flex flex-col items-center justify-center text-center',
              'transition-all duration-500 ease-out',
              revealing
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-3 pointer-events-none',
            )}
          >
            {/* Gold checkmark badge */}
            <div className="w-11 h-11 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center mb-4 glow-gold">
              <Check className="w-5 h-5 text-primary" strokeWidth={2.5} aria-hidden />
            </div>

            <p className="text-[15px] font-semibold text-foreground tracking-wide leading-snug">
              Your {activityLabel} routes are ready.
            </p>

            {noLoopFound && (
              <p className="mt-3 text-xs text-amber-400/75 leading-relaxed max-w-[210px]">
                No genuine loop was found. Showing the best available alternatives.
              </p>
            )}
          </div>
        </div>

        {/* Distance footer — hides during reveal */}
        <p
          className={cn(
            'absolute bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap',
            'text-xs text-muted-foreground/30 tracking-wider',
            'transition-opacity duration-500',
            revealing ? 'opacity-0' : 'opacity-100',
          )}
        >
          {distanceKm} km · Real routes via OpenStreetMap
        </p>

      </OrbitalBackground>
    </div>
  )
}
