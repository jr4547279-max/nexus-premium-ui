'use client'

import { TopHeader, BottomNav } from './navigation'
import { GroupCard, GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { Plus, Beaker, RefreshCw, AlertCircle } from 'lucide-react'
import { useGroups } from '@/lib/use-groups'

interface GroupsScreenProps {
  onGroupClick: (groupId: string) => void
  onNavigate: (screen: string) => void
  onCreateGroup?: () => void
}

export function GroupsScreen({ onGroupClick, onNavigate, onCreateGroup }: GroupsScreenProps) {
  const { groups, loading, error, refresh } = useGroups()
  const hasGroups = !!groups?.length

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopHeader title="Groups" showNotifications={false} />

      <main className="px-4 py-6 max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {loading && groups === null ? 'Loading…' : `${groups?.length ?? 0} group${groups?.length === 1 ? '' : 's'}`}
          </p>
        </div>

        {error ? (
          <GlassCard className="mb-6 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-4 w-4 text-destructive" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">We couldn't load your groups</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Nexus couldn't reach your groups right now. No sample groups have been substituted.
                </p>
                <Button onClick={refresh} disabled={loading} variant="outline" className="mt-3 h-9 rounded-xl text-xs">
                  <RefreshCw className="mr-1.5 h-3 w-3" />
                  {loading ? 'Retrying…' : 'Try again'}
                </Button>
              </div>
            </div>
          </GlassCard>
        ) : loading && groups === null ? (
          <div className="space-y-2.5 mb-6" aria-label="Loading groups">
            {[1, 2].map((item) => (
              <div key={item} className="h-20 rounded-2xl border border-border/30 bg-card/40 animate-pulse" />
            ))}
          </div>
        ) : hasGroups ? (
          <div className="space-y-2.5 mb-6">
            {groups!.map((group) => (
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
        ) : (
          <GlassCard glow className="mb-6 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Your circles start here</h2>
            <p className="mx-auto mt-2 max-w-[280px] text-xs leading-5 text-muted-foreground">
              Create your first group and Nexus can start finding the moments when everyone is free.
            </p>
          </GlassCard>
        )}

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
