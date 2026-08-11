'use client'

import { useEffect, useRef, useState } from 'react'
import { TopHeader } from './navigation'
import { GlassCard, AvatarStack, StatBadge } from './glass-card'
import { GoldenRing } from './golden-ring'
import { Button } from '@/components/ui/button'
import {
  Calendar, MapPin, ChevronRight, Sparkles,
  Clock, Check, AlertCircle, Plus, Settings, RefreshCw, Beer,
  Trash2, LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { mockGroups } from '@/lib/mock-data'
import {
  getGroup,
  listGroupMembers,
  extractPlanningLocation,
  deleteGroup,
  leaveGroup,
  type Group,
  type GroupMember,
} from '@/lib/group-service'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import type { PlanningLocation } from '@/lib/types/planning-location'
import { GroupLocationSection } from './group-location-section'
import { getActivityById } from '@/lib/activities/registry'
import { ActivityBadge } from './activity-picker'
import { InviteMemberModal } from './invite-member-modal'
import { AvailabilityEditor } from './availability-editor'
import { useAuth } from '@/lib/auth-context'
import { getGroupAvailability, type GroupAvailabilityRow } from '@/lib/availability-service'
import {
  computeGoldenWindows,
  checkGoldenWindowRequirements,
  formatTime12h,
  formatDuration,
  dayLabel,
  type GoldenWindow,
  type MatchQuality,
} from '@/lib/golden-window'
import {
  loadSavedGoldenWindow,
  saveGoldenWindow,
} from '@/lib/golden-window-persistence'
import { VenueRecommendations } from './venue-recommendations'
import { WeatherChip } from './weather-chip'
import { fetchWeather, type Weather } from '@/lib/weather-service'
import { GoldenWindowSearching } from './golden-window-searching'
import { ActivityPlanCard } from './activity-plan-card'
import {
  runPlanner,
  hasPlannerFor,
  getPlannerFor,
  type PlannerResult,
} from '@/lib/planners/planner-engine'

interface GroupDetailProps {
  groupId: string
  onBack: () => void
  onViewGoldenWindow: () => void
  onNavigate?: (screen: string) => void
  /** Called after the group is successfully deleted. Use to bump groupsVersion
   *  in the parent so the groups list refreshes, then navigate back. */
  onGroupDeleted?: () => void
}

/**
 * Detect a UUID — real groups created via Supabase have UUID ids, mock groups
 * use short numeric ids like "1", "2". Anything that isn't a UUID is treated
 * as a mock id for the legacy demo data.
 */
function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

function avatarFor(member: GroupMember) {
  const seed = member.display_name || member.email || member.user_id
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}`
}

function displayNameFor(member: GroupMember) {
  return member.display_name || member.email?.split('@')[0] || 'Member'
}

// ─── Quality badge helpers ────────────────────────────────────────────────────

const QUALITY_LABELS: Record<MatchQuality, string> = {
  perfect:    'PERFECT MATCH',
  strong:     'STRONG MATCH',
  partial:    'PARTIAL MATCH',
  compromise: 'BEST OPTION',
}

const QUALITY_CLASSES: Record<MatchQuality, string> = {
  perfect:    'bg-emerald-500/20 text-emerald-400',
  strong:     'bg-primary/20 text-primary',
  partial:    'bg-amber-500/20 text-amber-400',
  compromise: 'bg-orange-500/20 text-orange-400',
}

const QUALITY_HEADER: Record<MatchQuality, string> = {
  perfect:    'Golden Window ✨',
  strong:     'Golden Window ✨',
  partial:    'Best Available Time',
  compromise: 'Best Available Option',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GroupDetail({ groupId, onBack, onViewGoldenWindow, onNavigate, onGroupDeleted }: GroupDetailProps) {
  const realMode = isUuid(groupId)
  const mockGroup = mockGroups.find((g) => g.id === groupId) || mockGroups[0]

  const { user } = useAuth()
  const [activeSection, setActiveSection] = useState<'members' | 'availability' | 'preferences'>('members')
  const [inviteOpen, setInviteOpen] = useState(false)

  // ── Real-group data ──────────────────────────────────────────────────────
  const [realGroup, setRealGroup]     = useState<Group | null>(null)
  const [realMembers, setRealMembers] = useState<GroupMember[]>([])
  const [loading, setLoading]         = useState(realMode)
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false)

  // ── Planning location (group-level, separate from profile location) ───────
  const [planningLocation, setPlanningLocation] = useState<PlanningLocation | null>(null)

  // Raw availability rows — kept in state so we can compute on demand.
  const [allAvailability, setAllAvailability] = useState<GroupAvailabilityRow[]>([])

  // ── Persisted Golden Window (from DB) ────────────────────────────────────
  const [savedWindow, setSavedWindow]               = useState<GoldenWindow | null>(null)
  const [savedWindowStale, setSavedWindowStale]     = useState(false)
  const [savedWindowComputedAt, setSavedWindowComputedAt] = useState<string | null>(null)

  // activeWindow = what is displayed. Set from DB on load, or freshly computed.
  const [activeWindow, setActiveWindow] = useState<GoldenWindow | null>(null)

  // ── Weather ──────────────────────────────────────────────────────────────
  const [weather, setWeather]           = useState<Weather | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // ── Reveal state machine ─────────────────────────────────────────────────
  //
  // States:
  //   'idle'      → CTA shown; nothing revealed yet.
  //   'searching' → cinematic overlay playing.
  //   'closing'   → overlay fading out; GW card scaling in below.
  //   'revealed'  → GW card visible. Entered immediately if a saved window was
  //                 loaded from DB, or after the cinematic completes.
  //
  // revealMode:
  //   'cinematic' → scale/fade animation classes applied (first discovery).
  //   'instant'   → no animation (DB-loaded window or reduced-motion).
  const [revealPhase, setRevealPhase] = useState<
    'idle' | 'searching' | 'closing' | 'revealed'
  >('idle')
  const [revealMode, setRevealMode] = useState<'cinematic' | 'instant'>('cinematic')

  // Venues gate — only reveals after explicit user tap.
  const [venuesRevealed, setVenuesRevealed] = useState(false)
  const venuesRef = useRef<HTMLDivElement | null>(null)

  // ── Planner ───────────────────────────────────────────────────────────────
  const [activePlan, setActivePlan]   = useState<PlannerResult | null>(null)
  const [planPhase, setPlanPhase]     = useState<'idle' | 'planning' | 'done' | 'error'>('idle')
  const [planError, setPlanError]     = useState<string | null>(null)

  // ── Delete / Leave dialog state ──────────────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteLoading,    setDeleteLoading]    = useState(false)
  const [leaveDialogOpen,  setLeaveDialogOpen]  = useState(false)
  const [leaveLoading,     setLeaveLoading]     = useState(false)

  // Timer refs — cleared only in the [groupId] cleanup effect so Strict Mode
  // mount→cleanup→mount cycles don't strand the sequence.
  const revealTimersRef = useRef<{
    close?: ReturnType<typeof setTimeout>
    reveal?: ReturnType<typeof setTimeout>
  }>({})

  // ── Data loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!realMode) return
    let cancelled = false
    setLoading(true)
    setAvailabilityLoaded(false)
    setActiveWindow(null)
    setSavedWindow(null)
    setSavedWindowStale(false)
    setSavedWindowComputedAt(null)

    Promise.all([
      getGroup(groupId),
      listGroupMembers(groupId),
      getGroupAvailability(groupId),
      loadSavedGoldenWindow(groupId),
    ]).then(([g, m, avail, saved]) => {
      if (cancelled) return
      setRealGroup(g)
      setPlanningLocation(g ? extractPlanningLocation(g) : null)
      setRealMembers(m)
      setAllAvailability(avail)
      setSavedWindow(saved.window)
      setSavedWindowStale(saved.isStale)
      setSavedWindowComputedAt(saved.computedAt)
      if (saved.window) {
        setActiveWindow(saved.window)
      }
      setAvailabilityLoaded(true)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [groupId, realMode])

  // ── Auto-reveal when DB window is loaded ─────────────────────────────────
  //
  // If a saved window was loaded from the database, skip the cinematic and
  // show the card immediately. Session-storage also bypasses the cinematic for
  // windows computed in this session that the user has already seen.
  useEffect(() => {
    if (!realMode || !availabilityLoaded || !activeWindow) return
    if (revealPhase === 'searching' || revealPhase === 'closing') return

    // DB-loaded window → always instant reveal (no cinematic needed).
    if (savedWindow) {
      setRevealMode('instant')
      setRevealPhase('revealed')
      return
    }

    // Session-flag → instant reveal for already-seen windows.
    const storageKey = `nexus:revealed:${groupId}`
    let alreadyRevealed = false
    try {
      alreadyRevealed =
        typeof window !== 'undefined' &&
        window.sessionStorage.getItem(storageKey) === '1'
    } catch {
      // non-fatal
    }
    if (alreadyRevealed) {
      setRevealMode('instant')
      setRevealPhase('revealed')
    }
  }, [realMode, availabilityLoaded, activeWindow, savedWindow, groupId, revealPhase])

  // ── Group-switch cleanup ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (revealTimersRef.current.close)  clearTimeout(revealTimersRef.current.close)
      if (revealTimersRef.current.reveal) clearTimeout(revealTimersRef.current.reveal)
      revealTimersRef.current = {}
      setRevealPhase('idle')
      setRevealMode('cinematic')
      setVenuesRevealed(false)
    }
  }, [groupId])

  // ── Find / Recalculate Golden Window ─────────────────────────────────────
  //
  // Computes windows synchronously (pure TS, fast), then fires a DB save in
  // the background while the 3-second cinematic overlay plays. By the time the
  // overlay ends the save is already done.

  const handleStartSearch = () => {
    if (revealPhase === 'searching' || revealPhase === 'closing') return

    // Reset venues if recalculating.
    setVenuesRevealed(false)

    // Compute immediately — synchronous, no network.
    const windows = computeGoldenWindows(
      realMembers.map((m) => ({ id: m.user_id, name: m.display_name })),
      allAvailability.map((r) => ({
        user_id:     r.user_id,
        day_of_week: r.day_of_week,
        start_time:  r.start_time,
        end_time:    r.end_time,
      })),
    )
    const best = windows[0] ?? null
    setActiveWindow(best)

    // Fire-and-forget save to DB in the background.
    if (best) {
      saveGoldenWindow(groupId, best).then((ok) => {
        if (ok) {
          setSavedWindow(best)
          setSavedWindowStale(false)
          setSavedWindowComputedAt(new Date().toISOString())
        }
      })
    }

    const storageKey = `nexus:revealed:${groupId}`
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (prefersReducedMotion) {
      setRevealMode('instant')
      setRevealPhase('revealed')
      try { window.sessionStorage.setItem(storageKey, '1') } catch { /* */ }
      return
    }

    setRevealMode('cinematic')
    setRevealPhase('searching')

    revealTimersRef.current.close = setTimeout(() => {
      setRevealPhase('closing')
      try { window.sessionStorage.setItem(storageKey, '1') } catch { /* */ }
    }, 3000)
    revealTimersRef.current.reveal = setTimeout(
      () => setRevealPhase('revealed'),
      3600,
    )
  }

  // ── Reveal venues ─────────────────────────────────────────────────────────

  const handleRevealVenues = () => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (!venuesRevealed) setVenuesRevealed(true)

    const doScroll = () => {
      venuesRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      })
    }
    if (typeof window === 'undefined' || prefersReducedMotion) {
      requestAnimationFrame(doScroll)
    } else {
      requestAnimationFrame(() => requestAnimationFrame(doScroll))
    }
  }

  // ── Planner handler ───────────────────────────────────────────────────────

  const handlePlanActivity = async () => {
    if (!rawActivityId) return
    setPlanPhase('planning')
    setPlanError(null)
    setActivePlan(null)

    const result = await runPlanner({
      groupId,
      activityId: rawActivityId,
      goldenWindow: activeWindow
        ? {
            day_of_week:           activeWindow.day_of_week,
            start_time:            activeWindow.start_time,
            end_time:              activeWindow.end_time,
            duration_minutes:      activeWindow.duration_minutes,
            match_quality:         activeWindow.match_quality,
            confidence_score:      activeWindow.confidence_score,
            available_member_count: activeWindow.available_member_count,
            total_member_count:    activeWindow.total_member_count,
          }
        : undefined,
      groupLocation: planningLocation
        ? {
            lat:          planningLocation.lat,
            lng:          planningLocation.lng,
            radiusMetres: planningLocation.planningRadiusMetres,
          }
        : undefined,
      locationName:     planningLocation?.planningCity || planningLocation?.name || undefined,
      budgetPreference: 'medium',
      desiredStops:     4,
    })

    if (result.ok) {
      setActivePlan(result.result)
      setPlanPhase('done')
    } else {
      setPlanError(result.error)
      setPlanPhase('error')
    }
  }

  // ── Weather fetch for the active window ───────────────────────────────────

  useEffect(() => {
    if (!realMode || !activeWindow) {
      setWeather(null)
      setWeatherLoading(false)
      return
    }
    let cancelled = false
    setWeatherLoading(true)
    fetchWeather({
      // Use the group's real planning location when available.
      // When absent, pass undefined — the server will omit weather rather
      // than silently returning Eastbourne conditions.
      lat:       planningLocation?.lat,
      lng:       planningLocation?.lng,
      dayOfWeek: activeWindow.day_of_week,
      startTime: activeWindow.start_time,
    }).then((w) => {
      if (cancelled) return
      setWeather(w)
      setWeatherLoading(false)
    })
    return () => { cancelled = true }
  }, [realMode, activeWindow?.day_of_week, activeWindow?.start_time, planningLocation?.lat, planningLocation?.lng])

  // ── Ownership / membership flags (real groups only) ──────────────────────

  /**
   * True when the signed-in user has role='owner' in this group.
   * Determined from the realMembers list already fetched.
   */
  const isOwner = realMode && !!user?.id &&
    realMembers.some((m) => m.user_id === user.id && m.role === 'owner')

  /**
   * True when the signed-in user is a non-owner member (can leave but not delete).
   */
  const canLeave = realMode && !!user?.id && !isOwner &&
    realMembers.some((m) => m.user_id === user.id)

  // ── Delete group handler ──────────────────────────────────────────────────

  const handleDeleteGroup = async () => {
    setDeleteLoading(true)
    const result = await deleteGroup(groupId)
    setDeleteLoading(false)

    if (result.ok) {
      setDeleteDialogOpen(false)
      toast.success(`"${name}" has been deleted.`)
      // Notify parent to bump groupsVersion (refreshes group lists) then navigate away.
      if (onGroupDeleted) {
        onGroupDeleted()
      } else {
        onBack()
      }
    } else {
      // Keep dialog closed; surface error as a toast. Group remains intact.
      setDeleteDialogOpen(false)
      toast.error(
        result.errorMessage
          ? `Could not delete group: ${result.errorMessage}`
          : 'Failed to delete group. Please try again.',
      )
    }
  }

  // ── Leave group handler ───────────────────────────────────────────────────

  const handleLeaveGroup = async () => {
    setLeaveLoading(true)
    const ok = await leaveGroup(groupId)
    setLeaveLoading(false)

    if (ok) {
      setLeaveDialogOpen(false)
      toast.success(`You've left "${name}".`)
      if (onGroupDeleted) {
        onGroupDeleted()
      } else {
        onBack()
      }
    } else {
      setLeaveDialogOpen(false)
      toast.error('Failed to leave group. Please try again.')
    }
  }

  // ── Derived flags ─────────────────────────────────────────────────────────

  const shouldAnimateReveal = revealMode === 'cinematic'

  const showSearchingOverlay =
    realMode && activeWindow && (revealPhase === 'searching' || revealPhase === 'closing')

  const showRevealedContent =
    realMode && activeWindow && (revealPhase === 'closing' || revealPhase === 'revealed')

  // Stale banner: shown when the active window came from DB and is marked stale.
  const showStaleBanner =
    revealPhase === 'revealed' && savedWindowStale && !!savedWindow

  // Requirements check — shown when we don't have a window yet.
  const gwRequirements =
    realMode && availabilityLoaded && !activeWindow
      ? checkGoldenWindowRequirements(
          realMembers.map((m) => ({ id: m.user_id, name: m.display_name })),
          allAvailability,
        )
      : null

  // ── View-model ────────────────────────────────────────────────────────────

  const name        = realMode ? realGroup?.name ?? 'Loading…' : mockGroup.name
  const emoji       = realMode ? realGroup?.emoji ?? '👥' : mockGroup.emoji
  const memberCount = realMode ? realMembers.length : mockGroup.memberCount
  const inviteCode  = realMode ? realGroup?.invite_code ?? null : null

  const rawActivityId     = realMode ? realGroup?.activity_id : null
  const activityDef       = rawActivityId && !rawActivityId.startsWith('custom:') ? getActivityById(rawActivityId) : null
  const customActivityLabel = rawActivityId?.startsWith('custom:') ? rawActivityId.slice('custom:'.length) : null
  const resolvedActivity  = activityDef
    ? activityDef
    : customActivityLabel
      ? { id: 'custom' as const, label: customActivityLabel, emoji: '✨', isCustom: true as const }
      : null

  const avatars = realMode
    ? realMembers.map((m) => ({
        id:     m.user_id,
        name:   displayNameFor(m),
        avatar: avatarFor(m),
        synced: false,
      }))
    : mockGroup.members

  const showGoldenWindow = !realMode && mockGroup.hasGoldenWindow && mockGroup.goldenWindow

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background pb-8">
      <TopHeader
        title={name}
        showBack
        onBack={onBack}
        showNotifications={false}
      />

      <main className="px-4 py-6 max-w-md mx-auto">

        {/* Group Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center text-3xl">
            {emoji}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-medium">{name}</h1>
            <p className="text-muted-foreground">
              {loading ? 'Loading members…' : `${memberCount} member${memberCount === 1 ? '' : 's'}`}
            </p>
            {resolvedActivity && (
              <div className="mt-2">
                <ActivityBadge activity={resolvedActivity} className="text-xs py-1" />
              </div>
            )}
          </div>
          <button
            onClick={() => onNavigate?.('profile')}
            className="p-2 rounded-full hover:bg-muted/50 transition-colors"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* ── Planning Location ── subtle card, real groups only ─────────
            Placed before Golden Window so users can set location first.
            Does not dominate the view — uses a compact single-row style. */}
        {realMode && !loading && (
          <GroupLocationSection
            groupId={groupId}
            planningLocation={planningLocation}
            onChanged={setPlanningLocation}
          />
        )}

        {/* ── Stale banner ── shown when a saved window exists but availability
            changed after it was computed. Never overwrites automatically. */}
        {showStaleBanner && (
          <div className="mb-4 flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-400">Availability changed</p>
              <p className="text-xs text-muted-foreground">This result may be outdated.</p>
            </div>
            <Button
              size="sm"
              onClick={handleStartSearch}
              className="shrink-0 h-8 px-3 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border-0"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Recalculate
            </Button>
          </div>
        )}

        {/* ── "Find Golden Window" CTA ──
            Shown when availability is loaded but no window has been found/
            saved yet, and the cinematic isn't running. Always visible so the
            user never hits a dead end. */}
        {realMode && availabilityLoaded && !activeWindow && revealPhase === 'idle' && (
          <GlassCard className="mb-6 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Golden Window</span>
            </div>

            {gwRequirements?.canCompute ? (
              <>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  Nexus will find the best time for your group — even if there&apos;s no perfect
                  overlap, it&apos;ll find the closest option and explain the match.
                </p>
                <Button
                  onClick={handleStartSearch}
                  className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl glow-gold"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Find Golden Window
                </Button>
              </>
            ) : realMembers.length < 2 ? (
              // ── Solo member: invite is the only unblocking action ──────────
              <>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  Golden Windows need at least 2 members. Invite someone so Nexus
                  can find the best time for your group.
                </p>
                <Button
                  onClick={() => setInviteOpen(true)}
                  className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl glow-gold"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Invite Someone
                </Button>
                <Button
                  onClick={() => setActiveSection('availability')}
                  className="mt-2 w-full h-9 rounded-xl bg-muted/30 hover:bg-muted/50 text-muted-foreground text-xs border-0"
                >
                  Set your availability first
                </Button>
              </>
            ) : (
              // ── Enough members, but availability data is missing ───────────
              <>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  {gwRequirements?.missingExplanation ??
                    'Add your availability so Nexus can find the best time for your group.'}
                </p>
                <Button
                  disabled
                  className="w-full h-11 rounded-xl opacity-40 cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Find Golden Window
                </Button>
                <Button
                  onClick={() => setActiveSection('availability')}
                  className="mt-2 w-full h-9 rounded-xl bg-muted/30 hover:bg-muted/50 text-muted-foreground text-xs border-0"
                >
                  Set your availability
                </Button>
              </>
            )}
          </GlassCard>
        )}

        {/* ── Cinematic searching overlay ── */}
        {showSearchingOverlay && (
          <GoldenWindowSearching exiting={revealPhase === 'closing'} />
        )}

        {/* ── Revealed Golden Window card ──
            Mounts during 'closing' so it scale-ins under the fading overlay
            for a true crossfade. Active window may be perfect, strong,
            partial, or a compromise — the card adapts to the quality. */}
        {showRevealedContent && activeWindow && (
          <GlassCard
            glow
            className={cn(
              'mb-6 p-5 cursor-pointer',
              shouldAnimateReveal && 'animate-scale-in',
            )}
            onClick={handleRevealVenues}
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary font-medium">
                  {QUALITY_HEADER[activeWindow.match_quality]}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-xs px-2 py-1 rounded-full font-medium',
                  QUALITY_CLASSES[activeWindow.match_quality],
                )}>
                  {QUALITY_LABELS[activeWindow.match_quality]}
                </span>
              </div>
            </div>

            {/* Time + date */}
            <div className="flex items-center gap-4">
              <GoldenRing size="md" intensity="normal" />
              <div className="flex-1">
                <p className="text-2xl font-bold">{formatTime12h(activeWindow.start_time)}</p>
                <p className="text-muted-foreground">
                  {dayLabel(activeWindow.day_of_week, activeWindow.days_until)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDuration(activeWindow.duration_minutes)}
                  {' · '}
                  {formatTime12h(activeWindow.start_time)}
                  {' – '}
                  {formatTime12h(activeWindow.end_time)}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>

            {/* Compromise / partial explanation */}
            {activeWindow.compromise_note && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <p className="text-xs text-muted-foreground italic leading-relaxed">
                  {activeWindow.is_compromise
                    ? "I couldn't find a perfect overlap — this is your best option."
                    : activeWindow.compromise_note}
                </p>
              </div>
            )}

            {/* Member availability */}
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/30">
              <AvatarStack avatars={avatars} max={5} />
              <div className="flex items-center gap-1 text-emerald-500 text-sm">
                <Check className="w-4 h-4" />
                <span>
                  {activeWindow.available_member_count} of {activeWindow.total_member_count} free
                </span>
              </div>
            </div>

            {/* Weather chip */}
            {(weatherLoading || (weather && !weather.error)) && (
              <div
                className="mt-3 pt-3 border-t border-border/30"
                onClick={(e) => e.stopPropagation()}
              >
                <WeatherChip weather={weather} loading={weatherLoading} />
              </div>
            )}
          </GlassCard>
        )}

        {/* ── Recalculate button — shown below the revealed card ──
            Subtle so it doesn't compete with "Explore nearby fits". */}
        {revealPhase === 'revealed' && activeWindow && !showStaleBanner && (
          <div className="flex justify-end mb-2">
            <button
              onClick={handleStartSearch}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded-lg hover:bg-muted/30"
            >
              <RefreshCw className="w-3 h-3" />
              Recalculate
            </button>
          </div>
        )}

        {/* ── Explore nearby fits CTA ── */}
        {showRevealedContent && revealPhase === 'revealed' && !venuesRevealed && (
          <Button
            onClick={handleRevealVenues}
            className={cn(
              'w-full h-14 mb-6 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl glow-gold',
              shouldAnimateReveal && 'animate-fade-in-up opacity-0',
            )}
            style={shouldAnimateReveal ? { animationDelay: '300ms' } : undefined}
          >
            <MapPin className="w-5 h-5 mr-2" />
            Explore nearby fits
          </Button>
        )}

        {/* ── Venues section ── */}
        {showRevealedContent && venuesRevealed && (
          <div ref={venuesRef} className="scroll-mt-20">
            <VenueRecommendations
              groupName={realGroup?.name ?? null}
              goldenWindow={{
                day_of_week: activeWindow!.day_of_week,
                start_time:  activeWindow!.start_time,
                end_time:    activeWindow!.end_time,
              }}
              weather={weather}
              planningLocation={
                planningLocation
                  ? { lat: planningLocation.lat, lng: planningLocation.lng }
                  : null
              }
            />
          </div>
        )}

        {/* ── Activity Planner section ──────────────────────────────────────
            Shown in real mode when the group has a plannable activity set.
        ── */}
        {realMode && availabilityLoaded && rawActivityId && (
          <>
            {hasPlannerFor(rawActivityId) ? (
              <>
                {/* ── Plan CTA — shown until plan is generated ── */}
                {planPhase === 'idle' && (
                  <GlassCard className="mb-6 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">
                        {resolvedActivity?.label ?? 'Activity'} Planner
                      </span>
                    </div>
                    {/* CTA description — adapts to venue vs route planners */}
                    {(() => {
                      const isRoutePlanner = getPlannerFor(rawActivityId)?.kind === 'route'
                      return (
                        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                          {isRoutePlanner
                            ? 'Nexus will plan a route for your group — timed to your Golden Window.'
                            : 'Nexus will find the best venues near your group, score them, and build a plan — timed to your Golden Window.'}
                        </p>
                      )
                    })()}
                    {!activeWindow && (
                      <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-3 leading-relaxed">
                        Find a Golden Window first so Nexus can plan around your
                        group&apos;s available time.
                      </p>
                    )}
                    {/* Location hint — shown for all planned activities */}
                    {!planningLocation && (
                      <p className="text-xs text-muted-foreground bg-muted/20 border border-border/30 rounded-xl px-3 py-2 mb-3 leading-relaxed">
                        <MapPin className="w-3 h-3 inline mr-1 opacity-60" />
                        Set a planning location above so Nexus knows where to plan.
                      </p>
                    )}
                    <Button
                      onClick={handlePlanActivity}
                      disabled={!activeWindow}
                      className={cn(
                        'w-full h-11 rounded-xl',
                        activeWindow
                          ? 'bg-primary hover:bg-primary/90 text-primary-foreground glow-gold'
                          : 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Plan {resolvedActivity?.label ?? 'Activity'}
                    </Button>
                  </GlassCard>
                )}

                {/* ── Planning in progress ── */}
                {planPhase === 'planning' && (
                  <GlassCard className="mb-6 p-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Planning your {resolvedActivity?.label?.toLowerCase() ?? 'activity'}…
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {getPlannerFor(rawActivityId)?.kind === 'route'
                            ? 'Planning your route…'
                            : 'Discovering venues and scoring the best match'}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                )}

                {/* ── Error state ── */}
                {planPhase === 'error' && planError && (
                  <GlassCard className="mb-6 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">
                        {resolvedActivity?.label ?? 'Activity'} Planner
                      </span>
                    </div>
                    <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-3 leading-relaxed">
                      {planError}
                    </p>
                    <Button
                      onClick={() => setPlanPhase('idle')}
                      variant="outline"
                      className="w-full h-9 rounded-xl text-xs"
                    >
                      Try again
                    </Button>
                  </GlassCard>
                )}

                {/* ── Generated plan ── */}
                {planPhase === 'done' && activePlan && (
                  <ActivityPlanCard
                    plan={activePlan}
                    onRecalculate={() => {
                      setPlanPhase('idle')
                      setActivePlan(null)
                      setPlanError(null)
                    }}
                  />
                )}
              </>
            ) : (
              /* ── Coming soon for other activities ── */
              <GlassCard className="mb-6 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {resolvedActivity?.label ?? 'Activity'} Planner
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  A dedicated planner for this activity is coming soon. Nexus
                  will handle the details — venues, timing, and routing — all
                  in one tap.
                </p>
              </GlassCard>
            )}
          </>
        )}

        {/* ── Mock-group Golden Window banner (legacy demo groups only) ── */}
        {showGoldenWindow && mockGroup.goldenWindow && (
          <GlassCard
            glow
            className="mb-6 p-5 cursor-pointer"
            onClick={onViewGoldenWindow}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary font-medium">Golden Window Found ✨</span>
              </div>
              <span className="text-xs px-2 py-1 bg-primary/20 text-primary rounded-full">
                BEST MATCH
              </span>
            </div>
            <div className="flex items-center gap-4">
              <GoldenRing size="md" intensity="normal" />
              <div className="flex-1">
                <p className="text-2xl font-bold">{mockGroup.goldenWindow.time}</p>
                <p className="text-muted-foreground">{mockGroup.goldenWindow.date}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {mockGroup.goldenWindow.duration} · {mockGroup.goldenWindow.time} - {mockGroup.goldenWindow.endTime}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/30">
              <AvatarStack avatars={mockGroup.members} max={5} showSyncStatus />
              <div className="flex items-center gap-1 text-emerald-500 text-sm">
                <Check className="w-4 h-4" />
                <span>All {mockGroup.memberCount} are free</span>
              </div>
            </div>
          </GlassCard>
        )}

        {/* ── Stats row ── */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <StatBadge
            label="members"
            value={`${memberCount}`}
            variant="default"
            icon={<Calendar className="w-3 h-3" />}
          />
          {!realMode && mockGroup.goldenWindow && (
            <>
              <StatBadge
                label="confidence"
                value={`${mockGroup.goldenWindow.confidence}%`}
                variant="gold"
                icon={<Sparkles className="w-3 h-3" />}
              />
              <StatBadge
                label="avg travel"
                value={`${mockGroup.goldenWindow.avgTravelTime}min`}
                variant="default"
                icon={<Clock className="w-3 h-3" />}
              />
            </>
          )}
          {realMode && activeWindow && (
            <>
              <StatBadge
                label="confidence"
                value={`${activeWindow.confidence_score}%`}
                variant="gold"
                icon={<Sparkles className="w-3 h-3" />}
              />
              <StatBadge
                label="fairness"
                value={`${activeWindow.fairness_score}%`}
                variant="default"
                icon={<Check className="w-3 h-3" />}
              />
            </>
          )}
        </div>

        {/* ── Section tabs ── */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveSection('members')}
            className={cn(
              'flex-1 py-3 rounded-xl text-sm font-medium transition-all',
              activeSection === 'members'
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'bg-muted/30 text-muted-foreground'
            )}
          >
            Members
          </button>
          {realMode && (
            <button
              onClick={() => setActiveSection('availability')}
              className={cn(
                'flex-1 py-3 rounded-xl text-sm font-medium transition-all',
                activeSection === 'availability'
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : 'bg-muted/30 text-muted-foreground'
              )}
            >
              Availability
            </button>
          )}
          <button
            onClick={() => setActiveSection('preferences')}
            className={cn(
              'flex-1 py-3 rounded-xl text-sm font-medium transition-all',
              activeSection === 'preferences'
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'bg-muted/30 text-muted-foreground'
            )}
          >
            Preferences
          </button>
        </div>

        {/* ── Availability editor (real groups only) ── */}
        {realMode && activeSection === 'availability' && (
          <AvailabilityEditor
            groupId={groupId}
            currentUserId={user?.id ?? null}
          />
        )}

        {/* ── Members list ── */}
        {activeSection === 'members' && (
          <div className="space-y-3">
            {realMode
              ? realMembers.map((m) => (
                  <GlassCard key={m.user_id} className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img
                          src={avatarFor(m)}
                          alt={displayNameFor(m)}
                          className="w-12 h-12 rounded-full bg-muted"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{displayNameFor(m)}</p>
                        <p className="text-sm text-muted-foreground capitalize">{m.role}</p>
                      </div>
                    </div>
                  </GlassCard>
                ))
              : mockGroup.members.map((member) => (
                  <GlassCard key={member.id} className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img
                          src={member.avatar}
                          alt={member.name}
                          className="w-12 h-12 rounded-full"
                        />
                        <span className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background',
                          member.synced ? 'bg-emerald-500' : 'bg-amber-500'
                        )} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{member.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {member.synced ? 'Calendar synced' : 'Pending sync'}
                        </p>
                      </div>
                      {member.synced ? (
                        <div className="flex items-center gap-1 text-emerald-500 text-xs">
                          <Check className="w-4 h-4" />
                          <span>Ready</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-500 text-xs">
                          <AlertCircle className="w-4 h-4" />
                          <span>Pending</span>
                        </div>
                      )}
                    </div>
                  </GlassCard>
                ))}

            <Button
              variant="outline"
              onClick={() => setInviteOpen(true)}
              className="w-full h-12 border-dashed border-border/50 text-muted-foreground"
            >
              <Plus className="w-4 h-4 mr-2" />
              Invite Member
            </Button>
          </div>
        )}

        {/* ── Shared preferences ── */}
        {activeSection === 'preferences' && (
          <div className="space-y-3">
            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="font-medium">Budget</span>
                </div>
                <span className="text-muted-foreground text-sm">££ (£20–30 per person)</span>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h3V3H3zm6 0v18h3V3H9zm6 0v18h3V3h-3z" />
                    </svg>
                  </div>
                  <span className="font-medium">Food preferences</span>
                </div>
                <span className="text-muted-foreground text-sm">Italian, Vegan options</span>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-medium">Maximum travel time</span>
                </div>
                <span className="text-muted-foreground text-sm">20 min</span>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-medium">Preferred days</span>
                </div>
                <span className="text-muted-foreground text-sm">Fri, Sat, Sun</span>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  </div>
                  <span className="font-medium">Preferred times</span>
                </div>
                <span className="text-muted-foreground text-sm">Evenings</span>
              </div>
            </GlassCard>

            {/* ── Group Actions (real groups only) ── */}
            {realMode && !loading && (isOwner || canLeave) && (
              <div className="mt-2 pt-5 border-t border-border/20">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">
                  Group Actions
                </p>

                {/* Owner: Delete Group (destructive, red) */}
                {isOwner && (
                  <button
                    onClick={() => setDeleteDialogOpen(true)}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-left"
                  >
                    <Trash2 className="w-4 h-4 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Delete Group</p>
                      <p className="text-xs opacity-70 mt-0.5">
                        Permanently remove this group and all its data
                      </p>
                    </div>
                  </button>
                )}

                {/* Non-owner member: Leave Group */}
                {canLeave && (
                  <button
                    onClick={() => setLeaveDialogOpen(true)}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-muted/20 border border-border/30 text-muted-foreground hover:bg-muted/30 transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Leave Group</p>
                      <p className="text-xs opacity-70 mt-0.5">
                        Remove yourself from this group
                      </p>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Mock-only "Find Golden Window" CTA ── */}
        {!realMode && !mockGroup.hasGoldenWindow && (
          <Button
            onClick={onViewGoldenWindow}
            className="w-full h-14 mt-6 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl glow-gold"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Find Golden Window
          </Button>
        )}
      </main>

      <InviteMemberModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        groupName={name}
        inviteCode={inviteCode}
      />

      {/* ── Delete Group confirmation ── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>&ldquo;{name}&rdquo;</strong> and all its
              associated data — members, availability, Golden Windows, and plans.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>
              Cancel
            </AlertDialogCancel>
            <button
              onClick={handleDeleteGroup}
              disabled={deleteLoading}
              className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Group
                </>
              )}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Leave Group confirmation ── */}
      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this group?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be removed from <strong>&ldquo;{name}&rdquo;</strong>. You can
              rejoin later with a new invite code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaveLoading}>
              Cancel
            </AlertDialogCancel>
            <button
              onClick={handleLeaveGroup}
              disabled={leaveLoading}
              className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium bg-foreground hover:bg-foreground/90 text-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {leaveLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-background/40 border-t-background rounded-full animate-spin" />
                  Leaving…
                </>
              ) : (
                <>
                  <LogOut className="w-3.5 h-3.5" />
                  Leave Group
                </>
              )}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
