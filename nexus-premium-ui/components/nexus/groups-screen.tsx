'use client'

import { TopHeader, BottomNav } from './navigation'
import { GroupCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { Plus, Beaker } from 'lucide-react'
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

      {/* DEV-ONLY: floating badge — always visible in this build for testing.
          Remove or re-gate before publishing to real users. */}
      <button
        onClick={() => onNavigate('dev-test')}
        style={{
          position: 'fixed',
          bottom: '90px',
          right: '16px',
          zIndex: 99999,
        }}
        className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-3 py-2 rounded-full shadow-2xl"
      >
        <Beaker className="w-3.5 h-3.5" />
        🧪 DEV TEST
      </button>

      <BottomNav
        activeTab="groups"
        onTabChange={(tab) => {
          if (tab !== 'groups') onNavigate(tab)
        }}
      />
    </div>
  )
}
