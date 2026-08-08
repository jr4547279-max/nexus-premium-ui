'use client'

import { useState, useMemo } from 'react'
import { Search, X, Sparkles, Check, Clock, RefreshCw, Target, Heart } from 'lucide-react'
import { TopHeader, BottomNav } from './navigation'
import { GlassCard } from './glass-card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { mockActivity } from '@/lib/mock-data'
import { ACTIVITY_REGISTRY, searchActivities, getActivitiesById } from '@/lib/activities/registry'
import { ALL_CATEGORIES, CATEGORY_LABELS } from '@/lib/activities/types'
import type { ActivityCategory, ActivityDefinition } from '@/lib/activities/types'
import { useActivityPrefs } from '@/lib/activities/user-prefs'
import { ActivityPicker } from './activity-picker'

// ─── Activity notification feed (existing) ────────────────────────────────────

const feedIcons: Record<string, React.ReactNode> = {
  golden_window: <Sparkles className="w-4 h-4" />,
  confirmation: <Check className="w-4 h-4" />,
  reservation: <Clock className="w-4 h-4" />,
  sync: <RefreshCw className="w-4 h-4" />,
  alignment: <Target className="w-4 h-4" />,
}

const feedColors: Record<string, string> = {
  golden_window: 'bg-primary/20 text-primary',
  confirmation: 'bg-emerald-500/20 text-emerald-500',
  reservation: 'bg-amber-500/20 text-amber-500',
  sync: 'bg-blue-500/20 text-blue-500',
  alignment: 'bg-purple-500/20 text-purple-500',
}

interface FeedItemProps {
  activity: typeof mockActivity[number]
  index: number
  isLast: boolean
  animated?: boolean
}

function FeedItem({ activity, index, isLast, animated }: FeedItemProps) {
  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center z-10', feedColors[activity.type])}>
          {feedIcons[activity.type]}
        </div>
        {!isLast && <div className="w-px flex-1 bg-border/30 mt-1 mb-1 min-h-[12px]" />}
      </div>
      <div className={cn(
        'flex-1 min-w-0 pb-4',
        animated && 'animate-fade-in-up opacity-0',
        animated && `stagger-${index + 1}`
      )}>
        <div className="flex items-start justify-between gap-2 pt-1.5">
          <div className="min-w-0">
            <p className="font-medium text-sm leading-snug">{activity.title}</p>
            {activity.description && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{activity.description}</p>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground/70 shrink-0 pt-0.5 tabular-nums">{activity.time}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Activity explore card ────────────────────────────────────────────────────

interface ExploreCardProps {
  activity: ActivityDefinition
  onSelect: () => void
  onToggleFav: (e: React.MouseEvent) => void
  isFav: boolean
}

function ExploreCard({ activity, onSelect, onToggleFav, isFav }: ExploreCardProps) {
  const Icon = activity.Icon
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onSelect}
        className="w-full flex flex-col items-center gap-2.5 rounded-xl p-3 glass-card hover:scale-[1.03] active:scale-[0.97] transition-all duration-150 text-center cursor-pointer"
      >
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', activity.color.bg)}>
          <Icon className={cn('w-6 h-6', activity.color.text)} />
        </div>
        <div className="w-full">
          <p className="text-xs font-medium leading-tight">{activity.label}</p>
          <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
            {activity.plannerCapabilities.slice(0, 2).map((cap) => (
              <span
                key={cap}
                className="text-[9px] uppercase tracking-wide text-muted-foreground/60 font-medium"
              >
                {cap}
              </span>
            ))}
            {activity.plannerCapabilities.length > 2 && (
              <span className="text-[9px] text-muted-foreground/40">+{activity.plannerCapabilities.length - 2}</span>
            )}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onToggleFav}
        aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
        className={cn(
          'absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-150',
          'opacity-0 group-hover:opacity-100 focus:opacity-100',
          isFav && 'opacity-100',
          isFav ? 'text-rose-500 bg-rose-500/10' : 'text-muted-foreground hover:text-rose-500 bg-background/50'
        )}
      >
        <Heart className={cn('w-3 h-3', isFav && 'fill-rose-500')} />
      </button>
    </div>
  )
}

// ─── Activity detail stub ─────────────────────────────────────────────────────

interface ActivityDetailProps {
  activity: ActivityDefinition
  onClose: () => void
}

function ActivityDetail({ activity, onClose }: ActivityDetailProps) {
  const Icon = activity.Icon
  const { isFav, toggleFav } = useActivityPrefs()
  const fav = isFav(activity.id)

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <GlassCard className="w-full max-w-sm p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center', activity.color.bg)}>
              <Icon className={cn('w-7 h-7', activity.color.text)} />
            </div>
            <div>
              <h2 className="font-semibold text-base">{activity.label}</h2>
              <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[activity.category]}</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => toggleFav(activity.id)}
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                fav ? 'text-rose-500 bg-rose-500/10' : 'text-muted-foreground hover:text-rose-500 bg-muted/50'
              )}
            >
              <Heart className={cn('w-4 h-4', fav && 'fill-rose-500')} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground bg-muted/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Planner capability badges */}
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2 font-medium">Planner modules</p>
          <div className="flex flex-wrap gap-1.5">
            {activity.plannerCapabilities.map((cap) => (
              <span
                key={cap}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted/60 text-muted-foreground capitalize"
              >
                {cap}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/60 mt-2">
            Planner modules — routes, venues, weather, costs &amp; travel — coming soon.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Got it
        </button>
      </GlassCard>
    </div>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

interface ActivityScreenProps {
  onBack: () => void
  onNavigate: (screen: string) => void
}

export function ActivityScreen({ onBack: _onBack, onNavigate }: ActivityScreenProps) {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<ActivityCategory | null>(null)
  const [selectedActivity, setSelectedActivity] = useState<ActivityDefinition | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const { toggleFav, isFav } = useActivityPrefs()

  const recentIds = useMemo(() => {
    try {
      const raw = localStorage.getItem('nexus.activityPrefs')
      if (!raw) return []
      return (JSON.parse(raw) as { recents?: string[] }).recents ?? []
    } catch {
      return []
    }
  }, [])
  const recentActivities = useMemo(() => getActivitiesById(recentIds), [recentIds])

  const filteredActivities = useMemo(() => {
    const base = query ? searchActivities(query) : [...ACTIVITY_REGISTRY]
    if (!activeCategory) return base
    return base.filter((a) => a.category === activeCategory)
  }, [query, activeCategory])

  const today = mockActivity.slice(0, 4)
  const earlier = mockActivity.slice(4)

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopHeader
        title="Activity"
        showNotifications={false}
      />

      <main className="px-4 py-6 max-w-md mx-auto space-y-8">

        {/* ── Explore section ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
              Explore Activities
            </p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="text-[11px] text-primary font-medium hover:underline"
            >
              Browse all
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search activities…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 pr-8 bg-muted/40"
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Category pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 no-scrollbar mb-3">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={cn(
                'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all',
                activeCategory === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              )}
            >
              All
            </button>
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
                className={cn(
                  'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                  activeCategory === cat
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Recent row */}
          {!query && !activeCategory && recentActivities.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2 font-medium">
                Recent
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {recentActivities.map((a) => (
                  <div key={a.id} className="shrink-0 w-[72px]">
                    <div className="relative group">
                      <button
                        type="button"
                        onClick={() => setSelectedActivity(a)}
                        className="w-full flex flex-col items-center gap-1.5 rounded-xl p-2 glass-card hover:scale-[1.03] active:scale-[0.97] transition-all duration-150 text-center"
                      >
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', a.color.bg)}>
                          <a.Icon className={cn('w-5 h-5', a.color.text)} />
                        </div>
                        <span className="text-[11px] font-medium leading-tight">{a.label}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grid */}
          {filteredActivities.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {filteredActivities.map((activity) => (
                <ExploreCard
                  key={activity.id}
                  activity={activity}
                  onSelect={() => setSelectedActivity(activity)}
                  onToggleFav={(e) => { e.stopPropagation(); toggleFav(activity.id) }}
                  isFav={isFav(activity.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No activities match &ldquo;{query}&rdquo;
            </div>
          )}
        </section>

        {/* ── Notification feed ── */}
        <section>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4 font-medium">
            Today
          </p>
          <GlassCard className="px-4 pt-4 pb-0">
            {today.map((activity, i) => (
              <FeedItem
                key={activity.id}
                activity={activity}
                index={i}
                isLast={i === today.length - 1}
                animated
              />
            ))}
          </GlassCard>

          {earlier.length > 0 && (
            <div className="mt-6">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4 font-medium">
                Earlier
              </p>
              <GlassCard className="px-4 pt-4 pb-0">
                {earlier.map((activity, i) => (
                  <FeedItem
                    key={activity.id}
                    activity={activity}
                    index={i}
                    isLast={i === earlier.length - 1}
                  />
                ))}
              </GlassCard>
            </div>
          )}
        </section>

      </main>

      <BottomNav
        activeTab="activity"
        onTabChange={(tab) => {
          if (tab === 'home') onNavigate('home')
          if (tab === 'groups') onNavigate('groups')
          if (tab === 'profile') onNavigate('profile')
        }}
      />

      {/* Full-sheet picker (Browse all) */}
      <ActivityPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={() => setPickerOpen(false)}
      />

      {/* Activity detail overlay */}
      {selectedActivity && (
        <ActivityDetail
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
        />
      )}
    </div>
  )
}
