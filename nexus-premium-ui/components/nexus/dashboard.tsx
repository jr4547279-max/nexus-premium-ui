'use client'

import { SocialHome } from './social-home'

interface DashboardProps {
  onGroupClick: (groupId: string) => void
  onNavigate: (screen: string) => void
  onCreateGroup?: () => void
}

/**
 * Nexus home is intentionally social-first.
 * The old dashboard was utility-first; the product now leads with people,
 * plans and discoverable routes while keeping Golden Window as the engine.
 */
export function Dashboard({ onGroupClick, onNavigate, onCreateGroup }: DashboardProps) {
  return (
    <SocialHome
      onGroupClick={onGroupClick}
      onNavigate={onNavigate}
      onCreateGroup={onCreateGroup}
    />
  )
}
