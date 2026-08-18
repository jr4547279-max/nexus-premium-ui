'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { LandingPage } from './landing-page'
import { AuthScreen } from './auth-screen'
import { OnboardingFlow } from './onboarding-flow'
import { Dashboard } from './dashboard'
import { GroupsScreen } from './groups-screen'
import { GroupDetail } from './group-detail'
import { GoldenWindowReveal } from './golden-window-reveal'
import { RunTracker } from './run-tracker'
import type { PlannerResult } from '@/lib/planners/planner-engine'
import { ActivityScreen } from './activity-screen'
import { WorldScreen } from './world-screen'
import { ProfileScreen } from './profile-screen'
import { SocialScreen } from './social-screen'
import { GoldenRing } from './golden-ring'
import { CreateGroupModal } from './create-group-modal'
import { joinGroupByInvite } from '@/lib/group-service'
// DEV-ONLY: static import is fine — badge + panel are gated at render time by
// NODE_ENV. Remove this import + the 'dev-test' Screen entry to strip entirely.
import { DevTestPanel } from './dev-test-panel'

const PENDING_INVITE_KEY = 'nexus.pendingInviteCode'

type Screen =
  | 'resolving'
  | 'landing'
  | 'auth'
  | 'onboarding'
  | 'home'
  | 'groups'
  | 'group-detail'
  | 'golden-window'
  | 'activity'
  | 'world'
  | 'profile'
  | 'social'
  | 'run-tracker'
  // DEV-ONLY — remove before production
  | 'dev-test'

export function NexusApp() {
  const { session, loading, profile, profileLoading, signOut } = useAuth()
  const [currentScreen, setCurrentScreen] = useState<Screen>('resolving')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('1')
  const [prevGroupScreen, setPrevGroupScreen] = useState<Screen>('home')
  const [onboardingReturnTo, setOnboardingReturnTo] = useState<Screen>('home')
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [groupsVersion, setGroupsVersion] = useState(0)
  const [activeRunPlan, setActiveRunPlan] = useState<PlannerResult | null>(null)

  const initializedRef = useRef(false)

  /* ── Initial auth resolution ──
     Runs ONCE after Supabase finishes its first session check. We deliberately
     do NOT add a “redirect to landing when session disappears” effect — that
     auto-detector caused authenticated users to be bounced back to the landing
     screen whenever Supabase emitted a transient null-session event on tab
     focus / token refresh / button click. Explicit sign-out is handled by
     handleLogout below. */
  useEffect(() => {
    if (loading) return
    if (initializedRef.current) return
    initializedRef.current = true

    if (!session) {
      setCurrentScreen('landing')
    }
  }, [loading, session])

  /* ── Once profile is known, decide: onboarding or home ── */
  useEffect(() => {
    if (!initializedRef.current) return
    if (currentScreen !== 'resolving') return
    if (!session) return
    if (profileLoading) return

    const next = profile?.onboarding_completed ? 'home' : 'onboarding'
    setCurrentScreen(next)
  }, [currentScreen, session, profileLoading, profile])

  /* ── Consume a pending invite after the user signs in.
        /invite/[code] stashes the code in localStorage when the visitor isn't
        signed in yet; once auth resolves we finish the join here and bump the
        groups list so it appears immediately. ── */
  useEffect(() => {
    if (!session) return
    let pending: string | null = null
    try {
      pending = localStorage.getItem(PENDING_INVITE_KEY)
    } catch {
      return
    }
    if (!pending) return
    try {
      localStorage.removeItem(PENDING_INVITE_KEY)
    } catch {
      // removal is best-effort — ignore storage errors
    }
    joinGroupByInvite(pending).then(({ groupId, errorMessage }) => {
      if (groupId) {
        toast.success('Joined group')
        setGroupsVersion((v) => v + 1)
      } else if (errorMessage) {
        toast.error(errorMessage)
      }
    })
  }, [session])

  /* ── Navigation helpers ── */
  const handleGroupClick = (groupId: string, from: Screen = 'home') => {
    setSelectedGroupId(groupId)
    setPrevGroupScreen(from)
    setCurrentScreen('group-detail')
  }

  const handleNavigate = (screen: string) => {
    // Track where the user came from when entering onboarding so we can route
    // them back correctly (e.g. "Edit preferences" from profile should return
    // to profile, not to landing).
    if (screen === 'onboarding' && currentScreen !== 'resolving' && currentScreen !== 'landing') {
      setOnboardingReturnTo(currentScreen)
    }
    setCurrentScreen(screen as Screen)
  }

  const handleCreateGroup = () => {
    setCreateGroupOpen(true)
  }

  const handleGroupCreated = () => {
    // Force the dashboard/groups screens to refetch their useGroups() list.
    // Bumping a key on the rendered screen below remounts it cleanly.
    setGroupsVersion((v) => v + 1)
  }

  const handleLogout = async () => {
    await signOut()
    setCurrentScreen('landing')
  }

  // Treat onboarding as "edit mode" whenever the user already completed it.
  // In edit mode, both back and complete return to where they came from.
  const isEditingPreferences =
    currentScreen === 'onboarding' && Boolean(profile?.onboarding_completed)

  const handleOnboardingComplete = () => {
    if (isEditingPreferences) {
      setCurrentScreen(onboardingReturnTo)
      return
    }
    setCurrentScreen(session ? 'home' : 'auth')
  }

  const handleOnboardingBack = () => {
    if (isEditingPreferences) {
      setCurrentScreen(onboardingReturnTo)
      return
    }
    // First-time onboarding: back goes to landing only when there's no session.
    setCurrentScreen(session ? 'home' : 'landing')
  }

  /* ── Screen router ── */

  /* ── Screen router ── */
  if (currentScreen === 'resolving') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <GoldenRing size="md" intensity="subtle" />
          <p className="text-muted-foreground text-xs tracking-widest animate-pulse">
            NEXUS
          </p>
        </div>
      </div>
    )
  }

  if (currentScreen === 'landing') {
    return (
      <LandingPage
        onGetStarted={() => setCurrentScreen('onboarding')}
        onLogin={() => setCurrentScreen('auth')}
      />
    )
  }

  if (currentScreen === 'auth') {
    return (
      <AuthScreen
        onBack={() => setCurrentScreen('landing')}
        onSuccess={() => setCurrentScreen('resolving')}
      />
    )
  }

  if (currentScreen === 'onboarding') {
    return (
      <OnboardingFlow
        editMode={isEditingPreferences}
        onComplete={handleOnboardingComplete}
        onBack={handleOnboardingBack}
      />
    )
  }

  // ── Authenticated screens ──

  let screenContent: React.ReactNode

  switch (currentScreen) {
    case 'home':
      screenContent = (
        <>
          <Dashboard
            key={`dashboard-${groupsVersion}`}
            onGroupClick={(id) => handleGroupClick(id, 'home')}
            onNavigate={handleNavigate}
            onCreateGroup={handleCreateGroup}
          />
          <CreateGroupModal
            open={createGroupOpen}
            onOpenChange={setCreateGroupOpen}
            onCreated={handleGroupCreated}
          />
        </>
      )
      break

    case 'groups':
      screenContent = (
        <>
          <GroupsScreen
            key={`groups-${groupsVersion}`}
            onGroupClick={(id) => handleGroupClick(id, 'groups')}
            onNavigate={handleNavigate}
            onCreateGroup={handleCreateGroup}
          />
          <CreateGroupModal
            open={createGroupOpen}
            onOpenChange={setCreateGroupOpen}
            onCreated={handleGroupCreated}
          />
        </>
      )
      break

    case 'group-detail':
      screenContent = (
        <GroupDetail
          groupId={selectedGroupId}
          onBack={() => setCurrentScreen(prevGroupScreen)}
          onViewGoldenWindow={() => setCurrentScreen('golden-window')}
          onNavigate={handleNavigate}
          onGroupDeleted={() => {
            // Bump version so GroupsScreen / Dashboard remount and re-fetch,
            // then navigate back — the deleted group will no longer appear
            // because RLS (groups_select_member) excludes it.
            setGroupsVersion((v) => v + 1)
            setCurrentScreen(prevGroupScreen)
          }}
          onStartRun={(plan) => {
            setActiveRunPlan(plan)
            setCurrentScreen('run-tracker')
          }}
        />
      )
      break

    case 'run-tracker':
      screenContent = activeRunPlan ? (
        <RunTracker
          plan={activeRunPlan}
          onBack={() => setCurrentScreen('group-detail')}
        />
      ) : null
      break

    case 'golden-window':
      screenContent = (
        <GoldenWindowReveal
          groupId={selectedGroupId}
          onBack={() => setCurrentScreen('group-detail')}
          onConfirm={() => setCurrentScreen('home')}
        />
      )
      break

    case 'activity':
      screenContent = (
        <ActivityScreen
          onBack={() => setCurrentScreen('home')}
          onNavigate={handleNavigate}
        />
      )
      break

    case 'world':
      screenContent = <WorldScreen onNavigate={handleNavigate} />
      break

    case 'profile':
      screenContent = (
        <ProfileScreen
          onBack={() => setCurrentScreen('home')}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
      )
      break

    case 'social':
      screenContent = (
        <SocialScreen
          onNavigate={handleNavigate}
        />
      )
      break

    // DEV-ONLY — gated by NEXT_PUBLIC_DEV_TOOLS=true; not reachable in production
    case 'dev-test':
      screenContent = process.env.NEXT_PUBLIC_DEV_TOOLS === 'true'
        ? <DevTestPanel onBack={() => setCurrentScreen('groups')} />
        : null
      break

    default:
      screenContent = (
        <LandingPage
          onGetStarted={() => setCurrentScreen('onboarding')}
          onLogin={() => setCurrentScreen('auth')}
        />
      )
  }

  return <>{screenContent}</>
}
