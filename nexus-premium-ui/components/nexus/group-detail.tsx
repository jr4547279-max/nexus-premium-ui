'use client'

import { useEffect, useRef, useState } from 'react'
import { TopHeader } from './navigation'
import { GlassCard, AvatarStack, StatBadge } from './glass-card'
import { GoldenRing } from './golden-ring'
import { Button } from '@/components/ui/button'
import {
  Calendar, MapPin, ChevronRight, Sparkles,
  Clock, Check, AlertCircle, Plus, Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockGroups } from '@/lib/mock-data'
import {
  getGroup,
  listGroupMembers,
  type Group,
  type GroupMember,
} from '@/lib/group-service'
import { InviteMemberModal } from './invite-member-modal'
import { AvailabilityEditor } from './availability-editor'
import { useAuth } from '@/lib/auth-context'
import { getGroupAvailability } from '@/lib/availability-service'
import {
  computeGoldenWindows,
  formatTime12h,
  formatDuration,
  dayLabel,
  type GoldenWindow,
} from '@/lib/golden-window'
import { VenueRecommendations } from './venue-recommendations'
import { WeatherChip } from './weather-chip'
import { fetchWeather, type Weather } from '@/lib/weather-service'
import { computeMidpoint } from '@/lib/venue-service'
import { GoldenWindowSearching } from './golden-window-searching'

interface GroupDetailProps {
  groupId: string
  onBack: () => void
  onViewGoldenWindow: () => void
  onNavigate?: (screen: string) => void
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

export function GroupDetail({ groupId, onBack, onViewGoldenWindow, onNavigate }: GroupDetailProps) {
  const realMode = isUuid(groupId)
  const mockGroup = mockGroups.find((g) => g.id === groupId) || mockGroups[0]

  const { user } = useAuth()
  const [activeSection, setActiveSection] = useState<'members' | 'availability' | 'preferences'>('members')
  const [inviteOpen, setInviteOpen] = useState(false)

  const [realGroup, setRealGroup] = useState<Group | null>(null)
  const [realMembers, setRealMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(realMode)
  const [realWindows, setRealWindows] = useState<GoldenWindow[] | null>(null)
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false)
  const [weather, setWeather] = useState<Weather | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // Phase 6B — cinematic reveal state.
  //
  // We show the atmospheric searching overlay once per (group, session).
  // After the first reveal, sessionStorage holds the flag so revisiting
  // the group in the same tab loads instantly with no replay.
  // Respect prefers-reduced-motion — skip the sequence entirely in that
  // case so we never animate against the user's accessibility setting.
  //
  // revealMode tracks *how* we arrived at the revealed state so the JSX
  // can decide whether to apply the scale/fade-in animation classes:
  //   - 'cinematic' → first-ever visit, full animation
  //   - 'instant'   → reduced-motion OR already-revealed-this-session, no animation
  //
  // 'closing' is a brief transitional phase where the full-screen overlay
  // fades out over ~600 ms while the Golden Window card scale-ins
  // underneath, producing a smooth crossfade handoff.
  const [revealPhase, setRevealPhase] = useState<
    'init' | 'searching' | 'closing' | 'revealed'
  >('init')
  const [revealMode, setRevealMode] = useState<'cinematic' | 'instant'>('cinematic')
  // Ref guard so the reveal effect is a one-shot per group. We can't rely
  // on a `revealPhase === 'init'` check inside the effect because React
  // tears down the timers in cleanup the moment phase transitions, then
  // re-runs the effect (which would early-return and never reschedule).
  // Timer IDs are held in a separate ref so the dedicated [groupId] cleanup
  // effect can clear them. Under React 18 Strict Mode (dev), the
  // mount → cleanup → mount cycle clears + reschedules the timers exactly
  // once, which is safe — the second setup resets the guard and reschedules,
  // so no stall remains and the visible timeline is unaffected.
  const revealStartedRef = useRef(false)
  const revealTimersRef = useRef<{
    close?: ReturnType<typeof setTimeout>
    reveal?: ReturnType<typeof setTimeout>
  }>({})

  useEffect(() => {
    if (!realMode) return
    let cancelled = false
    setLoading(true)
    setAvailabilityLoaded(false)
    Promise.all([
      getGroup(groupId),
      listGroupMembers(groupId),
      getGroupAvailability(groupId),
    ]).then(([g, m, avail]) => {
      if (cancelled) return
      setRealGroup(g)
      setRealMembers(m)
      const windows = computeGoldenWindows(
        m.map((mem) => ({ id: mem.user_id, name: mem.display_name })),
        avail.map((r) => ({
          user_id: r.user_id,
          day_of_week: r.day_of_week,
          start_time: r.start_time,
          end_time: r.end_time,
        })),
      )
      setRealWindows(windows)
      setAvailabilityLoaded(true)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [groupId, realMode])

  const bestWindow = realWindows && realWindows[0] ? realWindows[0] : null

  // Phase 6B — drive the reveal sequence once a real Golden Window is
  // computed. Three cases:
  //   1. Already revealed this session → snap straight to 'revealed'.
  //   2. Reduced-motion → snap straight to 'revealed' (no animation).
  //   3. Fresh visit → show 'searching' for ~2.2 s, then 'revealed'.
  useEffect(() => {
    if (!realMode || !availabilityLoaded || !bestWindow) return
    // One-shot per mount — never start the sequence twice.
    if (revealStartedRef.current) return
    revealStartedRef.current = true

    const storageKey = `nexus:revealed:${groupId}`
    let alreadyRevealed = false
    try {
      alreadyRevealed =
        typeof window !== 'undefined' &&
        window.sessionStorage.getItem(storageKey) === '1'
    } catch {
      // sessionStorage can throw in restricted contexts — treat as not revealed.
    }
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (alreadyRevealed || prefersReducedMotion) {
      // No replay, no animation — just render the final state immediately.
      setRevealMode('instant')
      setRevealPhase('revealed')
      return
    }

    setRevealMode('cinematic')
    setRevealPhase('searching')

    // Phase 6B adjustment — slower, more cinematic pacing.
    //   0 ms      → searching overlay mounts, phrases begin rotating
    //   3000 ms   → enter 'closing': overlay starts fading + Golden Window
    //                card mounts underneath with scale-in (true crossfade)
    //   3600 ms   → overlay unmounts, venue section is allowed to fade up
    //   4200 ms   → venue recommendations finish their fade-up
    //   ~4.2 s    → fully revealed
    revealTimersRef.current.close = setTimeout(() => {
      setRevealPhase('closing')
      // Mark the session as revealed as soon as the card mounts —
      // protects against the user navigating away mid-fade.
      try {
        window.sessionStorage.setItem(storageKey, '1')
      } catch {
        // sessionStorage can throw in private modes — non-fatal.
      }
    }, 3000)
    revealTimersRef.current.reveal = setTimeout(() => setRevealPhase('revealed'), 3600)

    // No cleanup here on purpose. Clearing the timers on every effect
    // teardown would strand the sequence under React Strict Mode (which
    // runs mount → cleanup → mount in dev). The real cleanup lives in a
    // separate effect keyed on `groupId` below.
  }, [realMode, availabilityLoaded, bestWindow, groupId])

  // Hard reset whenever the user switches to a different group, and on
  // true unmount. This is the only place timers are cleared.
  useEffect(() => {
    return () => {
      if (revealTimersRef.current.close) clearTimeout(revealTimersRef.current.close)
      if (revealTimersRef.current.reveal) clearTimeout(revealTimersRef.current.reveal)
      revealTimersRef.current = {}
      revealStartedRef.current = false
    }
  }, [groupId])

  // Animation classes are only applied on the first cinematic reveal.
  // Reduced-motion users and returning visitors get static, instant content.
  const shouldAnimateReveal = revealMode === 'cinematic'

  // Convenience flags read by the JSX below.
  // The overlay stays mounted through 'closing' so it can fade out.
  // The Golden Window card mounts at 'closing' too so it scale-ins
  // *underneath* the fading overlay — that's the true crossfade.
  const showSearchingOverlay =
    realMode && bestWindow && (revealPhase === 'searching' || revealPhase === 'closing')
  const showRevealedContent =
    realMode && bestWindow && (revealPhase === 'closing' || revealPhase === 'revealed')

  // Phase 6A — fetch real weather for the Golden Window slot. We have no
  // per-member coords yet, so the midpoint falls back to Eastbourne.
  useEffect(() => {
    if (!realMode || !bestWindow) {
      setWeather(null)
      setWeatherLoading(false)
      return
    }
    let cancelled = false
    setWeatherLoading(true)
    const mp = computeMidpoint([])
    fetchWeather({
      lat: mp.fallback ? undefined : mp.lat,
      lng: mp.fallback ? undefined : mp.lng,
      dayOfWeek: bestWindow.day_of_week,
      startTime: bestWindow.start_time,
    }).then((w) => {
      if (cancelled) return
      setWeather(w)
      setWeatherLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [realMode, bestWindow?.day_of_week, bestWindow?.start_time])

  // Derived view-model: same shape regardless of real vs mock.
  const name = realMode ? realGroup?.name ?? 'Loading…' : mockGroup.name
  const emoji = realMode ? realGroup?.emoji ?? '👥' : mockGroup.emoji
  const memberCount = realMode ? realMembers.length : mockGroup.memberCount
  const inviteCode = realMode ? realGroup?.invite_code ?? null : null

  const avatars = realMode
    ? realMembers.map((m) => ({
        id: m.user_id,
        name: displayNameFor(m),
        avatar: avatarFor(m),
        synced: false,
      }))
    : mockGroup.members

  // Golden Window / preferences / sync indicators stay mock-only for now.
  const showGoldenWindow = !realMode && mockGroup.hasGoldenWindow && mockGroup.goldenWindow

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
          </div>
          <button
            onClick={() => onNavigate?.('profile')}
            className="p-2 rounded-full hover:bg-muted/50 transition-colors"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Phase 6B — full-screen cinematic searching overlay. Mounts only
            on the first visit and fades out smoothly during 'closing'. */}
        {showSearchingOverlay && (
          <GoldenWindowSearching exiting={revealPhase === 'closing'} />
        )}

        {/* Real Golden Window — computed from member availability.
            Wrapped in the reveal animation so it scales+fades in once
            the searching phase ends. */}
        {showRevealedContent && (
          <GlassCard
            glow
            className={cn(
              'mb-6 p-5 cursor-pointer',
              shouldAnimateReveal && 'animate-scale-in',
            )}
            onClick={onViewGoldenWindow}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary font-medium">Golden Window Found ✨</span>
              </div>
              <span className="text-xs px-2 py-1 bg-primary/20 text-primary rounded-full">
                {bestWindow.label || 'BEST MATCH'}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <GoldenRing size="md" intensity="normal" />
              <div className="flex-1">
                <p className="text-2xl font-bold">{formatTime12h(bestWindow.start_time)}</p>
                <p className="text-muted-foreground">
                  {dayLabel(bestWindow.day_of_week, bestWindow.days_until)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDuration(bestWindow.duration_minutes)} • {formatTime12h(bestWindow.start_time)} – {formatTime12h(bestWindow.end_time)}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>

            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/30">
              <AvatarStack avatars={avatars} max={5} />
              <div className="flex items-center gap-1 text-emerald-500 text-sm">
                <Check className="w-4 h-4" />
                <span>
                  {bestWindow.available_member_count} of {bestWindow.total_member_count} free
                </span>
              </div>
            </div>

            {/* Phase 6A: real weather chip for the Golden Window slot.
                Hidden entirely if the fetch errored, so we never show fake context. */}
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

        {/* Real venue recommendations — fades up shortly after the
            Golden Window card so the reveal feels staged, not all at once. */}
        {showRevealedContent && (
          <div
            className={cn(shouldAnimateReveal && 'animate-fade-in-up opacity-0')}
            style={shouldAnimateReveal ? { animationDelay: '600ms' } : undefined}
          >
            <VenueRecommendations
              groupName={realGroup?.name ?? null}
              goldenWindow={{
                day_of_week: bestWindow.day_of_week,
                start_time: bestWindow.start_time,
                end_time: bestWindow.end_time,
              }}
              weather={weather}
            />
          </div>
        )}

        {/* Real Golden Window — empty state when nobody (or only one) has overlapping availability */}
        {realMode && availabilityLoaded && !bestWindow && (
          <GlassCard className="mb-6 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">No Golden Window yet</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Once two or more members share at least an hour of overlapping availability,
              your group's best time will appear here. Add yours in the Availability tab.
            </p>
            <Button
              onClick={() => setActiveSection('availability')}
              className="mt-4 h-9 px-4 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-xs font-medium"
            >
              Set your availability
            </Button>
          </GlassCard>
        )}

        {/* Golden Window Banner (mock-only — legacy demo groups) */}
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
                  {mockGroup.goldenWindow.duration} • {mockGroup.goldenWindow.time} - {mockGroup.goldenWindow.endTime}
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

        {/* Stats Row */}
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
          {realMode && bestWindow && (
            <>
              <StatBadge
                label="confidence"
                value={`${bestWindow.confidence_score}%`}
                variant="gold"
                icon={<Sparkles className="w-3 h-3" />}
              />
              <StatBadge
                label="fairness"
                value={`${bestWindow.fairness_score}%`}
                variant="default"
                icon={<Check className="w-3 h-3" />}
              />
            </>
          )}
        </div>

        {/* Section Tabs */}
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

        {/* Availability (real groups only) */}
        {realMode && activeSection === 'availability' && (
          <AvailabilityEditor
            groupId={groupId}
            currentUserId={user?.id ?? null}
          />
        )}

        {/* Members List */}
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

        {/* Shared Preferences */}
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
                <span className="text-muted-foreground text-sm">££ (£20-30 per person)</span>
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
          </div>
        )}

        {/* Find Window Button — mock groups only */}
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
    </div>
  )
}
