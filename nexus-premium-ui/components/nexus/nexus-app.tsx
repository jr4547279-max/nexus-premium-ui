'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { NexusLogoAnimated } from './nexus-logo'
import { OrbitalBackground } from './golden-ring'
import { LandingPage } from './landing-page'
import { AuthScreen } from './auth-screen'
import { OnboardingFlow } from './onboarding-flow'
import { Dashboard } from './dashboard'
import { GroupsScreen } from './groups-screen'
import { GroupDetail } from './group-detail'
import { GoldenWindowReveal } from './golden-window-reveal'
import { ActivityScreen } from './activity-screen'
import { ProfileScreen } from './profile-screen'

type Screen =
  | 'landing'
  | 'auth'
  | 'onboarding'
  | 'home'
  | 'groups'
  | 'group-detail'
  | 'golden-window'
  | 'activity'
  | 'profile'

function NexusAppLoading() {
  return (
    <div className="min-h-screen bg-background">
      <OrbitalBackground className="min-h-screen flex flex-col items-center justify-center">
        <div className="float">
          <NexusLogoAnimated className="w-48 h-48" />
        </div>
      </OrbitalBackground>
    </div>
  )
}

export function NexusApp() {
  const { session, loading, signOut } = useAuth()
  const [currentScreen, setCurrentScreen] = useState<Screen | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string>('1')
  const [prevGroupScreen, setPrevGroupScreen] = useState<Screen>('home')

  const initializedRef = useRef(false)

  /* ── Initial routing once auth check completes ── */
  useEffect(() => {
    if (loading) return
    if (initializedRef.current) return
    initializedRef.current = true
    setCurrentScreen(session ? 'home' : 'landing')
  }, [loading, session])

  /* ── Sign-out: send back to landing from anywhere ── */
  useEffect(() => {
    if (!initializedRef.current) return
    if (!loading && !session) {
      setCurrentScreen('landing')
    }
  }, [session, loading])

  /* ── Show loading ring while auth resolves ── */
  if (loading || currentScreen === null) return <NexusAppLoading />

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
          onSuccess={() => setCurrentScreen('home')}
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
