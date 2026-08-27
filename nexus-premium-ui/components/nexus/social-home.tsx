'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { TopHeader, BottomNav } from './navigation'
import { GlassCard, AvatarStack } from './glass-card'
import { GoldenRing } from './golden-ring'
import { useGroups } from '@/lib/use-groups'
import { extractCity } from '@/lib/profile-service'
import { cn } from '@/lib/utils'
import {
  ArrowRight,
  Check,
  MapPin,
  Plus,
  Sparkles,
  Users,
  WandSparkles,
} from 'lucide-react'

interface SocialHomeProps {
  onGroupClick: (groupId: string) => void
  onNavigate: (screen: string) => void
  onCreateGroup?: () => void
}

export function SocialHome({ onGroupClick, onNavigate, onCreateGroup }: SocialHomeProps) {
  const { user, profile } = useAuth()
  const { groups, loading, error, refresh } = useGroups()
  const [idea, setIdea] = useState('')

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'there'
  const city = extractCity(profile?.formatted_address) || 'your area'
  const realGroups = groups ?? []
  const readyGroup = realGroups.find((group) => group.hasGoldenWindow)

  const startPlanning = () => {
    if (onCreateGroup) onCreateGroup()
    else onNavigate('groups')
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopHeader
        title="Nexus"
        userInitial={(displayName[0] || 'N').toUpperCase()}
        onAvatarClick={() => onNavigate('profile')}
        showNotifications
      />

      <main className="mx-auto max-w-md px-4 py-4 space-y-5">
        <section>
          <p className="text-xs uppercase tracking-[0.22em] text-primary/80">Your social layer</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">What's happening, {displayName}?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bring your people together and let Nexus work out the practical details.
          </p>
        </section>

        <GlassCard glow className="relative overflow-hidden p-5">
          <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full border border-primary/20 opacity-70" />
          <div className="absolute -right-5 -top-7 h-24 w-24 rounded-full border border-primary/10" />
          <div className="relative">
            <div className="flex items-center gap-2 text-primary">
              <WandSparkles className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-[0.18em]">Plan it for me</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold">You bring the idea. Nexus does the organising.</h2>
            <p className="mt-2 max-w-[290px] text-xs leading-5 text-muted-foreground">
              Start with the group and activity. Nexus will use the real group data available to it as the planning engine grows.
            </p>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {['Pub night', 'Dinner', 'Walk', 'Something new'].map((option) => (
                <button
                  key={option}
                  onClick={() => setIdea(option)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors',
                    idea === option
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-border/40 bg-muted/20 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={startPlanning}
                className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                {idea ? `Plan ${idea.toLowerCase()}` : 'Start a plan'}
                <ArrowRight className="ml-1.5 inline h-4 w-4" />
              </button>
              <button
                onClick={() => onNavigate('groups')}
                className="rounded-xl border border-border/40 bg-muted/20 px-3 text-muted-foreground hover:text-foreground"
                aria-label="View groups"
              >
                <Users className="h-4 w-4" />
              </button>
            </div>
          </div>
        </GlassCard>

        {readyGroup && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-medium">A Golden Window is ready</h2>
              </div>
              <span className="text-[10px] text-muted-foreground">Saved for this group</span>
            </div>
            <GlassCard
              glow
              hover
              onClick={() => onGroupClick(readyGroup.id)}
              className="p-4"
            >
              <div className="flex items-center gap-3">
                <GoldenRing size="md" intensity="subtle" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{readyGroup.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {readyGroup.memberCount} {readyGroup.memberCount === 1 ? 'member' : 'members'} · real availability data
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-emerald-400">
                    <Check className="h-3 w-3" /> Window available to review
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </GlassCard>
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium">Your circles</h2>
              <p className="text-[10px] text-muted-foreground">Only groups returned from Supabase appear here.</p>
            </div>
            <button onClick={() => onNavigate('groups')} className="text-xs text-primary">All groups</button>
          </div>

          {loading && (
            <GlassCard className="p-4">
              <div className="h-4 w-32 animate-pulse rounded bg-muted/50" />
              <div className="mt-2 h-3 w-48 animate-pulse rounded bg-muted/30" />
            </GlassCard>
          )}

          {!loading && error && (
            <GlassCard className="p-4">
              <p className="text-sm font-medium">Your groups couldn't be loaded.</p>
              <p className="mt-1 text-xs text-muted-foreground">Nexus won't substitute demo groups for real data.</p>
              <button onClick={() => refresh()} className="mt-3 text-xs text-primary">Try again</button>
            </GlassCard>
          )}

          {!loading && !error && realGroups.length === 0 && (
            <GlassCard className="p-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="mt-3 text-sm font-medium">Your circles start here</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Create a group or join one with an invite. Real members will appear here once they exist.
              </p>
              <button
                onClick={startPlanning}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Create a group
              </button>
            </GlassCard>
          )}

          {!loading && !error && realGroups.length > 0 && (
            <div className="space-y-2">
              {realGroups.slice(0, 3).map((group) => (
                <GlassCard key={group.id} hover onClick={() => onGroupClick(group.id)} className="flex items-center gap-3 p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/40 text-lg">{group.emoji}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{group.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {group.memberCount} {group.memberCount === 1 ? 'person' : 'people'} · {group.hasGoldenWindow ? 'window ready' : 'needs a plan'}
                    </p>
                  </div>
                  {group.members.length > 0 && <AvatarStack avatars={group.members} max={3} size="sm" />}
                </GlassCard>
              ))}
            </div>
          )}
        </section>

        <div className="flex items-center justify-center gap-2 pb-2 text-[10px] text-muted-foreground">
          <MapPin className="h-3 w-3 text-primary" />
          <span>Planning around {city}</span>
          <span>·</span>
          <button onClick={() => onNavigate('profile')} className="text-primary">Change</button>
        </div>
      </main>

      <BottomNav
        activeTab="home"
        onTabChange={(tab) => {
          if (tab !== 'home') onNavigate(tab)
        }}
      />
    </div>
  )
}
