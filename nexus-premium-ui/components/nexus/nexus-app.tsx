'use client'

import { useState } from 'react'
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

export function NexusApp() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('landing')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('1')
  const [prevGroupScreen, setPrevGroupScreen] = useState<Screen>('home')

  const handleGetStarted = () => {
    setCurrentScreen('onboarding')
  }

  const handleLogin = () => {
    setCurrentScreen('auth')
  }

  const handleAuthSuccess = () => {
    setCurrentScreen('home')
  }

  const handleOnboardingComplete = () => {
    setCurrentScreen('home')
  }

  const handleGroupClick = (groupId: string, from: Screen = 'home') => {
    setSelectedGroupId(groupId)
    setPrevGroupScreen(from)
    setCurrentScreen('group-detail')
  }

  const handleNavigate = (screen: string) => {
    setCurrentScreen(screen as Screen)
  }

  const handleLogout = () => {
    setCurrentScreen('landing')
  }

  const handleConfirmBooking = () => {
    setCurrentScreen('home')
  }

  switch (currentScreen) {
    case 'landing':
      return (
        <LandingPage
          onGetStarted={handleGetStarted}
          onLogin={handleLogin}
        />
      )

    case 'auth':
      return (
        <AuthScreen
          onBack={() => setCurrentScreen('landing')}
          onSuccess={handleAuthSuccess}
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
          onConfirm={handleConfirmBooking}
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
          onGetStarted={handleGetStarted}
          onLogin={handleLogin}
        />
      )
  }
}
