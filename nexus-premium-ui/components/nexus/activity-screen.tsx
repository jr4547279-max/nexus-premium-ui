'use client'

import { TopHeader, BottomNav } from './navigation'
import { GlassCard } from './glass-card'
import { 
  Sparkles, Check, Clock, RefreshCw, Target
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockActivity } from '@/lib/mock-data'

interface ActivityScreenProps {
  onBack: () => void
  onNavigate: (screen: string) => void
}

const activityIcons: Record<string, React.ReactNode> = {
  golden_window: <Sparkles className="w-4 h-4" />,
  confirmation: <Check className="w-4 h-4" />,
  reservation: <Clock className="w-4 h-4" />,
  sync: <RefreshCw className="w-4 h-4" />,
  alignment: <Target className="w-4 h-4" />,
}

const activityColors: Record<string, string> = {
  golden_window: 'bg-primary/20 text-primary',
  confirmation: 'bg-emerald-500/20 text-emerald-500',
  reservation: 'bg-amber-500/20 text-amber-500',
  sync: 'bg-blue-500/20 text-blue-500',
  alignment: 'bg-purple-500/20 text-purple-500',
}

interface ActivityItemProps {
  activity: typeof mockActivity[number]
  index: number
  isLast: boolean
  animated?: boolean
}

function ActivityItem({ activity, index, isLast, animated }: ActivityItemProps) {
  return (
    <div className="relative flex gap-3">
      {/* Timeline spine */}
      <div className="flex flex-col items-center shrink-0">
        <div className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center z-10',
          activityColors[activity.type]
        )}>
          {activityIcons[activity.type]}
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-border/30 mt-1 mb-1 min-h-[12px]" />
        )}
      </div>

      {/* Content */}
      <div className={cn(
        'flex-1 min-w-0 pb-4',
        animated && 'animate-fade-in-up opacity-0',
        animated && `stagger-${index + 1}`
      )}>
        <div className="flex items-start justify-between gap-2 pt-1.5">
          <div className="min-w-0">
            <p className="font-medium text-sm leading-snug">{activity.title}</p>
            {activity.description && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {activity.description}
              </p>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground/70 shrink-0 pt-0.5 tabular-nums">
            {activity.time}
          </span>
        </div>
      </div>
    </div>
  )
}

export function ActivityScreen({ onBack: _onBack, onNavigate }: ActivityScreenProps) {
  const today = mockActivity.slice(0, 4)
  const earlier = mockActivity.slice(4)

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopHeader 
        title="Activity"
        showNotifications={false}
      />

      <main className="px-4 py-6 max-w-md mx-auto">

        {/* Today */}
        <div className="mb-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4 font-medium">
            Today
          </p>
          <GlassCard className="px-4 pt-4 pb-0">
            {today.map((activity, i) => (
              <ActivityItem
                key={activity.id}
                activity={activity}
                index={i}
                isLast={i === today.length - 1}
                animated
              />
            ))}
          </GlassCard>
        </div>

        {/* Earlier */}
        {earlier.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4 font-medium">
              Earlier
            </p>
            <GlassCard className="px-4 pt-4 pb-0">
              {earlier.map((activity, i) => (
                <ActivityItem
                  key={activity.id}
                  activity={activity}
                  index={i}
                  isLast={i === earlier.length - 1}
                />
              ))}
            </GlassCard>
          </div>
        )}

      </main>

      <BottomNav 
        activeTab="activity" 
        onTabChange={(tab) => {
          if (tab === 'home') onNavigate('home')
          if (tab === 'groups') onNavigate('groups')
          if (tab === 'profile') onNavigate('profile')
        }}
      />
    </div>
  )
}
