'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY: Developer Test Panel
// ─────────────────────────────────────────────────────────────────────────────
// Lets developers test the full Golden Window + Planner pipeline using
// simulated multi-member scenarios without any Supabase interaction.
//
// To remove: delete this file and all references in nexus-app.tsx /
// groups-screen.tsx plus lib/dev/.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import { TopHeader } from './navigation'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Sparkles, RefreshCw, Save, AlertTriangle,
  ChevronDown, ChevronUp, Check, Beaker, Database, Globe,
} from 'lucide-react'
import { ActivityPlanCard } from './activity-plan-card'
import { DEV_SCENARIOS, type DevScenario } from '@/lib/dev/test-scenarios'
import { runDevGoldenWindow, runDevPlanner, type DevGwResult } from '@/lib/dev/dev-harness'
import type { GoldenWindow } from '@/lib/golden-window'
import type { PlannerResult } from '@/lib/planners/planner-engine'

// ── Plannable activities (all registered planners) ────────────────────────────

const PLANNER_ACTIVITIES = [
  { id: 'pub-crawl',    emoji: '🍺', label: 'Pub Crawl' },
  { id: 'cocktail-bar', emoji: '🍹', label: 'Cocktail Bar' },
  { id: 'restaurant',   emoji: '🍽️', label: 'Restaurant' },
  { id: 'brunch',       emoji: '🥞', label: 'Brunch' },
  { id: 'coffee',       emoji: '☕', label: 'Coffee' },
  { id: 'cinema',       emoji: '🎬', label: 'Cinema' },
  { id: 'bowling',      emoji: '🎳', label: 'Bowling' },
  { id: 'live-music',   emoji: '🎵', label: 'Live Music' },
  { id: 'board-games',  emoji: '🎲', label: 'Board Games' },
  { id: 'escape-room',  emoji: '🔐', label: 'Escape Room' },
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const p = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${p}`
}

function durationLabel(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

// ── Match quality config ──────────────────────────────────────────────────────

const QUALITY_CONFIG = {
  perfect:    { label: 'PERFECT MATCH', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  strong:     { label: 'STRONG MATCH',  cls: 'bg-primary/20 text-primary border-primary/30' },
  partial:    { label: 'PARTIAL MATCH', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  compromise: { label: 'BEST OPTION',   cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
} as const

// ── Data source badge ─────────────────────────────────────────────────────────

function DataSourceIndicator({ result }: { result: PlannerResult }) {
  const isReal = result.dataSource === 'real'
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-bold tracking-wider border',
      isReal
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    )}>
      {isReal ? <Globe className="w-2.5 h-2.5" /> : <Database className="w-2.5 h-2.5" />}
      {isReal ? 'REAL VENUES' : 'DEMO VENUES'}
      {result.providerName && (
        <span className="font-normal normal-case tracking-normal opacity-60">
          · {result.providerName}
        </span>
      )}
    </div>
  )
}

// ── GoldenWindow result card ──────────────────────────────────────────────────

function GwCard({
  window: gw,
  isSaved,
  isStale,
  onSave,
  onMarkStale,
  onRecalculate,
}: {
  window: GoldenWindow
  isSaved: boolean
  isStale: boolean
  onSave: () => void
  onMarkStale: () => void
  onRecalculate: () => void
}) {
  const q = QUALITY_CONFIG[gw.match_quality] ?? QUALITY_CONFIG.partial

  return (
    <GlassCard glow className="p-4 mb-3">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground">Golden Window Found</span>
          </div>
          <p className="text-base font-semibold text-foreground">
            {DAY_LABELS[gw.day_of_week]} · {fmt12(gw.start_time)} – {fmt12(gw.end_time)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {durationLabel(gw.duration_minutes)} · {gw.available_member_count}/{gw.total_member_count} members
          </p>
        </div>
        <span className={cn('text-[10px] font-bold tracking-wider px-2 py-1 rounded-full border flex-shrink-0', q.cls)}>
          {q.label}
        </span>
      </div>

      {/* Confidence + fairness */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: 'Confidence', value: gw.confidence_score },
          { label: 'Fairness',   value: gw.fairness_score },
        ].map(({ label, value }) => (
          <div key={label} className="bg-muted/20 rounded-lg px-2.5 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1 bg-muted/30 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${value}%` }} />
              </div>
              <span className="text-[11px] font-medium text-primary tabular-nums">{value}%</span>
            </div>
          </div>
        ))}
      </div>

      {gw.is_compromise && gw.compromise_note && (
        <p className="text-[11px] text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg px-2.5 py-2 mb-3 leading-relaxed">
          {gw.compromise_note}
        </p>
      )}

      {/* Stale banner */}
      {isStale && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2 mb-3">
          <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <p className="text-[11px] text-amber-400">
            Simulated: availability changed. Window may be stale.
          </p>
        </div>
      )}

      {/* Persistence simulation buttons */}
      <div className="flex gap-2 flex-wrap">
        {!isSaved && (
          <Button
            onClick={onSave}
            size="sm"
            className="h-7 text-[11px] rounded-lg bg-primary/20 hover:bg-primary/30 text-primary border-0"
          >
            <Save className="w-3 h-3 mr-1" />
            Simulate Save to DB
          </Button>
        )}
        {isSaved && !isStale && (
          <>
            <span className="flex items-center gap-1 text-[11px] text-emerald-400">
              <Check className="w-3 h-3" /> Saved
            </span>
            <Button
              onClick={onMarkStale}
              size="sm"
              variant="outline"
              className="h-7 text-[11px] rounded-lg border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            >
              <AlertTriangle className="w-3 h-3 mr-1" />
              Mark Stale
            </Button>
          </>
        )}
        {isStale && (
          <Button
            onClick={onRecalculate}
            size="sm"
            className="h-7 text-[11px] rounded-lg bg-primary/20 hover:bg-primary/30 text-primary border-0"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Recalculate
          </Button>
        )}
      </div>
    </GlassCard>
  )
}

// ── All-windows collapsible ───────────────────────────────────────────────────

function AllWindowsList({ windows }: { windows: GoldenWindow[] }) {
  const [expanded, setExpanded] = useState(false)
  if (windows.length <= 1) return null
  const shown = expanded ? windows : windows.slice(1, 4)

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-2"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? 'Hide' : `Show ${windows.length - 1} other window${windows.length - 1 === 1 ? '' : 's'}`}
      </button>

      {expanded && (
        <div className="space-y-1.5">
          {shown.map((gw, i) => {
            const q = QUALITY_CONFIG[gw.match_quality] ?? QUALITY_CONFIG.partial
            return (
              <div
                key={i}
                className="flex items-center justify-between gap-2 bg-muted/10 border border-border/20 rounded-lg px-3 py-2"
              >
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {DAY_LABELS[gw.day_of_week]} · {fmt12(gw.start_time)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {durationLabel(gw.duration_minutes)} · {gw.available_member_count}/{gw.total_member_count} members
                  </p>
                </div>
                <span className={cn('text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full border', q.cls)}>
                  {q.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Scenario card ─────────────────────────────────────────────────────────────

function ScenarioCard({
  scenario,
  selected,
  onClick,
}: {
  scenario: DevScenario
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 rounded-xl border transition-all duration-150',
        selected
          ? 'bg-primary/10 border-primary/40 text-foreground'
          : 'bg-muted/10 border-border/20 text-foreground hover:bg-muted/20 hover:border-border/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{scenario.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {scenario.description}
          </p>
        </div>
        {selected && (
          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/30 flex items-center justify-center mt-0.5">
            <Check className="w-2.5 h-2.5 text-primary" />
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1 mt-2">
        {scenario.members.map(m => (
          <span
            key={m.id}
            className="text-[10px] bg-muted/20 text-muted-foreground px-1.5 py-0.5 rounded-full"
          >
            {m.emoji} {m.name}
          </span>
        ))}
      </div>
    </button>
  )
}

// ── Activity picker ───────────────────────────────────────────────────────────

function ActivityPicker({
  selected,
  onChange,
}: {
  selected: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PLANNER_ACTIVITIES.map(a => (
        <button
          key={a.id}
          onClick={() => onChange(a.id)}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all',
            selected === a.id
              ? 'bg-primary/20 text-primary border-primary/40'
              : 'bg-muted/10 text-muted-foreground border-border/20 hover:bg-muted/20 hover:border-border/40',
          )}
        >
          {a.emoji} {a.label}
        </button>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface DevTestPanelProps {
  onBack: () => void
}

export function DevTestPanel({ onBack }: DevTestPanelProps) {
  const [selectedScenario, setSelectedScenario] = useState<DevScenario | null>(null)
  const [selectedActivity, setSelectedActivity] = useState<string>('pub-crawl')
  const [gwResult, setGwResult]     = useState<DevGwResult | null>(null)
  const [gwPhase, setGwPhase]       = useState<'idle' | 'done'>('idle')
  const [savedWindow, setSavedWindow] = useState<GoldenWindow | null>(null)
  const [isStale, setIsStale]         = useState(false)
  const [planResult, setPlanResult]   = useState<PlannerResult | null>(null)
  const [planPhase, setPlanPhase]     = useState<'idle' | 'planning' | 'done' | 'error'>('idle')
  const [planError, setPlanError]     = useState<string | null>(null)

  const clearPlan = useCallback(() => {
    setPlanResult(null)
    setPlanPhase('idle')
    setPlanError(null)
  }, [])

  const selectScenario = useCallback((scenario: DevScenario) => {
    setSelectedScenario(scenario)
    setGwResult(null)
    setGwPhase('idle')
    setSavedWindow(null)
    setIsStale(false)
    clearPlan()
  }, [clearPlan])

  const handleActivityChange = useCallback((id: string) => {
    setSelectedActivity(id)
    clearPlan()
  }, [clearPlan])

  const handleFindGoldenWindow = useCallback(() => {
    if (!selectedScenario) return
    const result = runDevGoldenWindow(selectedScenario)
    setGwResult(result)
    setGwPhase('done')
    clearPlan()
  }, [selectedScenario, clearPlan])

  const handleSaveWindow = useCallback(() => {
    if (!gwResult?.best) return
    setSavedWindow(gwResult.best)
    setIsStale(false)
  }, [gwResult])

  const handleMarkStale = useCallback(() => {
    setIsStale(true)
  }, [])

  const handleRecalculate = useCallback(() => {
    handleFindGoldenWindow()
    setIsStale(false)
    setSavedWindow(null)
  }, [handleFindGoldenWindow])

  const handlePlanActivity = useCallback(async () => {
    if (!selectedScenario || !gwResult?.best) return
    setPlanPhase('planning')
    setPlanError(null)
    const result = await runDevPlanner(selectedScenario, gwResult.best, selectedActivity)
    if (result.ok) {
      setPlanResult(result.result)
      setPlanPhase('done')
    } else {
      setPlanError(result.error)
      setPlanPhase('error')
    }
  }, [selectedScenario, gwResult, selectedActivity])

  const activeWindow = gwResult?.best ?? null
  const activeActivityDef = PLANNER_ACTIVITIES.find(a => a.id === selectedActivity)

  return (
    <div className="min-h-screen bg-background pb-8">
      <TopHeader
        title="Developer Test Mode"
        showBack
        onBack={onBack}
        showNotifications={false}
      />

      <main className="px-4 py-6 max-w-md mx-auto">

        {/* ── Dev warning banner ── */}
        <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3.5 py-3 mb-6">
          <Beaker className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-400">Development Mode</p>
            <p className="text-[11px] text-amber-400/80 mt-0.5 leading-relaxed">
              Not connected to Supabase. All computation runs in-memory against the real
              Golden Window engine and Planner Engine.
            </p>
          </div>
        </div>

        {/* ── Scenario picker ── */}
        <div className="mb-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Select a test scenario
          </p>
          <div className="space-y-2">
            {DEV_SCENARIOS.map(scenario => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                selected={selectedScenario?.id === scenario.id}
                onClick={() => selectScenario(scenario)}
              />
            ))}
          </div>
        </div>

        {/* ── Selected scenario detail ── */}
        {selectedScenario && (
          <>
            {/* Expected result hint */}
            <div className="bg-muted/10 border border-border/20 rounded-xl px-3.5 py-3 mb-5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Expected result
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {selectedScenario.expectedResult}
              </p>
            </div>

            {/* ── Golden Window section ── */}
            <div className="mb-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Golden Window
              </p>

              {gwPhase === 'idle' && (
                <GlassCard className="p-4 mb-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Find Golden Window</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                    Run the real Golden Window engine against the scenario availability data.
                    No Supabase calls — pure in-memory computation.
                  </p>
                  <Button
                    onClick={handleFindGoldenWindow}
                    className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl glow-gold"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Find Golden Window
                  </Button>
                </GlassCard>
              )}

              {gwPhase === 'done' && gwResult && (
                <>
                  {activeWindow ? (
                    <>
                      <GwCard
                        window={activeWindow}
                        isSaved={!!savedWindow}
                        isStale={isStale}
                        onSave={handleSaveWindow}
                        onMarkStale={handleMarkStale}
                        onRecalculate={handleRecalculate}
                      />
                      <AllWindowsList windows={gwResult.windows} />
                    </>
                  ) : (
                    <GlassCard className="p-4 mb-3">
                      <p className="text-sm font-medium text-foreground mb-1">No window found</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {gwResult.requirements.missingExplanation ??
                          'No shared availability found across scenario members.'}
                      </p>
                      <Button
                        onClick={handleFindGoldenWindow}
                        variant="outline"
                        className="mt-3 w-full h-8 text-xs rounded-xl"
                      >
                        <RefreshCw className="w-3 h-3 mr-1.5" />
                        Retry
                      </Button>
                    </GlassCard>
                  )}
                </>
              )}
            </div>

            {/* ── Activity Planner section ── */}
            {gwPhase === 'done' && activeWindow && (
              <div className="mb-5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Activity Planner
                </p>

                {/* Activity selector */}
                <div className="mb-3">
                  <p className="text-[10px] text-muted-foreground mb-2">Test any activity:</p>
                  <ActivityPicker
                    selected={selectedActivity}
                    onChange={handleActivityChange}
                  />
                </div>

                {planPhase === 'idle' && (
                  <GlassCard className="p-4">
                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                      Run the {activeActivityDef?.label ?? selectedActivity} planner using the
                      above Golden Window. Uses mock venue data — no external APIs called.
                    </p>
                    <Button
                      onClick={handlePlanActivity}
                      className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl glow-gold"
                    >
                      {activeActivityDef?.emoji ?? '✨'} Plan {activeActivityDef?.label ?? selectedActivity}
                    </Button>
                  </GlassCard>
                )}

                {planPhase === 'planning' && (
                  <GlassCard className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-sm animate-pulse">{activeActivityDef?.emoji ?? '✨'}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Planning…</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Discovering venues and scoring the best match
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                )}

                {planPhase === 'error' && planError && (
                  <GlassCard className="p-4">
                    <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-3 leading-relaxed">
                      {planError}
                    </p>
                    <Button
                      onClick={() => setPlanPhase('idle')}
                      variant="outline"
                      className="w-full h-8 text-xs rounded-xl"
                    >
                      Try again
                    </Button>
                  </GlassCard>
                )}

                {planPhase === 'done' && planResult && (
                  <div>
                    {/* Data source indicator above the card */}
                    <div className="mb-2">
                      <DataSourceIndicator result={planResult} />
                    </div>
                    <ActivityPlanCard
                      plan={planResult}
                      onRecalculate={() => {
                        setPlanPhase('idle')
                        setPlanResult(null)
                        setPlanError(null)
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Reset button ── */}
            <Button
              onClick={() => selectScenario(selectedScenario)}
              variant="outline"
              className="w-full h-9 text-xs rounded-xl text-muted-foreground border-border/30"
            >
              <RefreshCw className="w-3 h-3 mr-1.5" />
              Reset this scenario
            </Button>
          </>
        )}
      </main>
    </div>
  )
}
