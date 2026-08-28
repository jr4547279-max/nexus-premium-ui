'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { CANONICAL_SITE_URL } from '@/lib/auth-context'
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
import { SocialPeopleScreen } from './social-people-screen'
import { GoldenRing } from './golden-ring'
import { CreateGroupModal } from './create-group-modal'
import { joinGroupByInvite } from '@/lib/group-service'
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

  // Vercel is the canonical production deployment. If an old deployment host
  // is reached (including after an auth flow), immediately return to Vercel.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const host = window.location.hostname
    const isOldVercelHost = host.endsWith('.vercel.app') || host === 'vercel.app'
    const isCanonicalHost = host === new URL(CANONICAL_SITE_URL).hostname
    if (isOldVercelHost && !isCanonicalHost) {
      window.location.replace(`${CANONICAL_SITE_URL}${window.location.pathname}${window.location.search}${window.location.hash}`)
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (initializedRef.current) return
    initializedRef.current = true
    if (!session) setCurrentScreen('landing')
  }, [loading, session])

  useEffect(() => {
    if (!initializedRef.current) return
    if (currentScreen !== 'resolving') return
    if (!session) return
    if (profileLoading) return
    const next = profile?.onboarding_completed ? 'home' : 'onboarding'
    setCurrentScreen(next)
  }, [currentScreen, session, profileLoading, profile])

  useEffect(() => {
    if (!session) return
    let pending: string | null = null
    try { pending = localStorage.getItem(PENDING_INVITE_KEY) } catch { return }
    if (!pending) return
    try { localStorage.removeItem(PENDING_INVITE_KEY) } catch {}
    joinGroupByInvite(pending).then(({ groupId, errorMessage }) => {
      if (groupId) {
        toast.success('Joined group')
        setGroupsVersion((v) => v + 1)
      } else if (errorMessage) toast.error(errorMessage)
    })
  }, [session])

  const handleGroupClick = (groupId: string, from: Screen = 'home') => {
    setSelectedGroupId(groupId)
    setPrevGroupScreen(from)
    setCurrentScreen('group-detail')
  }

  const handleNavigate = (screen: string) => {
    if (screen === 'onboarding' && currentScreen !== 'resolving' && currentScreen !== 'landing') {
      setOnboardingReturnTo(currentScreen)
    }
    setCurrentScreen(screen as Screen)
  }

  const handleCreateGroup = () => setCreateGroupOpen(true)
  const handleGroupCreated = () => setGroupsVersion((v) => v + 1)

  const handleLogout = async () => {
    await signOut()
    setCurrentScreen('landing')
  }

  const isEditingPreferences = currentScreen === 'onboarding' && Boolean(profile?.onboarding_completed)

  const handleOnboardingComplete = () => {
    if (isEditingPreferences) {
      setCurrentScreen(onboardingReturnTo)
      return
    }
    setCurrentScreen('home')
  }

  const handleInviteCode = (code: string) => {
    try { localStorage.setItem(PENDING_INVITE_KEY, code) } catch {}
    setCurrentScreen('auth')
  }

  if (loading || currentScreen === 'resolving') {
    return <div className="min-h-screen bg-[#070b18]" aria-hidden="true" />
  }

  if (!session) {
    if (currentScreen === 'auth') return <AuthScreen onBack={() => setCurrentScreen('landing')} />
    return <LandingPage onGetStarted={() => setCurrentScreen('auth')} onInviteCode={handleInviteCode} />
  }

  if (currentScreen === 'onboarding') {
    return <OnboardingFlow profile={profile} onComplete={handleOnboardingComplete} />
  }

  const commonProps = {
    onNavigate: handleNavigate,
    onGroupClick: handleGroupClick,
    onCreateGroup: handleCreateGroup,
    groupsVersion,
  }

  return (
    <>
      {currentScreen === 'home' && <Dashboard {...commonProps} />}
      {currentScreen === 'groups' && <GroupsScreen {...commonProps} />}
      {currentScreen === 'group-detail' && <GroupDetail groupId={selectedGroupId} onBack={() => setCurrentScreen(prevGroupScreen)} onNavigate={handleNavigate} />}
      {currentScreen === 'golden-window' && <GoldenWindowReveal onBack={() => setCurrentScreen('home')} onNavigate={handleNavigate} />}
      {currentScreen === 'activity' && <ActivityScreen {...commonProps} />}
      {currentScreen === 'world' && <WorldScreen {...commonProps} />}
      {currentScreen === 'profile' && <ProfileScreen {...commonProps} onLogout={handleLogout} />}
      {currentScreen === 'social' && <SocialPeopleScreen {...commonProps} />}
      {currentScreen === 'run-tracker' && <RunTracker plan={activeRunPlan} onBack={() => setCurrentScreen('home')} />}
      {currentScreen === 'dev-test' && <DevTestPanel onBack={() => setCurrentScreen('home')} />}
      <GoldenRing onClick={() => setCurrentScreen('golden-window')} />
      <CreateGroupModal open={createGroupOpen} onOpenChange={setCreateGroupOpen} onCreated={handleGroupCreated} />
    </>
  )
}
