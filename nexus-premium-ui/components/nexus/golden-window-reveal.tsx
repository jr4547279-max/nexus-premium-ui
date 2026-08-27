'use client'

import { useEffect, useState } from 'react'
import { NexusLogoAnimated } from './nexus-logo'
import { TopHeader } from './navigation'
import { GlassCard } from './glass-card'
import { GoldenRing, OrbitalBackground } from './golden-ring'
import { Button } from '@/components/ui/button'
import { Sparkles, Check, Clock, RefreshCw, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getGroup, listGroupMembers, type Group, type GroupMember } from '@/lib/group-service'
import { loadSavedGoldenWindow } from '@/lib/golden-window-persistence'
import { dayLabel, formatDuration, formatTime12h, type GoldenWindow } from '@/lib/golden-window'

interface GoldenWindowRevealProps {
  groupId?: string
  onBack: () => void
  onConfirm: () => void
}

function LoadingScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <OrbitalBackground className="min-h-screen flex flex-col">
        <TopHeader title="" showBack onBack={onBack} showNotifications={false} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-8">
          <div className="float">
            <NexusLogoAnimated className="w-44 h-44" />
          </div>
          <div>
            <p className="text-sm text-foreground">Loading the real Golden Window</p>
            <p className="mt-2 text-xs text-muted-foreground">Reading this group's saved availability result.</p>
          </div>
        </div>
      </OrbitalBackground>
    </div>
  )
}

function EmptyState({ onBack, message }: { onBack: () => void; message: string }) {
  return (
    <div className="min-h-screen bg-background">
      <OrbitalBackground className="min-h-screen">
        <TopHeader title="" showBack onBack={onBack} showNotifications={false} />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <GlassCard className="p-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted/40">
              <Sparkles className="h-6 w-6 text-muted-foreground" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">No Golden Window yet</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
            <Button onClick={onBack} className="mt-5 rounded-xl">Back to group</Button>
          </GlassCard>
        </main>
      </OrbitalBackground>
    </div>
  )
}

function ErrorState({ onBack, onRetry, message }: { onBack: () => void; onRetry: () => void; message: string }) {
  return (
    <div className="min-h-screen bg-background">
      <OrbitalBackground className="min-h-screen">
        <TopHeader title="" showBack onBack={onBack} showNotifications={false} />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <GlassCard className="p-6">
            <h1 className="text-lg font-semibold">Couldn't load this window</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
            <div className="mt-5 flex gap-2 justify-center">
              <Button variant="outline" onClick={onBack} className="rounded-xl">Back</Button>
              <Button onClick={onRetry} className="rounded-xl">Try again</Button>
            </div>
          </GlassCard>
        </main>
      </OrbitalBackground>
    </div>
  )
}

function ResultsScreen({
  group,
  members,
  goldenWindow,
  stale,
  onBack,
  onContinue,
}: {
  group: Group
  members: GroupMember[]
  goldenWindow: GoldenWindow
  stale: boolean
  onBack: () => void
  onContinue: () => void
}) {
  const time = formatTime12h(goldenWindow.start_time)
  const end = formatTime12h(goldenWindow.end_time)
  const qualityLabel = goldenWindow.match_quality === 'perfect'
    ? 'Perfect alignment'
    : goldenWindow.match_quality === 'strong'
      ? 'Strong alignment'
      : goldenWindow.match_quality === 'partial'
        ? 'Partial alignment'
        : 'Compromise window'

  return (
    <div className="min-h-screen bg-background">
      <OrbitalBackground className="min-h-screen">
        <TopHeader title="" showBack onBack={onBack} showNotifications={false} />
        <main className="px-4 py-4 max-w-md mx-auto pb-8">
          <div className="text-center mb-5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 rounded-full mb-3">
              <Sparkles className="w-3 h-3 text-primary" />
              <span className="text-xs text-primary font-medium">Golden Window</span>
            </div>
            <h1 className="text-xl font-semibold">{group.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">Calculated from this group's real availability.</p>
          </div>

          <GlassCard glow className="p-4 text-center relative overflow-hidden">
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-primary/20 text-primary text-[10px] font-semibold rounded-full tracking-wide">
              {qualityLabel}
            </div>

            <div className="flex justify-center my-6">
              <div className="relative">
                <GoldenRing size="lg" intensity="intense" showInnerRing />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-widest mb-0.5">
                    {dayLabel(goldenWindow.day_of_week, goldenWindow.days_until)}
                  </span>
                  <span className="text-2xl font-bold leading-none">{time.split(' ')[0]}</span>
                  <span className="text-sm font-light text-muted-foreground mt-0.5">{time.split(' ')[1]}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-4">
              <Clock className="w-3 h-3" />
              <span>{formatDuration(goldenWindow.duration_minutes)} window · ends {end}</span>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-emerald-500">
              <Check className="w-3 h-3" />
              {goldenWindow.available_member_count} of {goldenWindow.total_member_count} members aligned
            </div>
          </GlassCard>

          <div className="grid grid-cols-3 gap-2 my-4">
            <GlassCard className="p-3 text-center">
              <div className="text-lg font-bold text-primary">{goldenWindow.confidence_score}%</div>
              <div className="text-[10px] text-muted-foreground">Confidence</div>
            </GlassCard>
            <GlassCard className="p-3 text-center">
              <div className="text-lg font-bold text-emerald-500">{goldenWindow.fairness_score}%</div>
              <div className="text-[10px] text-muted-foreground">Fairness</div>
            </GlassCard>
            <GlassCard className="p-3 text-center">
              <div className="text-lg font-bold">{goldenWindow.available_member_count}/{goldenWindow.total_member_count}</div>
              <div className="text-[10px] text-muted-foreground">Aligned</div>
            </GlassCard>
          </div>

          {goldenWindow.compromise_note && (
            <GlassCard className="mb-4 p-4">
              <p className="text-xs leading-5 text-muted-foreground">{goldenWindow.compromise_note}</p>
            </GlassCard>
          )}

          <GlassCard className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Real group members</p>
            </div>
            <div className="mt-3 space-y-2">
              {members.map((member) => (
                <div key={member.user_id} className="flex items-center justify-between text-xs">
                  <span>{member.display_name || member.email || 'Group member'}</span>
                  <span className={cn(
                    'text-[10px]',
                    goldenWindow.available_member_ids.includes(member.user_id) ? 'text-emerald-500' : 'text-muted-foreground',
                  )}>
                    {goldenWindow.available_member_ids.includes(member.user_id) ? 'Aligned' : 'Not aligned'}
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>

          <div className="mt-4 space-y-2">
            {stale && (
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-amber-400">
                <RefreshCw className="h-3 w-3" /> This saved result is marked stale.
              </div>
            )}
            <Button
              onClick={onContinue}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium"
            >
              Continue
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              Nexus has not invented a venue or booking. Those come later from real place data.
            </p>
          </div>
        </main>
      </OrbitalBackground>
    </div>
  )
}

export function GoldenWindowReveal({ groupId, onBack, onConfirm }: GoldenWindowRevealProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [goldenWindow, setGoldenWindow] = useState<GoldenWindow | null>(null)
  const [stale, setStale] = useState(false)

  const load = async () => {
    if (!groupId) {
      setError('No group was selected.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [groupResult, memberResult, windowResult] = await Promise.all([
        getGroup(groupId),
        listGroupMembers(groupId),
        loadSavedGoldenWindow(groupId),
      ])

      if (!groupResult) {
        setError('This group could not be found. Nothing has been substituted.')
        return
      }

      setGroup(groupResult)
      setMembers(memberResult)
      setGoldenWindow(windowResult.window)
      setStale(windowResult.isStale)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the Golden Window.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [groupId])

  if (loading) return <LoadingScreen onBack={onBack} />
  if (error) return <ErrorState onBack={onBack} onRetry={load} message={error} />
  if (!group) return <EmptyState onBack={onBack} message="The selected group is no longer available." />
  if (!goldenWindow) {
    return (
      <EmptyState
        onBack={onBack}
        message="This group does not have enough real availability data to calculate a Golden Window yet. Add availability for the group members and try again."
      />
    )
  }

  return (
    <ResultsScreen
      group={group}
      members={members}
      goldenWindow={goldenWindow}
      stale={stale}
      onBack={onBack}
      onContinue={onConfirm}
    />
  )
}
