'use client'

import { TopHeader, BottomNav } from './navigation'
import { GroupCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { mockGroups } from '@/lib/mock-data'
import { useGroups } from '@/lib/use-groups'

interface GroupsScreenProps {
  onGroupClick: (groupId: string) => void
  onNavigate: (screen: string) => void
  onCreateGroup?: () => void
}

export function GroupsScreen({ onGroupClick, onNavigate, onCreateGroup }: GroupsScreenProps) {
  const { groups: realGroups, loading } = useGroups()
  const showRealGroups = !loading && realGroups !== null && realGroups.length > 0
  const groupsToShow = showRealGroups ? realGroups! : mockGroups

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopHeader title="Groups" showNotifications={false} />

      <main className="px-4 py-6 max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${groupsToShow.length} group${groupsToShow.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="space-y-2.5 mb-6">
          {groupsToShow.map((group) => (
            <GroupCard
              key={group.id}
              name={group.name}
              emoji={group.emoji}
              memberCount={group.memberCount}
              members={group.members}
              pendingCount={group.pendingConfirmations}
              hasGoldenWindow={group.hasGoldenWindow}
              onClick={() => onGroupClick(group.id)}
            />
          ))}
        </div>

        <Button
          onClick={() => (onCreateGroup ? onCreateGroup() : undefined)}
          className="w-full h-10 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl text-sm"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Create New Group
        </Button>
      </main>

      <BottomNav
        activeTab="groups"
        onTabChange={(tab) => {
          if (tab === 'home') onNavigate('home')
          if (tab === 'activity') onNavigate('activity')
          if (tab === 'profile') onNavigate('profile')
        }}
      />
    </div>
  )
}
