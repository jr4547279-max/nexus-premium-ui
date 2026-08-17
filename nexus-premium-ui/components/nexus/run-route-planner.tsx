'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Run Route Planner
// ─────────────────────────────────────────────────────────────────────────────
// Self-contained component that drives the full jogging route planning flow:
//
//   1. Route Preferences (distance, type, surface, difficulty)
//   2. Real-time OSRM search (40 parallel queries via the jogging planner)
//   3. Multi-route results — up to 3 genuine candidates with SVG previews
//   4. Route selection → full waypoint detail + Start Run
//
// Honesty contract:
//   • Only routes that pass genuine geometry classification are labelled LOOP.
//   • When a loop is requested but none exists, a clear notice is shown.
//   • No mock routes. No relabelling. No fake data.
//
// Golden Window integration:
//   • Requires a Golden Window to determine when the route is planned.
//   • If absent, shows a prompt and disables the search button.
//
// GPS integration:
//   • "Start Run" builds a full PlannerResult via candidateToPlannerResult()
//     (no extra OSRM query) and passes it to onStartRun.
//   • The PlannerResult carries full routeGeometry for the run tracker.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useMemo } from 'react'
import {
  Sparkles, MapPin, RotateCcw, ArrowLeftRight, Minus,
  ChevronRight, Play, Search, AlertTriangle, Footprints,
  Timer, Mountain, Bike, TrendingUp, Package, Info,
  Gauge, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { GlassCard } from './glass-card'
import {
  runPlanner,
  type PlannerResult,
  type RouteCandidate,
  type RoutePreferences,
  type RouteTypePreference,
  type SurfacePreference,
  type DifficultyPreference,
  type GoldenWindowLike,
  DEFAULT_ROUTE_PREFERENCES,
} from '@/lib/planners/planner-engine'
import { buildRoutePlannerResult } from '@/lib/planners/route-utils'
import { getRouteConfigForActivity } from '@/lib/planners/providers/route-provider'
import { RouteSearchingScreen } from './route-searching'

// ── Activity configuration ────────────────────────────────────────────────────
// Keyed by activityId so a single component serves Jogging, Walking, and any
// future route activity without duplicating UI code.

interface RouteActivityCfg {
  label:        string    // "Run" | "Walk"
  gerund:       string    // "running" | "walking" — for explanatory copy
  verb:         string    // "run" | "walk" — for timing notice
  startLabel:   string    // "Start Run" | "Start Walk"
  distances:    number[]  // selectable preset distances in km
  paceMinPerKm: number    // activity pace for waypoint arrival labels
  paceLabel:    string    // displayed pace string
  emoji:        string    // route title emoji
}

const ROUTE_ACTIVITY_CFG: Record<string, RouteActivityCfg> = {
  jogging: {
    label:        'Run',
    gerund:       'running',
    verb:         'run',
    startLabel:   'Start Run',
    distances:    [2, 5, 10],
    paceMinPerKm: 6,
    paceLabel:    '6 min/km',
    emoji:        '🏃',
  },
  walking: {
    label:        'Walk',
    gerund:       'walking',
    verb:         'walk',
    startLabel:   'Start Walk',
    distances:    [1, 2, 5, 10],
    paceMinPerKm: 15,
    paceLabel:    '~15 min/km',
    emoji:        '🚶',
  },
  hiking: {
    label:        'Hike',
    gerund:       'hiking',
    verb:         'hike',
    startLabel:   'Start Hike',
    distances:    [5, 10, 15, 20],
    paceMinPerKm: 25,
    paceLabel:    '~25 min/km',
    emoji:        '🥾',
  },
  cycling: {
    label:        'Ride',
    gerund:       'cycling',
    verb:         'ride',
    startLabel:   'Start Ride',
    distances:    [10, 20, 30, 50],
    paceMinPerKm: 4,
    paceLabel:    '~15 km/h',
    emoji:        '🚴',
  },
}

function getActivityCfg(activityId: string): RouteActivityCfg {
  return ROUTE_ACTIVITY_CFG[activityId] ?? ROUTE_ACTIVITY_CFG['jogging']!
}

/**
 * Returns sensible default RoutePreferences for each activity,
 * derived from the activity's RouteConfig so they match the planner defaults.
 *
 * This ensures the UI starts with the right distance (e.g. 12 km for hiking,
 * 20 km for cycling) rather than the generic 5 km global default.
 */
function defaultPrefsForActivity(activityId: string): RoutePreferences {
  const config = getRouteConfigForActivity(activityId)
  const surfaceDefault: SurfacePreference =
    activityId === 'hiking'  ? 'paths' :
    activityId === 'cycling' ? 'roads' :
    'mixed'
  return {
    distanceKm:          config?.defaultDistanceKm          ?? DEFAULT_ROUTE_PREFERENCES.distanceKm,
    routeTypePreference: config?.defaultPreferLoop ? 'loop' : 'any',
    surfacePreference:   surfaceDefault,
    difficulty:          'any',
  }
}

// ── Hiking: recommended equipment based on difficulty ────────────────────────

function hikingEquipment(difficulty: DifficultyPreference, surface: SurfacePreference): string[] {
  const base = ['Hiking boots', 'Water bottle', 'Snacks', 'Weather layer']
  if (difficulty === 'moderate' || difficulty === 'challenging') {
    base.push('Trekking poles', 'First-aid kit')
  }
  if (difficulty === 'challenging') {
    base.push('Navigation app', 'Emergency shelter')
  }
  if (surface === 'paths') {
    base.push('Gaiters')
  }
  return base
}

// ── Cycling: terrain label based on surface ───────────────────────────────────

function cyclingTerrainLabel(surface: SurfacePreference): { label: string; detail: string } {
  switch (surface) {
    case 'roads':
      return { label: 'Road', detail: 'Smooth tarmac, ideal for road bikes' }
    case 'paths':
      return { label: 'Off-road', detail: 'Gravel & trails, suited for MTB or gravel bikes' }
    default:
      return { label: 'Mixed', detail: 'Combination of roads and paths, versatile terrain' }
  }
}

// ── Cycling: average speed from pace ─────────────────────────────────────────

function cyclingSpeedKmh(paceMinPerKm: number): number {
  return Math.round(60 / paceMinPerKm)
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunRoutePlannerProps {
  groupId: string
  activityId: string
  goldenWindow: GoldenWindowLike | null
  /**
   * Pre-computed shared availability window for route activities.
   * Derived from computeGoldenWindows() with compromise windows excluded —
   * so this is always a real intersection (perfect / strong / partial) or null.
   * Null means either no availability data exists yet, or there is no true
   * shared slot (see timingError for the user-facing explanation).
   */
  sharedWindow?: GoldenWindowLike | null
  /**
   * Honest message to show when sharedWindow is null.
   * e.g. "No shared time found — …" for scheduling conflicts,
   *      "Add your availability …" when no data exists yet.
   */
  timingError?: string | null
  planningLocation: { lat: number; lng: number; radiusMetres?: number } | null
  locationName?: string
  onStartRun?: (plan: PlannerResult) => void
  isSolo: boolean
}

type Phase = 'prefs' | 'searching' | 'results' | 'error'

// ── SVG Route Preview ─────────────────────────────────────────────────────────

function RouteSvgPreview({
  geometry,
  active = false,
}: {
  geometry?: Array<[number, number]>
  active?: boolean
}) {
  if (!geometry || geometry.length < 2) {
    return (
      <div className="w-full h-full flex items-center justify-center opacity-20">
        <MapPin className="w-5 h-5" />
      </div>
    )
  }

  // Sample down to ~120 points for SVG performance
  const step    = Math.max(1, Math.floor(geometry.length / 120))
  const sampled = geometry.filter((_, i) => i % step === 0 || i === geometry.length - 1)

  const lngs = sampled.map(c => c[0]!)
  const lats  = sampled.map(c => c[1]!)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const minLat  = Math.min(...lats), maxLat  = Math.max(...lats)

  const pad  = 10
  const span = Math.max(maxLng - minLng, maxLat - minLat, 0.0001)
  const w    = 100 - 2 * pad

  const project = ([lng, lat]: [number, number]): [number, number] => [
    pad + ((lng - minLng) / span) * w,
    pad + ((maxLat - lat)  / span) * w,   // Y flip
  ]

  const pts    = sampled.map(c => project(c).map(n => n.toFixed(1)).join(',')).join(' ')
  const [sx, sy] = project(sampled[0]!)
  const [ex, ey] = project(sampled[sampled.length - 1]!)
  const isLoop   = Math.abs(sx - ex) < 6 && Math.abs(sy - ey) < 6

  const stroke = active ? '#d4af37' : 'currentColor'
  const opacity = active ? 1 : 0.7

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />
      <circle cx={sx.toFixed(1)} cy={sy.toFixed(1)} r="4.5" fill={stroke} opacity={opacity} />
      {!isLoop && (
        <circle cx={ex.toFixed(1)} cy={ey.toFixed(1)} r="3" fill={stroke} opacity={opacity * 0.7} />
      )}
    </svg>
  )
}

// ── Pill selector component ───────────────────────────────────────────────────

function PillGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
              value === opt.value
                ? 'bg-primary/15 text-primary border-primary/50 shadow-sm'
                : 'bg-muted/20 text-muted-foreground border-border/30 hover:border-border/60 hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Route type icon + badge ───────────────────────────────────────────────────

function RouteTypeBadge({ routeType }: { routeType: 'loop' | 'out_and_back' | 'linear' }) {
  const map = {
    loop:         { label: 'Loop',       Icon: RotateCcw,      className: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
    out_and_back: { label: 'Out & Back', Icon: ArrowLeftRight,  className: 'text-amber-400  bg-amber-400/10  border-amber-400/20'  },
    linear:       { label: 'Linear',     Icon: Minus,           className: 'text-muted-foreground bg-muted/20 border-border/30'    },
  }
  const { label, Icon, className } = map[routeType]
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border', className)}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  )
}

// ── Route result card ─────────────────────────────────────────────────────────

function RouteResultCard({
  candidate,
  index,
  isSelected,
  onSelect,
}: {
  candidate: RouteCandidate
  index: number
  isSelected: boolean
  onSelect: () => void
}) {
  const distLabel = candidate.totalDistanceKm.toFixed(1)
  const timeLabel = `~${candidate.estimatedMinutes} min`

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-2xl border transition-all overflow-hidden',
        isSelected
          ? 'border-primary/60 bg-primary/5 shadow-md shadow-primary/10'
          : 'border-border/30 bg-muted/10 hover:border-border/50 hover:bg-muted/20',
      )}
    >
      <div className="flex items-stretch gap-0">
        {/* SVG preview column */}
        <div className={cn(
          'w-20 h-20 flex-shrink-0 p-2 transition-colors',
          isSelected ? 'text-primary' : 'text-muted-foreground',
        )}>
          <RouteSvgPreview geometry={candidate.geometry} active={isSelected} />
        </div>

        {/* Route info */}
        <div className="flex-1 py-3 pr-3 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p className={cn(
              'text-sm font-semibold leading-tight truncate',
              isSelected ? 'text-foreground' : 'text-foreground/80',
            )}>
              {candidate.name}
            </p>
            {candidate.qualityLabel && (
              <span className={cn(
                'flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium',
                isSelected
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted/40 text-muted-foreground',
              )}>
                {candidate.qualityLabel}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">
              {distLabel} km · {timeLabel}
            </span>
            <RouteTypeBadge routeType={candidate.routeType} />
          </div>

          {candidate.surfaceSummary && (
            <p className="text-xs text-muted-foreground mt-1 truncate opacity-70">
              {candidate.surfaceSummary}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Waypoint timeline (compact) ───────────────────────────────────────────────

function WaypointTimeline({ candidate }: { candidate: RouteCandidate }) {
  const { waypoints } = candidate
  if (!waypoints.length) return null

  return (
    <div className="space-y-0">
      {waypoints.map((wp, i) => {
        const isFirst = i === 0
        const isLast  = i === waypoints.length - 1
        const Icon    =
          wp.waypointType === 'start' ? Footprints :
          wp.waypointType === 'end'   ? Footprints :
          wp.waypointType === 'poi'   ? RotateCcw  :
          ChevronRight
        const distLabel = `${wp.distanceFromStart.toFixed(1)} km`

        return (
          <div key={wp.id} className="flex items-stretch gap-3">
            {/* Timeline line */}
            <div className="flex flex-col items-center w-5 flex-shrink-0">
              <div className={cn(
                'w-2 h-2 rounded-full mt-2 flex-shrink-0 z-10',
                isFirst || isLast ? 'bg-primary' : 'bg-border',
              )} />
              {!isLast && (
                <div className="w-px flex-1 bg-border/40 mt-0.5" />
              )}
            </div>

            {/* Content */}
            <div className={cn(
              'flex-1 pb-3',
              isLast ? '' : 'border-b border-border/0',
            )}>
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn(
                  'text-sm leading-tight',
                  isFirst || isLast ? 'font-semibold text-foreground' : 'text-foreground/80',
                )}>
                  {wp.name}
                </p>
                <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                  {distLabel}
                </span>
              </div>
              {wp.description && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {wp.description}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function RunRoutePlanner({
  groupId,
  activityId,
  goldenWindow,
  sharedWindow,
  timingError,
  planningLocation,
  locationName,
  onStartRun,
  isSolo,
}: RunRoutePlannerProps) {
  const cfg = getActivityCfg(activityId)

  // Initialise from activity-specific defaults so the first search reflects
  // the activity's configured distance / surface / route-type preference.
  // The initialiser function runs once on mount; activityId is captured from
  // the closure at that point (the component is always mounted for one activity).
  const [phase, setPhase]   = useState<Phase>('prefs')
  const [prefs, setPrefs]   = useState<RoutePreferences>(() => defaultPrefsForActivity(activityId))
  const [candidates, setCandidates] = useState<RouteCandidate[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [error, setError]   = useState<string | null>(null)
  const [customDist, setCustomDist] = useState(() =>
    String(defaultPrefsForActivity(activityId).distanceKm),
  )
  const [showCustom, setShowCustom] = useState(false)

  /**
   * Reveal state — set when the planner returns results successfully.
   * While non-null, the RouteSearchingScreen plays its reveal animation.
   * The parent advances phase to 'results' only after onExitComplete fires.
   */
  const [revealState, setRevealState] = useState<{ noLoopFound: boolean } | null>(null)

  // Simple in-session cache: key → RouteCandidate[]
  const cacheRef = useRef(new Map<string, RouteCandidate[]>())

  /**
   * Pending candidates — stored here while the reveal animation plays so
   * setCandidates() fires only after the overlay fades out (avoiding a
   * flash of results beneath the still-visible overlay).
   */
  const pendingCandidatesRef = useRef<RouteCandidate[]>([])

  /**
   * Monotonically increasing counter — incremented at the start of every
   * search. Each async execution captures its own generation value and
   * checks it before writing state. If the user triggers a second search
   * while the first is still in-flight, the first search's completion handler
   * sees a stale generation and discards its result rather than overwriting
   * the newer search's state.
   */
  const searchGenRef = useRef(0)

  const cacheKey = planningLocation
    ? `${planningLocation.lat.toFixed(4)},${planningLocation.lng.toFixed(4)},${prefs.distanceKm},${prefs.routeTypePreference},${prefs.surfacePreference}`
    : null

  // ── Effective timing window ─────────────────────────────────────────────────
  // Prefer the explicit Golden Window (group/social run), then the pre-computed
  // shared availability window (real intersection only, no compromise).
  const effectiveWindow: GoldenWindowLike | null = goldenWindow ?? sharedWindow ?? null

  // ── Solo fallback window ────────────────────────────────────────────────────
  // Solo users do not need to add availability before finding routes — they can
  // start immediately. When neither a saved Golden Window nor a shared
  // availability window exists, synthesize a "starting now" window so the
  // planner has timing data for result labels (start time, finish time).
  // This window is never shown in the UI; it is only passed to the planner.
  const resolvedWindow = useMemo<GoldenWindowLike | null>(() => {
    if (effectiveWindow) return effectiveWindow   // real window always wins
    if (!isSolo) return null                      // multi-member must have real timing
    // Solo user with no real window — synthesize "now + 2 h"
    const now = new Date()
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      day_of_week:            now.getDay(),
      start_time:             `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      end_time:               `${pad(end.getHours())}:${pad(end.getMinutes())}`,
      duration_minutes:       120,
      match_quality:          'perfect',
      confidence_score:       1,
      available_member_count: 1,
      total_member_count:     1,
    }
  }, [effectiveWindow, isSolo])

  const handleFindRoutes = useCallback(async () => {
    if (!resolvedWindow || !planningLocation) return

    // Claim this search's generation slot. Any in-flight search with an older
    // generation will see a mismatch and silently discard its result.
    const myGen = ++searchGenRef.current

    // [NEXUS DEBUG] Remove once investigation is complete
    const uiStart = performance.now()
    console.log(`[NEXUS:UI] search #${myGen} start — activity=${activityId} dist=${prefs.distanceKm}km`)

    setPhase('searching')
    setError(null)
    setSelectedIdx(0)
    setRevealState(null)   // clear any stale reveal from a previous search

    try {
      // Check cache first
      if (cacheKey && cacheRef.current.has(cacheKey)) {
        if (searchGenRef.current !== myGen) return   // superseded
        setCandidates(cacheRef.current.get(cacheKey)!)
        setPhase('results')
        console.log(`[NEXUS:UI] search #${myGen} served from cache (${Math.round(performance.now() - uiStart)}ms)`)
        return
      }

      const engineResult = await runPlanner({
        groupId,
        activityId,
        goldenWindow: resolvedWindow ?? undefined,
        groupLocation: planningLocation,
        locationName,
        routePreferences: prefs,
      })

      // Discard result if a newer search has already started
      if (searchGenRef.current !== myGen) {
        console.log(`[NEXUS:UI] search #${myGen} discarded (superseded by #${searchGenRef.current})`)
        return
      }

      if (!engineResult.ok) {
        console.warn(`[NEXUS:UI] search #${myGen} error after ${Math.round(performance.now() - uiStart)}ms:`, engineResult.error)
        setError(engineResult.error)
        setPhase('error')
        return
      }

      const planResult    = engineResult.result
      const allCandidates = planResult.allCandidates ?? []

      if (allCandidates.length === 0) {
        setError(
          `No ${cfg.gerund} routes could be found near this location. ` +
          'Try a different planning location or a different distance.',
        )
        setPhase('error')
        return
      }

      console.log(`[NEXUS:UI] search #${myGen} ✓ ${allCandidates.length} candidates (${Math.round(performance.now() - uiStart)}ms)`)
      if (cacheKey) cacheRef.current.set(cacheKey, allCandidates)

      // Store candidates for after the reveal animation completes.
      // Phase stays 'searching' — RouteSearchingScreen.onExitComplete advances it.
      pendingCandidatesRef.current = allCandidates
      const hasLoop    = allCandidates.some(c => c.isLoop)
      const noLoopFound = prefs.routeTypePreference === 'loop' && !hasLoop
      setRevealState({ noLoopFound })
    } catch (err) {
      // Guard against any unexpected rejection leaving the UI in a permanent
      // loading state. planner-engine wraps its own errors, so this branch
      // should only fire if React itself throws during a state update.
      if (searchGenRef.current !== myGen) return
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      console.error(`[NEXUS:UI] search #${myGen} unexpected error after ${Math.round(performance.now() - uiStart)}ms:`, err)
      setError(message)
      setPhase('error')
    }
  }, [resolvedWindow, planningLocation, prefs, groupId, activityId, locationName, cacheKey, cfg.gerund])

  const handleSelectRoute = useCallback((idx: number) => {
    setSelectedIdx(idx)
  }, [])

  const handleStartRun = useCallback(() => {
    const candidate = candidates[selectedIdx]
    if (!candidate || !resolvedWindow || !onStartRun) return
    const plan = buildRoutePlannerResult(
      candidate,
      { goldenWindow: resolvedWindow, locationName },
      prefs,
      { activityId, paceMinPerKm: cfg.paceMinPerKm, emoji: cfg.emoji, activityVerb: cfg.gerund },
    )
    onStartRun(plan)
  }, [candidates, selectedIdx, resolvedWindow, locationName, prefs, onStartRun, cfg, activityId])

  const handleBackToPrefs = useCallback(() => {
    setPhase('prefs')
    setCandidates([])
    setSelectedIdx(0)
  }, [])

  // ── Distance preference helper ──────────────────────────────────────────────

  const setDistance = (km: number | 'custom') => {
    if (km === 'custom') {
      setShowCustom(true)
      const parsed = parseFloat(customDist)
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 30) {
        setPrefs(p => ({ ...p, distanceKm: parsed }))
      }
    } else {
      setShowCustom(false)
      setPrefs(p => ({ ...p, distanceKm: km }))
    }
  }

  const selectedCandidate = candidates[selectedIdx] ?? null

  // ── Missing requirements messaging ─────────────────────────────────────────
  // Solo users: only a planning location is required. Timing is optional —
  // they get a synthesised "now" window via resolvedWindow above.
  // Multi-member: a real shared timing window is also required.
  const missingLocation = !planningLocation
  const missingTiming   = !isSolo && !resolvedWindow
  const canSearch       = !missingLocation && !missingTiming

  // ── Honest failure: loop requested but none found ──────────────────────────

  const requestedLoop  = prefs.routeTypePreference === 'loop'
  const loopsFound     = candidates.some(c => c.routeType === 'loop')
  const showLoopNotice = phase === 'results' && requestedLoop && !loopsFound

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mb-6">
      {/* ── PHASE: PREFS ────────────────────────────────────────────────── */}
      {phase === 'prefs' && (
        <GlassCard className="p-5">
          {/* Header */}
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Find a {cfg.label}</p>
              <p className="text-xs text-muted-foreground">
                {goldenWindow
                  ? (isSolo
                      ? `Nexus will find real routes timed to your Golden Window.`
                      : `Nexus will find real routes timed to your group's Golden Window.`)
                  : `Nexus will find real ${cfg.gerund} routes near your planning location.`}
              </p>
            </div>
          </div>

          {/* Distance */}
          <div className="mb-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
              Distance
            </p>
            <div className="flex flex-wrap gap-2">
              {cfg.distances.map(km => (
                <button
                  key={km}
                  type="button"
                  onClick={() => setDistance(km)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
                    !showCustom && prefs.distanceKm === km
                      ? 'bg-primary/15 text-primary border-primary/50 shadow-sm'
                      : 'bg-muted/20 text-muted-foreground border-border/30 hover:border-border/60 hover:text-foreground',
                  )}
                >
                  {km} km
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDistance('custom')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
                  showCustom
                    ? 'bg-primary/15 text-primary border-primary/50 shadow-sm'
                    : 'bg-muted/20 text-muted-foreground border-border/30 hover:border-border/60 hover:text-foreground',
                )}
              >
                Custom
              </button>
            </div>

            {showCustom && (
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={30}
                  step={0.5}
                  value={prefs.distanceKm}
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    setCustomDist(String(v))
                    setPrefs(p => ({ ...p, distanceKm: v }))
                  }}
                  className="flex-1 accent-primary"
                />
                <span className="text-sm font-mono text-primary w-14 text-right">
                  {prefs.distanceKm.toFixed(1)} km
                </span>
              </div>
            )}
          </div>

          {/* Route type */}
          <PillGroup<RouteTypePreference>
            label="Route type"
            options={[
              { value: 'loop',         label: '⭕ Loop'       },
              { value: 'out_and_back', label: '↔ Out & Back' },
              { value: 'any',          label: '✓ Either'      },
            ]}
            value={prefs.routeTypePreference}
            onChange={v => setPrefs(p => ({ ...p, routeTypePreference: v }))}
          />

          {/* Surface */}
          <PillGroup<SurfacePreference>
            label="Surface"
            options={[
              { value: 'paths', label: '🌿 Paths / trails' },
              { value: 'mixed', label: '⚖ Mixed'           },
              { value: 'roads', label: '🛣 Roads'           },
            ]}
            value={prefs.surfacePreference}
            onChange={v => setPrefs(p => ({ ...p, surfacePreference: v }))}
          />

          {/* Difficulty */}
          <PillGroup<DifficultyPreference>
            label="Difficulty"
            options={[
              { value: 'easy',        label: 'Easy'       },
              { value: 'moderate',    label: 'Moderate'   },
              { value: 'challenging', label: 'Challenging'},
              { value: 'any',         label: 'Any'        },
            ]}
            value={prefs.difficulty}
            onChange={v => setPrefs(p => ({ ...p, difficulty: v }))}
          />

          {/* ── HIKING: Equipment recommendations ──────────────────────────── */}
          {activityId === 'hiking' && (
            <div className="mb-5 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
              <div className="flex items-center gap-1.5 mb-2">
                <Package className="w-3.5 h-3.5 text-emerald-400" />
                <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                  Recommended Equipment
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {hikingEquipment(prefs.difficulty, prefs.surfacePreference).map(item => (
                  <span
                    key={item}
                    className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300/80 border border-emerald-500/20"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── CYCLING: Terrain info ──────────────────────────────────────── */}
          {activityId === 'cycling' && (() => {
            const terrain = cyclingTerrainLabel(prefs.surfacePreference)
            return (
              <div className="mb-5 p-3 rounded-xl bg-lime-500/5 border border-lime-500/15">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Bike className="w-3.5 h-3.5 text-lime-400" />
                  <p className="text-xs font-semibold text-lime-400 uppercase tracking-widest">
                    Terrain · {terrain.label}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {terrain.detail}
                </p>
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-lime-500/10">
                  <Gauge className="w-3 h-3 text-lime-400/70" />
                  <p className="text-xs text-muted-foreground/80">
                    Average speed: <span className="text-lime-300/80 font-medium">~{cyclingSpeedKmh(cfg.paceMinPerKm)} km/h</span>
                  </p>
                </div>
              </div>
            )
          })()}

          {/* ── WALKING: Pace & destination info ──────────────────────────── */}
          {activityId === 'walking' && (
            <div className="mb-5 p-3 rounded-xl bg-teal-500/5 border border-teal-500/15">
              <div className="flex items-center gap-2">
                <Footprints className="w-3.5 h-3.5 text-teal-400" />
                <p className="text-xs text-teal-300/80">
                  Estimated at a comfortable <span className="font-medium">~{cfg.paceLabel}</span> walking pace
                </p>
              </div>
            </div>
          )}

          {/* Requirement notices */}
          {missingTiming && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-3 leading-relaxed">
              {timingError ?? `Add your availability so Nexus knows when you want to ${cfg.verb}.`}
            </p>
          )}
          {missingLocation && (
            <p className="text-xs text-muted-foreground bg-muted/20 border border-border/30 rounded-xl px-3 py-2 mb-3 leading-relaxed">
              <MapPin className="w-3 h-3 inline mr-1 opacity-60" />
              Set a planning location above so Nexus knows where to search.
            </p>
          )}

          {/* Find Routes CTA */}
          <Button
            onClick={handleFindRoutes}
            disabled={!canSearch}
            className={cn(
              'w-full h-11 rounded-xl',
              canSearch
                ? 'bg-primary hover:bg-primary/90 text-primary-foreground glow-gold'
                : 'opacity-40 cursor-not-allowed',
            )}
          >
            <Search className="w-4 h-4 mr-2" />
            Find Routes
          </Button>

          {/* Honesty footer */}
          <p className="text-xs text-muted-foreground/50 text-center mt-3">
            Real routes via OSRM · OpenStreetMap
          </p>
        </GlassCard>
      )}

      {/* ── PHASE: SEARCHING ────────────────────────────────────────────── */}
      {phase === 'searching' && (
        // key=searchGenRef.current remounts the overlay on each new search,
        // resetting all internal timers and stage state cleanly.
        <RouteSearchingScreen
          key={searchGenRef.current}
          activityId={activityId}
          distanceKm={prefs.distanceKm}
          revealing={revealState !== null}
          noLoopFound={revealState?.noLoopFound ?? false}
          onExitComplete={() => {
            setCandidates(pendingCandidatesRef.current)
            setPhase('results')
            setRevealState(null)
          }}
        />
      )}

      {/* ── PHASE: ERROR ────────────────────────────────────────────────── */}
      {phase === 'error' && (
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-semibold text-foreground">Route search failed</p>
          </div>
          <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-4 leading-relaxed">
            {error ?? 'No routes could be found near this location.'}
          </p>
          <div className="flex gap-2">
            <Button
              onClick={handleBackToPrefs}
              variant="outline"
              className="flex-1 h-9 rounded-xl text-xs"
            >
              Try different preferences
            </Button>
          </div>
        </GlassCard>
      )}

      {/* ── PHASE: RESULTS ──────────────────────────────────────────────── */}
      {phase === 'results' && candidates.length > 0 && (
        <div className="space-y-3">
          {/* Results header */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {candidates.length === 1
                    ? '1 Route Found'
                    : `${candidates.length} Routes Found`}
                </span>
              </div>
              <button
                type="button"
                onClick={handleBackToPrefs}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <Search className="w-3 h-3" />
                Change preferences
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {prefs.distanceKm} km · {
                prefs.routeTypePreference === 'any' ? 'any type' :
                prefs.routeTypePreference === 'loop' ? 'loop preferred' :
                'out & back preferred'
              }
              {' · '}
              <span className="text-emerald-400/80">REAL ROUTE · OSRM · OpenStreetMap</span>
            </p>

            {/* Resolved location — shows exactly where routes are being generated.
                Critical for ambiguous place names (e.g. "Willingdon" exists in both
                East Sussex, UK and Alberta, Canada). Coordinates let the user verify
                before starting a run. */}
            {planningLocation && (
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/20">
                <MapPin className="w-3 h-3 text-muted-foreground/70 flex-shrink-0" />
                <span className="text-xs text-muted-foreground/80 leading-tight">
                  Routes near{' '}
                  <span className="text-foreground/70 font-medium">
                    {locationName ?? 'your location'}
                  </span>
                  <span className="text-muted-foreground/50 font-mono ml-1.5 text-[10px]">
                    {planningLocation.lat.toFixed(4)}°,{' '}
                    {planningLocation.lng.toFixed(4)}°
                  </span>
                </span>
              </div>
            )}
          </GlassCard>

          {/* Honest loop-not-found notice */}
          {showLoopNotice && (
            <div className="px-1">
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-400 mb-1">
                      No genuine loop found near this location
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Nexus searched all viable routes and found no routes that pass loop
                      geometry criteria (low retracing, enclosed circuit shape). The road
                      network here likely has natural barriers. Showing the best available
                      alternatives below.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Route cards */}
          <div className="space-y-2">
            {candidates.map((candidate, i) => (
              <RouteResultCard
                key={candidate.id}
                candidate={candidate}
                index={i}
                isSelected={i === selectedIdx}
                onSelect={() => handleSelectRoute(i)}
              />
            ))}
          </div>

          {/* Selected route detail */}
          {selectedCandidate && (
            <GlassCard className="p-5">
              {/* Selected route name + type */}
              <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                  <p className="text-sm font-bold text-foreground mb-1">
                    {selectedCandidate.name}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <RouteTypeBadge routeType={selectedCandidate.routeType} />
                    <span className="text-xs text-muted-foreground font-mono">
                      {selectedCandidate.totalDistanceKm.toFixed(1)} km ·{' '}
                      ~{selectedCandidate.estimatedMinutes} min
                    </span>
                    {selectedCandidate.qualityLabel && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                        {selectedCandidate.qualityLabel}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                  <Timer className="w-3 h-3 inline mr-1" />
                  {cfg.paceLabel}
                </div>
              </div>

              {/* Waypoints */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  Route
                </p>
                <WaypointTimeline candidate={selectedCandidate} />
              </div>

              {/* Surface info */}
              {selectedCandidate.surfaceSummary && (
                <p className="text-xs text-muted-foreground bg-muted/15 rounded-xl px-3 py-2 mb-4">
                  🗺 {selectedCandidate.surfaceSummary}
                </p>
              )}

              {/* ── HIKING: Grade, group size, equipment, trail info ──────── */}
              {activityId === 'hiking' && (
                <div className="mb-4 space-y-3">
                  {/* Stats row — grade is distance-based; no elevation source available */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/15 p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Mountain className="w-3 h-3 text-emerald-400" />
                      </div>
                      <p className="text-xs text-muted-foreground">Grade</p>
                      <p className="text-sm font-semibold text-emerald-300/80 capitalize">
                        {selectedCandidate.grade ?? 'Easy'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted/10 border border-border/20 p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Users className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground">Group</p>
                      <p className="text-sm font-semibold text-foreground/80">
                        {isSolo ? 'Solo' : 'Group'}
                      </p>
                    </div>
                  </div>
                  {/* Grade is estimated from route distance — honest disclosure */}
                  <p className="text-xs text-muted-foreground/60 leading-relaxed px-0.5">
                    Grade estimated from route length via OSRM · OpenStreetMap.
                    Actual elevation data is not available from this routing provider.
                  </p>

                  {/* Equipment */}
                  <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Package className="w-3 h-3 text-emerald-400" />
                      <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                        Bring Along
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {hikingEquipment(prefs.difficulty, prefs.surfacePreference).map(item => (
                        <span
                          key={item}
                          className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300/80 border border-emerald-500/20"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Trail info */}
                  <div className="rounded-xl bg-muted/10 border border-border/20 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Info className="w-3 h-3 text-muted-foreground" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        Trail Info
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {selectedCandidate.routeType === 'loop'
                        ? 'Circular trail — returns to start. Check trail conditions and weather before setting off.'
                        : 'Linear trail — plan your return transport or retrace your steps. Notify someone of your route.'}
                    </p>
                  </div>
                </div>
              )}

              {/* ── CYCLING: Speed, terrain, group ────────────────────────── */}
              {activityId === 'cycling' && (
                <div className="mb-4 space-y-3">
                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-lime-500/8 border border-lime-500/15 p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Gauge className="w-3 h-3 text-lime-400" />
                      </div>
                      <p className="text-xs text-muted-foreground">Avg Speed</p>
                      <p className="text-sm font-semibold text-lime-300/80">
                        ~{cyclingSpeedKmh(cfg.paceMinPerKm)} km/h
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted/10 border border-border/20 p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Bike className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground">Terrain</p>
                      <p className="text-sm font-semibold text-foreground/80">
                        {cyclingTerrainLabel(prefs.surfacePreference).label}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted/10 border border-border/20 p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Users className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground">Ride</p>
                      <p className="text-sm font-semibold text-foreground/80">
                        {isSolo ? 'Solo' : 'Group'}
                      </p>
                    </div>
                  </div>

                  {/* Terrain detail */}
                  <div className="rounded-xl bg-lime-500/5 border border-lime-500/15 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Info className="w-3 h-3 text-lime-400/70" />
                      <p className="text-xs font-semibold text-lime-400/80 uppercase tracking-widest">
                        Route Type
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {cyclingTerrainLabel(prefs.surfacePreference).detail}.{' '}
                      {selectedCandidate.routeType === 'loop'
                        ? 'Circular ride — no need for return transport.'
                        : 'Out-and-back ride — retrace your route or arrange a return.'}
                    </p>
                  </div>
                </div>
              )}

              {/* ── WALKING: Start + destination info ─────────────────────── */}
              {activityId === 'walking' && selectedCandidate.routeType === 'linear' && (
                <div className="mb-4 rounded-xl bg-teal-500/5 border border-teal-500/15 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <MapPin className="w-3 h-3 text-teal-400" />
                    <p className="text-xs font-semibold text-teal-400 uppercase tracking-widest">
                      Point-to-Point Walk
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This linear walk has a distinct start and destination. Arrange return transport
                    or retrace your steps.
                  </p>
                </div>
              )}

              {/* Retrace disclosure for out-and-back */}
              {selectedCandidate.routeType === 'out_and_back' && (
                <p className="text-xs text-muted-foreground/70 mb-4">
                  This out-and-back route retraces{' '}
                  {Math.round(selectedCandidate.retraceRatio * 100)}% of its path on the
                  return leg. This is normal for areas with limited path networks.
                </p>
              )}

              {/* Loop quality for loops */}
              {selectedCandidate.routeType === 'loop' && (
                <p className="text-xs text-emerald-400/70 mb-4">
                  ✓ Genuine loop confirmed — low retracing ({Math.round(selectedCandidate.retraceRatio * 100)}%),
                  circuit quality {Math.round(selectedCandidate.loopQuality * 100)}%.
                </p>
              )}

              {/* Start activity */}
              {onStartRun && (
                <Button
                  onClick={handleStartRun}
                  className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground glow-gold font-semibold"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {cfg.startLabel}
                </Button>
              )}

              {/* Provider badge */}
              <p className="text-xs text-muted-foreground/40 text-center mt-3">
                Real route · OSRM · OpenStreetMap · {selectedCandidate.providerName}
              </p>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  )
}
