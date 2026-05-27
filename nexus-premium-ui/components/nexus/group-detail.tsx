'use client'

import { useEffect, useState } from 'react'
import { TopHeader } from './navigation'
import { GlassCard, AvatarStack, StatBadge } from './glass-card'
import { GoldenRing } from './golden-ring'
import { Button } from '@/components/ui/button'
import {
  Calendar, MapPin, ChevronRight, Sparkles,
  Clock, Check, AlertCircle, Plus, Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockGroups } from '@/lib/mock-data'
import {
  getGroup,
  listGroupMembers,
  type Group,
  type GroupMember,
} from '@/lib/group-service'
import { InviteMemberModal } from './invite-member-modal'

interface GroupDetailProps {
  groupId: string
  onBack: () => void
  onViewGoldenWindow: () => void
  onNavigate?: (screen: string) => void
}

/**
 * Detect a UUID — real groups created via Supabase have UUID ids, mock groups
 * use short numeric ids like "1", "2". Anything that isn't a UUID is treated
 * as a mock id for the legacy demo data.
 */
function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

function avatarFor(member: GroupMember) {
  const seed = member.display_name || member.email || member.user_id
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}`
}

function displayNameFor(member: GroupMember) {
  return member.display_name || member.email?.split('@')[0] || 'Member'
}

export function GroupDetail({ groupId, onBack, onViewGoldenWindow, onNavigate }: GroupDetailProps) {
  const realMode = isUuid(groupId)
  const mockGroup = mockGroups.find((g) => g.id === groupId) || mockGroups[0]

  const [activeSection, setActiveSection] = useState<'members' | 'preferences'>('members')
  const [inviteOpen, setInviteOpen] = useState(false)

  const [realGroup, setRealGroup] = useState<Group | null>(null)
  const [realMembers, setRealMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(realMode)

  useEffect(() => {
    if (!realMode) return
    let cancelled = false
    setLoading(true)
    Promise.all([getGroup(groupId), listGroupMembers(groupId)]).then(([g, m]) => {
      if (cancelled) return
      setRealGroup(g)
      setRealMembers(m)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [groupId, realMode])

  // Derived view-model: same shape regardless of real vs mock.
  const name = realMode ? realGroup?.name ?? 'Loading…' : mockGroup.name
  const emoji = realMode ? realGroup?.emoji ?? '👥' : mockGroup.emoji
  const memberCount = realMode ? realMembers.length : mockGroup.memberCount
  const inviteCode = realMode ? realGroup?.invite_code ?? null : null

  const avatars = realMode
    ? realMembers.map((m) => ({
        id: m.user_id,
        name: displayNameFor(m),
        avatar: avatarFor(m),
        synced: false,
      }))
    : mockGroup.members

  // Golden Window / preferences / sync indicators stay mock-only for now.
  const showGoldenWindow = !realMode && mockGroup.hasGoldenWindow && mockGroup.goldenWindow

  return (
    <div className="min-h-screen bg-background pb-8">
      <TopHeader
        title={name}
        showBack
        onBack={onBack}
        showNotifications={false}
      />

      <main className="px-4 py-6 max-w-md mx-auto">
        {/* Group Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center text-3xl">
            {emoji}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-medium">{name}</h1>
            <p className="text-muted-foreground">
              {loading ? 'Loading members…' : `${memberCount} member${memberCount === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            onClick={() => onNavigate?.('profile')}
            className="p-2 rounded-full hover:bg-muted/50 transition-colors"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Golden Window Banner (mock-only for now) */}
        {showGoldenWindow && mockGroup.goldenWindow && (
          <GlassCard
            glow
            className="mb-6 p-5 cursor-pointer"
            onClick={onViewGoldenWindow}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary font-medium">Golden Window Found ✨</span>
              </div>
              <span className="text-xs px-2 py-1 bg-primary/20 text-primary rounded-full">
                BEST MATCH
              </span>
            </div>

            <div className="flex items-center gap-4">
              <GoldenRing size="md" intensity="normal" />
              <div className="flex-1">
                <p className="text-2xl font-bold">{mockGroup.goldenWindow.time}</p>
                <p className="text-muted-foreground">{mockGroup.goldenWindow.date}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {mockGroup.goldenWindow.duration} • {mockGroup.goldenWindow.time} - {mockGroup.goldenWindow.endTime}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>

            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/30">
              <AvatarStack avatars={mockGroup.members} max={5} showSyncStatus />
              <div className="flex items-center gap-1 text-emerald-500 text-sm">
                <Check className="w-4 h-4" />
                <span>All {mockGroup.memberCount} are free</span>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Stats Row */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <StatBadge
            label="members"
            value={`${memberCount}`}
            variant="default"
            icon={<Calendar className="w-3 h-3" />}
          />
          {!realMode && mockGroup.goldenWindow && (
            <>
              <StatBadge
                label="confidence"
                value={`${mockGroup.goldenWindow.confidence}%`}
                variant="gold"
                icon={<Sparkles className="w-3 h-3" />}
              />
              <StatBadge
                label="avg travel"
                value={`${mockGroup.goldenWindow.avgTravelTime}min`}
                variant="default"
                icon={<Clock className="w-3 h-3" />}
              />
            </>
          )}
        </div>

        {/* Section Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveSection('members')}
            className={cn(
              'flex-1 py-3 rounded-xl text-sm font-medium transition-all',
              activeSection === 'members'
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'bg-muted/30 text-muted-foreground'
            )}
          >
            Members
          </button>
          <button
            onClick={() => setActiveSection('preferences')}
            className={cn(
              'flex-1 py-3 rounded-xl text-sm font-medium transition-all',
              activeSection === 'preferences'
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'bg-muted/30 text-muted-foreground'
            )}
          >
            Preferences
          </button>
        </div>

        {/* Members List */}
        {activeSection === 'members' && (
          <div className="space-y-3">
            {realMode
              ? realMembers.map((m) => (
                  <GlassCard key={m.user_id} className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img
                          src={avatarFor(m)}
                          alt={displayNameFor(m)}
                          className="w-12 h-12 rounded-full bg-muted"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{displayNameFor(m)}</p>
                        <p className="text-sm text-muted-foreground capitalize">{m.role}</p>
                      </div>
                    </div>
                  </GlassCard>
                ))
              : mockGroup.members.map((member) => (
                  <GlassCard key={member.id} className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img
                          src={member.avatar}
                          alt={member.name}
                          className="w-12 h-12 rounded-full"
                        />
                        <span className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background',
                          member.synced ? 'bg-emerald-500' : 'bg-amber-500'
                        )} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{member.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {member.synced ? 'Calendar synced' : 'Pending sync'}
                        </p>
                      </div>
                      {member.synced ? (
                        <div className="flex items-center gap-1 text-emerald-500 text-xs">
                          <Check className="w-4 h-4" />
                          <span>Ready</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-500 text-xs">
                          <AlertCircle className="w-4 h-4" />
                          <span>Pending</span>
                        </div>
                      )}
                    </div>
                  </GlassCard>
                ))}

            <Button
              variant="outline"
              onClick={() => setInviteOpen(true)}
              className="w-full h-12 border-dashed border-border/50 text-muted-foreground"
            >
              <Plus className="w-4 h-4 mr-2" />
              Invite Member
            </Button>
          </div>
        )}

        {/* Shared Preferences */}
        {activeSection === 'preferences' && (
          <div className="space-y-3">
            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="font-medium">Budget</span>
                </div>
                <span className="text-muted-foreground text-sm">££ (£20-30 per person)</span>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h3V3H3zm6 0v18h3V3H9zm6 0v18h3V3h-3z" />
                    </svg>
                  </div>
                  <span className="font-medium">Food preferences</span>
                </div>
                <span className="text-muted-foreground text-sm">Italian, Vegan options</span>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-medium">Maximum travel time</span>
                </div>
                <span className="text-muted-foreground text-sm">20 min</span>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-medium">Preferred days</span>
                </div>
                <span className="text-muted-foreground text-sm">Fri, Sat, Sun</span>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  </div>
                  <span className="font-medium">Preferred times</span>
                </div>
                <span className="text-muted-foreground text-sm">Evenings</span>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Find Window Button — mock groups only */}
        {!realMode && !mockGroup.hasGoldenWindow && (
          <Button
            onClick={onViewGoldenWindow}
            className="w-full h-14 mt-6 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl glow-gold"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Find Golden Window
          </Button>
        )}
      </main>

      <InviteMemberModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        groupName={name}
        inviteCode={inviteCode}
      />
    </div>
  )
}
