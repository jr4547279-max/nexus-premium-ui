'use client'

import { useState, useMemo } from 'react'
import { Search, X, Plus, Heart, ChevronRight } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ACTIVITY_REGISTRY,
  searchActivities,
  getActivitiesById,
} from '@/lib/activities/registry'
import {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
} from '@/lib/activities/types'
import type { ActivityCategory, ActivityDefinition, AnyActivity } from '@/lib/activities/types'
import { useActivityPrefs } from '@/lib/activities/user-prefs'

interface ActivityCardProps {
  activity: ActivityDefinition
  onSelect: () => void
  onToggleFav: (e: React.MouseEvent) => void
  isFav: boolean
  compact?: boolean
}

export function ActivityCard({ activity, onSelect, onToggleFav, isFav, compact }: ActivityCardProps) {
  const Icon = activity.Icon
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'w-full flex flex-col items-center gap-2 rounded-xl p-3 transition-all duration-150',
          'glass-card hover:scale-[1.03] active:scale-[0.97] cursor-pointer text-center',
          compact && 'p-2 gap-1.5'
        )}
      >
        <div className={cn(
          'rounded-xl flex items-center justify-center transition-transform',
          activity.color.bg,
          compact ? 'w-10 h-10' : 'w-12 h-12'
        )}>
          <Icon className={cn(
            activity.color.text,
            compact ? 'w-5 h-5' : 'w-6 h-6'
          )} />
        </div>
        <span className={cn(
          'font-medium leading-tight',
          compact ? 'text-[11px]' : 'text-xs'
        )}>
          {activity.label}
        </span>
      </button>

      <button
        type="button"
        onClick={onToggleFav}
        aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
        className={cn(
          'absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150',
          'opacity-0 group-hover:opacity-100 focus:opacity-100',
          isFav && 'opacity-100',
          isFav
            ? 'text-rose-500 bg-rose-500/10'
            : 'text-muted-foreground hover:text-rose-500 bg-background/50'
        )}
      >
        <Heart className={cn('w-3 h-3', isFav && 'fill-rose-500')} />
      </button>
    </div>
  )
}

interface HorizontalStripProps {
  title: string
  activities: ActivityDefinition[]
  onSelect: (a: ActivityDefinition) => void
  onToggleFav: (id: string) => void
  isFav: (id: string) => boolean
}

function HorizontalStrip({ title, activities, onSelect, onToggleFav, isFav }: HorizontalStripProps) {
  if (activities.length === 0) return null
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2 font-medium px-1">
        {title}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {activities.map((a) => (
          <div key={a.id} className="shrink-0 w-[72px]">
            <ActivityCard
              activity={a}
              onSelect={() => onSelect(a)}
              onToggleFav={(e) => { e.stopPropagation(); onToggleFav(a.id) }}
              isFav={isFav(a.id)}
              compact
            />
          </div>
        ))}
      </div>
    </div>
  )
}

interface ActivityPickerContentProps {
  onSelect: (activity: AnyActivity) => void
  compact?: boolean
}

export function ActivityPickerContent({ onSelect, compact }: ActivityPickerContentProps) {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<ActivityCategory | null>(null)
  const [showCustom, setShowCustom] = useState(false)
  const [customLabel, setCustomLabel] = useState('')

  const { recents, favourites, addRecent, toggleFav, isFav } = useActivityPrefs()

  const recentActivities = useMemo(() => getActivitiesById(recents), [recents])
  const favouriteActivities = useMemo(() => getActivitiesById(favourites), [favourites])

  const filteredActivities = useMemo(() => {
    const base = query ? searchActivities(query) : [...ACTIVITY_REGISTRY]
    if (!activeCategory) return base
    return base.filter((a) => a.category === activeCategory)
  }, [query, activeCategory])

  const handleSelect = (activity: ActivityDefinition) => {
    addRecent(activity.id)
    onSelect(activity)
  }

  const handleCustomSubmit = () => {
    const label = (customLabel || query).trim()
    if (!label) return
    onSelect({ id: 'custom', label, emoji: '✨', isCustom: true })
    setCustomLabel('')
    setShowCustom(false)
  }

  const showStrips = !query && !activeCategory

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search activities…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 pr-8"
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

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={cn(
            'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all duration-150',
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
              'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 whitespace-nowrap',
              activeCategory === cat
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted'
            )}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {showStrips && (
        <div className="flex flex-col gap-4">
          <HorizontalStrip
            title="Recent"
            activities={recentActivities}
            onSelect={handleSelect}
            onToggleFav={toggleFav}
            isFav={isFav}
          />
          <HorizontalStrip
            title="Favourites"
            activities={favouriteActivities}
            onSelect={handleSelect}
            onToggleFav={toggleFav}
            isFav={isFav}
          />
        </div>
      )}

      <div>
        {showStrips && (
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2 font-medium px-1">
            All activities
          </p>
        )}
        {filteredActivities.length > 0 ? (
          <div className={cn(
            'grid gap-2',
            compact ? 'grid-cols-4' : 'grid-cols-3'
          )}>
            {filteredActivities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                onSelect={() => handleSelect(activity)}
                onToggleFav={(e) => { e.stopPropagation(); toggleFav(activity.id) }}
                isFav={isFav(activity.id)}
              />
            ))}

            {!query && !showCustom && (
              <button
                type="button"
                onClick={() => setShowCustom(true)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl p-3',
                  'border-2 border-dashed border-border/60 hover:border-primary/50',
                  'text-muted-foreground hover:text-foreground transition-all duration-150',
                  'cursor-pointer'
                )}
              >
                <div className="w-12 h-12 rounded-xl bg-muted/40 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium">Custom</span>
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No activities match &ldquo;{query}&rdquo;
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className="block mx-auto mt-2 text-primary text-xs hover:underline"
            >
              Add &ldquo;{query}&rdquo; as custom activity
            </button>
          </div>
        )}
      </div>

      {showCustom && (
        <div className="glass-card rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs font-medium">Custom activity</p>
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder={query || 'e.g. Axe Throwing'}
              value={customLabel || query}
              onChange={(e) => setCustomLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleCustomSubmit() }
                if (e.key === 'Escape') { setShowCustom(false); setCustomLabel('') }
              }}
              className="flex-1 text-sm"
            />
            <Button size="sm" onClick={handleCustomSubmit} disabled={!(customLabel || query).trim()}>
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowCustom(false); setCustomLabel('') }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface ActivityPickerProps {
  open: boolean
  onClose?: () => void
  onOpenChange?: (open: boolean) => void
  onSelect: (activity: AnyActivity) => void
}

export function ActivityPicker({ open, onClose, onOpenChange, onSelect }: ActivityPickerProps) {
  const setOpen = (nextOpen: boolean) => {
    onOpenChange?.(nextOpen)
    if (!nextOpen) onClose?.()
  }

  const handleSelect = (activity: AnyActivity) => {
    onSelect(activity)
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] flex flex-col rounded-t-2xl px-0 pb-0"
      >
        <SheetHeader className="px-5 pb-2 shrink-0">
          <SheetTitle className="text-base">Choose an Activity</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-8">
          <ActivityPickerContent onSelect={handleSelect} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

interface ActivityBadgeProps {
  activity: AnyActivity
  onClear?: () => void
  onClick?: () => void
  className?: string
}

export function ActivityBadge({ activity, onClear, onClick, className }: ActivityBadgeProps) {
  const def = 'isCustom' in activity
    ? null
    : activity as ActivityDefinition

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
        'glass-card hover:scale-[1.02]',
        className
      )}
    >
      {def ? (
        <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0', def.color.bg)}>
          <def.Icon className={cn('w-3.5 h-3.5', def.color.text)} />
        </div>
      ) : (
        <span className="text-base">{activity.emoji}</span>
      )}
      <span className="flex-1 text-left">{activity.label}</span>
      {onClick && !onClear && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      {onClear && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onClear() }}
          onKeyDown={(e) => e.key === 'Enter' && onClear()}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </span>
      )}
    </button>
  )
}
