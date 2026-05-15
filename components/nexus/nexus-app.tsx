'use client'

import { useState } from 'react'
import { LandingPage } from './landing-page'
import { AuthScreen } from './auth-screen'
import { OnboardingFlow } from './onboarding-flow'
import { Dashboard } from './dashboard'
import { GroupDetail } from './group-detail'
import { GoldenWindowReveal } from './golden-window-reveal'
import { ActivityScreen } from './activity-screen'
import { ProfileScreen } from './profile-screen'

type Screen = 
  | 'landing' 
  | 'auth' 
  | 'onboarding' 
  | 'home' 
  | 'group-detail' 
  | 'golden-window' 
  | 'activity' 
  | 'profile'

export function NexusApp() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('landing')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('1')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false)

  const handleGetStarted = () => {
    setCurrentScreen('auth')
  }

  const handleLogin = () => {
    setCurrentScreen('auth')
  }

  const handleAuthSuccess = () => {
    setIsAuthenticated(true)
    if (!hasCompletedOnboarding) {
      setCurrentScreen('onboarding')
    } else {
      setCurrentScreen('home')
    }
  }

  const handleOnboardingComplete = () => {
    setHasCompletedOnboarding(true)
    setCurrentScreen('home')
  }

  const handleGroupClick = (groupId: string) => {
    setSelectedGroupId(groupId)
    setCurrentScreen('group-detail')
  }

  const handleNavigate = (screen: string) => {
    setCurrentScreen(screen as Screen)
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setCurrentScreen('landing')
  }

  const handleConfirmBooking = () => {
    // In a real app, this would trigger the booking flow
    setCurrentScreen('home')
  }

  // Render current screen
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
          onBack={() => setCurrentScreen('auth')}
        />
      )
    
    case 'home':
      return (
        <Dashboard 
          onGroupClick={handleGroupClick}
          onCreateGroup={() => {}}
          onNavigate={handleNavigate}
        />
      )
    
    case 'group-detail':
      return (
        <GroupDetail 
          groupId={selectedGroupId}
          onBack={() => setCurrentScreen('home')}
          onViewGoldenWindow={() => setCurrentScreen('golden-window')}
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
