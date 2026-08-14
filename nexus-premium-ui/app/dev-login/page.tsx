'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  DEVELOPMENT BYPASS — REMOVE BEFORE PRODUCTION DEPLOYMENT
//
// Visits /dev-login to enter the premium onboarding/dashboard flow without
// going through Supabase auth. Useful when the Supabase email rate limit is
// hit or you need fast iteration on the authenticated UI.
//
// This page is ONLY reachable by manually navigating to /dev-login.
// It does not appear in any navigation, link, or auth redirect.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { OnboardingFlow } from '@/components/nexus/onboarding-flow'
import { Dashboard } from '@/components/nexus/dashboard'
import { GroupsScreen } from '@/components/nexus/groups-screen'
import { GroupDetail } from '@/components/nexus/group-detail'
import { ActivityScreen } from '@/components/nexus/activity-screen'
import { ProfileScreen } from '@/components/nexus/profile-screen'
import { WorldScreen } from '@/components/nexus/world-screen'

type DevScreen = 'onboarding' | 'home' | 'groups' | 'group-detail' | 'activity' | 'profile' | 'world'

export default function DevLoginPage() {
  // Allow ?screen=world (etc.) for direct navigation during dev/testing.
  const [screen, setScreen] = useState<DevScreen>(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('screen')
      if (q && ['home', 'groups', 'activity', 'profile', 'world'].includes(q)) {
        return q as DevScreen
      }
    }
    return 'onboarding'
  })
  const [selectedGroupId, setSelectedGroupId] = useState('1')
  const [prevScreen, setPrevScreen] = useState<DevScreen>('home')

  const navigate = (s: string) => setScreen(s as DevScreen)

  const goGroup = (id: string, from: DevScreen = 'home') => {
    setSelectedGroupId(id)
    setPrevScreen(from)
    setScreen('group-detail')
  }

  return (
    <div className="relative">
      {/* ── Dev banner — always visible, pointer-events disabled so it doesn't block taps ── */}
      <div
        className="fixed top-0 inset-x-0 z-[9999] bg-amber-500 text-black text-[10px] font-bold text-center py-1 tracking-widest select-none"
        style={{ pointerEvents: 'none' }}
      >
        ⚠ DEV BYPASS · /dev-login · NOT FOR PRODUCTION
      </div>

      {/* Offset content so the banner doesn't cover the top of each screen */}
      <div className="pt-6">
        {screen === 'onboarding' && (
          <OnboardingFlow
            onComplete={() => setScreen('home')}
            onBack={() => setScreen('onboarding')}
          />
        )}

        {screen === 'home' && (
          <Dashboard
            onGroupClick={(id) => goGroup(id, 'home')}
            onNavigate={navigate}
          />
        )}

        {screen === 'groups' && (
          <GroupsScreen
            onGroupClick={(id) => goGroup(id, 'groups')}
            onNavigate={navigate}
          />
        )}

        {screen === 'group-detail' && (
          <GroupDetail
            groupId={selectedGroupId}
            onBack={() => setScreen(prevScreen)}
            onViewGoldenWindow={() => setScreen('home')}
            onNavigate={navigate}
          />
        )}

        {screen === 'activity' && (
          <ActivityScreen
            onBack={() => setScreen('home')}
            onNavigate={navigate}
          />
        )}

        {screen === 'world' && <WorldScreen onNavigate={navigate} />}

        {screen === 'profile' && (
          <ProfileScreen
            onBack={() => setScreen('home')}
            onNavigate={navigate}
            onLogout={() => setScreen('onboarding')}
          />
        )}
      </div>
    </div>
  )
}
