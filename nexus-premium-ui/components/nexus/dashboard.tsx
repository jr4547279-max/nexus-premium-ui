'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { TopHeader, BottomNav } from './navigation'
import { GlassCard, GroupCard, AvatarStack } from './glass-card'
import { GoldenRing, GlowingDot } from './golden-ring'
import { Button } from '@/components/ui/button'
import { Plus, Sparkles, Calendar, Bell, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockGroups, mockActivity, mockNotifications } from '@/lib/mock-data'

interface DashboardProps {
  onGroupClick: (groupId: string) => void
  onNavigate: (screen: string) => void
}

export function Dashboard({ onGroupClick, onNavigate }: DashboardProps) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('home')
  const [showNotifications, setShowNotifications] = useState(false)

  const currentHour = new Date().getHours()
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening'

  const emailPrefix = user?.email?.split('@')[0] ?? ''
  const displayName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)
  const userInitial = (user?.email?.[0] ?? 'N').toUpperCase()

  const goldenWindowGroup = mockGroups.find(g => g.hasGoldenWindow)

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <TopHeader 
        userInitial={userInitial}
        onAvatarClick={() => onNavigate('profile')}
        notificationCount={mockNotifications.filter(n => n.unread).length}
        onNotificationClick={() => setShowNotifications(!showNotifications)}
      />

      {/* Notifications Dropdown */}
      {showNotifications && (
        <div className="absolute top-14 right-3 z-50 w-72 animate-fade-in-up">
          <GlassCard className="p-0 overflow-hidden">
            <div className="p-3 border-b border-border/50">
              <h3 className="font-medium text-sm">Notifications</h3>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {mockNotifications.map((notification) => (
                <div 
                  key={notification.id}
                  className={cn(
                    'p-3 border-b border-border/30 last:border-0',
                    notification.unread && 'bg-primary/5'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {notification.unread && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs">{notification.title}</p>
                      <p className="text-muted-foreground text-[11px] mt-0.5 line-clamp-2">{notification.message}</p>
                      <p className="text-muted-foreground text-[10px] mt-1">{notification.time}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* Main Content */}
      <main className="px-4 py-4 max-w-md mx-auto">
        {/* Greeting */}
        <div className="mb-5">
          <h1 className="text-xl font-medium">
            {greeting}, {displayName || 'there'}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Ready to make something happen?
          </p>
        </div>

        {/* Golden Window Highlight */}
        {goldenWindowGroup && (
          <div className="mb-5">
            <GlassCard 
              glow 
              className="p-4 cursor-pointer"
              onClick={() => onNavigate('golden-window')}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <GlowingDot color="gold" />
                  <span className="text-xs text-primary font-medium">Golden Window Found</span>
                </div>
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              </div>
              
              <div className="flex items-center gap-3">
                <GoldenRing size="sm" intensity="subtle" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{goldenWindowGroup.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {goldenWindowGroup.goldenWindow?.date} at {goldenWindowGroup.goldenWindow?.time}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </GlassCard>
          </div>
        )}

        {/* Sync Status */}
        <GlassCard className="mb-5 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="font-medium text-xs">Calendars synced</p>
                <p className="text-[10px] text-muted-foreground">Updated 2 min ago</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <GlowingDot color="green" />
              <span className="text-[10px] text-emerald-500">Active</span>
            </div>
          </div>
        </GlassCard>

        {/* Groups Section */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Your Groups</h2>
            <span className="text-xs text-muted-foreground">{mockGroups.length} groups</span>
          </div>
          
          <div className="space-y-2.5">
            {mockGroups.map((group) => (
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
        </div>

        {/* Create Group Button */}
        <Button 
          onClick={() => onNavigate('groups')}
          className="w-full h-10 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl text-sm"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Create New Group
        </Button>

        {/* Quick Activity */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Recent Activity</h2>
            <button 
              onClick={() => onNavigate('activity')}
              className="text-xs text-primary hover:underline"
            >
              View all
            </button>
          </div>
          
          <div className="space-y-1">
            {mockActivity.slice(0, 3).map((activity) => (
              <div 
                key={activity.id}
                className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                  activity.type === 'golden_window' && 'bg-primary/20 text-primary',
                  activity.type === 'confirmation' && 'bg-emerald-500/20 text-emerald-500',
                  activity.type === 'reservation' && 'bg-amber-500/20 text-amber-500',
                  activity.type === 'sync' && 'bg-blue-500/20 text-blue-500',
                )}>
                  {activity.type === 'golden_window' && <Sparkles className="w-3.5 h-3.5" />}
                  {activity.type === 'confirmation' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                  {activity.type === 'reservation' && <Calendar className="w-3.5 h-3.5" />}
                  {activity.type === 'sync' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{activity.title}</p>
                  {activity.description && (
                    <p className="text-[10px] text-muted-foreground truncate">{activity.description}</p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{activity.time}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <BottomNav 
        activeTab={activeTab} 
        onTabChange={(tab) => {
          setActiveTab(tab)
          if (tab === 'home') onNavigate('home')
          if (tab === 'groups') onNavigate('groups')
          if (tab === 'activity') onNavigate('activity')
          if (tab === 'profile') onNavigate('profile')
        }}
      />
    </div>
  )
}
