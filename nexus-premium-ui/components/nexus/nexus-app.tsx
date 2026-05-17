'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { LandingPage } from './landing-page'
import { AuthScreen } from './auth-screen'
import { OnboardingFlow } from './onboarding-flow'
import { Dashboard } from './dashboard'
import { GroupsScreen } from './groups-screen'
import { GroupDetail } from './group-detail'
import { GoldenWindowReveal } from './golden-window-reveal'
import { ActivityScreen } from './activity-screen'
import { ProfileScreen } from './profile-screen'
import { GoldenRing } from './golden-ring'

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
  | 'profile'

export function NexusApp() {
  const { session, loading, profile, profileLoading, signOut } = useAuth()
  const [currentScreen, setCurrentScreen] = useState<Screen>('resolving')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('1')
  const [prevGroupScreen, setPrevGroupScreen] = useState<Screen>('home')

  const initializedRef = useRef(false)
  const hadSessionRef = useRef(false)

  /* ── Initial auth resolution ── */
  useEffect(() => {
    if (loading) return
    if (initializedRef.current) return
    initializedRef.current = true

    if (!session) {
      // No session — show landing immediately
      setCurrentScreen('landing')
    }
    // Session exists — stay on 'resolving' and wait for profile (handled below)
    if (session) {
      hadSessionRef.current = true
    }
  }, [loading, session])

  /* ── Once profile is known, decide: onboarding or home ── */
  useEffect(() => {
    if (!initializedRef.current) return
    if (currentScreen !== 'resolving') return
    if (!session) return
    if (profileLoading) return

    // Profile settled — route based on onboarding status
    if (profile?.onboarding_completed) {
      setCurrentScreen('home')
    } else {
      setCurrentScreen('onboarding')
    }
  }, [currentScreen, session, profileLoading, profile])

  /* ── Sign-out: redirect to landing when session is lost ── */
  useEffect(() => {
    if (!initializedRef.current) return
    if (!loading && !session && hadSessionRef.current) {
      hadSessionRef.current = false
      setCurrentScreen('landing')
    }
    if (session) {
      hadSessionRef.current = true
    }
  }, [session, loading])

  /* ── Navigation helpers ── */
  const handleGroupClick = (groupId: string, from: Screen = 'home') => {
    setSelectedGroupId(groupId)
    setPrevGroupScreen(from)
    setCurrentScreen('group-detail')
  }

  const handleNavigate = (screen: string) => setCurrentScreen(screen as Screen)

  const handleLogout = async () => {
    await signOut()
    setCurrentScreen('landing')
  }

  const handleOnboardingComplete = () => {
    setCurrentScreen(session ? 'home' : 'auth')
  }

  /* ── Screen router ── */
  switch (currentScreen) {
    case 'resolving':
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

    case 'landing':
      return (
        <LandingPage
          onGetStarted={() => setCurrentScreen('onboarding')}
          onLogin={() => setCurrentScreen('auth')}
        />
      )

    case 'auth':
      return (
        <AuthScreen
          onBack={() => setCurrentScreen('landing')}
          onSuccess={() => setCurrentScreen('onboarding')}
        />
      )

    case 'onboarding':
      return (
        <OnboardingFlow
          onComplete={handleOnboardingComplete}
          onBack={() => setCurrentScreen('landing')}
        />
      )

    case 'home':
      return (
        <Dashboard
          onGroupClick={(id) => handleGroupClick(id, 'home')}
          onNavigate={handleNavigate}
        />
      )

    case 'groups':
      return (
        <GroupsScreen
          onGroupClick={(id) => handleGroupClick(id, 'groups')}
          onNavigate={handleNavigate}
        />
      )

    case 'group-detail':
      return (
        <GroupDetail
          groupId={selectedGroupId}
          onBack={() => setCurrentScreen(prevGroupScreen)}
          onViewGoldenWindow={() => setCurrentScreen('golden-window')}
          onNavigate={handleNavigate}
        />
      )

    case 'golden-window':
      return (
        <GoldenWindowReveal
          groupId={selectedGroupId}
          onBack={() => setCurrentScreen('group-detail')}
          onConfirm={() => setCurrentScreen('home')}
        />
      )

    case 'activity':
      return (
        <ActivityScreen
          onBack={() => setCurrentScreen('home')}
          onNavigate={handleNavigate}
        />
      )

    case 'profile':
      return (
        <ProfileScreen
          onBack={() => setCurrentScreen('home')}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
      )

    default:
      return (
        <LandingPage
          onGetStarted={() => setCurrentScreen('onboarding')}
          onLogin={() => setCurrentScreen('auth')}
        />
      )
  }
}
