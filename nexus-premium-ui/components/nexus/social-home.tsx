'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { TopHeader, BottomNav } from './navigation'
import { GlassCard, AvatarStack } from './glass-card'
import { GoldenRing } from './golden-ring'
import { useGroups } from '@/lib/use-groups'
import { mockGroups } from '@/lib/mock-data'
import { extractCity } from '@/lib/profile-service'
import { cn } from '@/lib/utils'
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Compass,
  MapPin,
  MessageCircle,
  MoreHorizontal,
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

const routeCards = [
  {
    id: 'brighton-pub-crawl',
    eyebrow: 'PUB CRAWL',
    title: 'Brighton after dark',
    meta: '6 stops · 2.1 mi · ~3h',
    detail: 'A ready-made night out with sensible walking legs.',
    icon: '🍻',
  },
  {
    id: 'seafront-sunset',
    eyebrow: 'WALK + FOOD',
    title: 'Seafront to sunset',
    meta: '4 stops · 1.8 mi · ~2h',
    detail: 'A slower route for catching up, wandering and eating.',
    icon: '🌅',
  },
  {
    id: 'old-town-loop',
    eyebrow: 'LOCAL ROUTE',
    title: 'Old Town loop',
    meta: '5 stops · 1.4 mi · ~2h',
    detail: 'Pubs, food and a simple route home at the end.',
    icon: '🗺️',
  },
]

const feedItems = [
  {
    name: 'Maya',
    handle: '@maya',
    initials: 'M',
    tone: 'bg-fuchsia-500/15 text-fuchsia-300',
    text: 'Nexus found a Friday window for our group. Finally no 47-message debate 😭',
    plan: 'Friday · 7:30 PM · Brighton',
    likes: 18,
    comments: 4,
  },
  {
    name: 'Alex',
    handle: '@alex',
    initials: 'A',
    tone: 'bg-cyan-500/15 text-cyan-300',
    text: 'Just saved this route for the next time everyone says “where should we go?”',
    route: 'Brighton after dark · 6 stops',
    likes: 11,
    comments: 2,
  },
]

export function SocialHome({ onGroupClick, onNavigate, onCreateGroup }: SocialHomeProps) {
  const { user, profile } = useAuth()
  const { groups: realGroups } = useGroups()
  const [idea, setIdea] = useState('')

  const groups = useMemo(
    () => (!realGroups || realGroups.length === 0 ? mockGroups : realGroups),
    [realGroups],
  )

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'there'
  const city = extractCity(profile?.formatted_address) || 'your area'

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
        {/* Social greeting */}
        <section>
          <p className="text-xs uppercase tracking-[0.22em] text-primary/80">Your social layer</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">What's happening, {displayName}?</h1>
          <p className="mt-1 text-sm text-muted-foreground">See what your people are doing, then make a plan without the organising headache.</p>
        </section>

        {/* Effortless planner */}
        <GlassCard glow className="relative overflow-hidden p-5">
          <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full border border-primary/20 opacity-70" />
          <div className="absolute -right-5 -top-7 h-24 w-24 rounded-full border border-primary/10" />
          <div className="relative">
            <div className="flex items-center gap-2 text-primary">
              <WandSparkles className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-[0.18em]">Plan it for me</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold">You bring the idea. Nexus does the organising.</h2>
            <p className="mt-2 max-w-[290px] text-xs leading-5 text-muted-foreground">Tell us roughly what you fancy. We’ll use the group, availability, location and preferences to work towards the best plan.</p>
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

        {/* Golden Window */}
        {groups.find((group) => group.hasGoldenWindow) && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-medium">A plan is ready</h2>
              </div>
              <span className="text-[10px] text-muted-foreground">AI matched</span>
            </div>
            <GlassCard
              glow
              hover
              onClick={() => onNavigate('golden-window')}
              className="p-4"
            >
              {(() => {
                const group = groups.find((item) => item.hasGoldenWindow)!
                return (
                  <div className="flex items-center gap-3">
                    <GoldenRing size="md" intensity="subtle" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{group.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{group.goldenWindow?.date} · {group.goldenWindow?.time}</p>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-emerald-400">
                        <Check className="h-3 w-3" /> Everyone aligned · ready to confirm
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                )
              })()}
            </GlassCard>
          </section>
        )}

        {/* Social feed */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium">From your people</h2>
              <p className="text-[10px] text-muted-foreground">Plans, routes and moments — not noise.</p>
            </div>
            <button onClick={() => onNavigate('social')} className="text-xs text-primary">See social</button>
          </div>
          <div className="space-y-3">
            {feedItems.map((item) => (
              <GlassCard key={item.handle} className="p-4">
                <div className="flex items-start gap-3">
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold', item.tone)}>{item.initials}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="ml-1.5 text-[10px] text-muted-foreground">{item.handle}</span>
                      </div>
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-foreground/80">{item.text}</p>
                    {(item.plan || item.route) && (
                      <div className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-3">
                        <div className="flex items-center gap-2 text-primary">
                          {item.plan ? <CalendarDays className="h-3.5 w-3.5" /> : <Compass className="h-3.5 w-3.5" />}
                          <span className="text-xs font-medium">{item.plan || item.route}</span>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
                      <span>♡ {item.likes}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {item.comments}</span>
                      <span className="ml-auto">Share</span>
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>

        {/* Routes */}
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-primary">Routes</p>
              <h2 className="mt-1 text-lg font-semibold">Plans that already exist</h2>
              <p className="mt-1 text-[10px] text-muted-foreground">Keep pub crawls and walking routes. Discover them socially.</p>
            </div>
            <button onClick={() => onNavigate('world')} className="text-xs text-primary">Explore</button>
          </div>
          <div className="space-y-2.5">
            {routeCards.map((route) => (
              <button
                key={route.id}
                onClick={() => onNavigate('world')}
                className="group flex w-full items-center gap-3 rounded-2xl border border-border/30 bg-card/40 p-3 text-left transition hover:border-primary/30 hover:bg-muted/20"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted/40 text-xl">{route.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-medium tracking-[0.18em] text-primary">{route.eyebrow}</p>
                  <p className="mt-0.5 text-sm font-medium">{route.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{route.meta}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:text-primary" />
              </button>
            ))}
          </div>
        </section>

        {/* Current groups */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium">Your circles</h2>
              <p className="text-[10px] text-muted-foreground">The people Nexus plans around.</p>
            </div>
            <button onClick={() => onNavigate('groups')} className="text-xs text-primary">All groups</button>
          </div>
          <div className="space-y-2">
            {groups.slice(0, 3).map((group) => (
              <GlassCard key={group.id} hover onClick={() => onGroupClick(group.id)} className="flex items-center gap-3 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/40 text-lg">{group.emoji}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{group.name}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{group.memberCount} people · {group.hasGoldenWindow ? 'plan ready' : 'needs a plan'}</p>
                </div>
                <AvatarStack avatars={group.members} max={3} size="sm" />
              </GlassCard>
            ))}
          </div>
        </section>

        {/* Local context */}
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
