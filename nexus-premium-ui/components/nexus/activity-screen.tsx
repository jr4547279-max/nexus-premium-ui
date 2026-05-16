'use client'

import { TopHeader, BottomNav } from './navigation'
import { GlassCard } from './glass-card'
import { 
  Sparkles, Check, Clock, Calendar, RefreshCw, 
  Target, Bell, MapPin, ChevronRight, List
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

export function ActivityScreen({ onBack, onNavigate }: ActivityScreenProps) {
  const today = mockActivity.slice(0, 4)
  const earlier = mockActivity.slice(4)

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <TopHeader 
        title="Activity"
        showNotifications={true}
        notificationCount={2}
      />

      <main className="px-4 py-6 max-w-md mx-auto">
        {/* Today */}
        <div className="mb-8">
          <h2 className="text-sm text-muted-foreground uppercase tracking-wider mb-4">Today</h2>
          <div className="space-y-3">
            {today.map((activity, i) => (
              <GlassCard 
                key={activity.id} 
                hover 
                className={cn(
                  'p-4 animate-fade-in-up opacity-0',
                  `stagger-${i + 1}`
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                    activityColors[activity.type]
                  )}>
                    {activityIcons[activity.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{activity.title}</p>
                        {activity.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">{activity.description}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{activity.time}</span>
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Earlier */}
        {earlier.length > 0 && (
          <div>
            <h2 className="text-sm text-muted-foreground uppercase tracking-wider mb-4">Earlier</h2>
            <div className="space-y-3">
              {earlier.map((activity) => (
                <GlassCard key={activity.id} hover className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                      activityColors[activity.type]
                    )}>
                      {activityIcons[activity.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{activity.title}</p>
                          {activity.description && (
                            <p className="text-sm text-muted-foreground mt-0.5">{activity.description}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{activity.time}</span>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        )}

        {/* View All Button */}
        <button className="w-full flex items-center justify-center gap-2 py-4 mt-6 text-primary hover:underline">
          <List className="w-4 h-4" />
          <span>View all activity</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </main>

      {/* Bottom Navigation */}
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
