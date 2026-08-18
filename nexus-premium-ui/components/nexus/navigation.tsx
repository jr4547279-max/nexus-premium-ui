'use client'

import { Home, Users, Clock, User, Globe, Users2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BottomNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
  className?: string
}

const navItems = [
  { id: 'home',     icon: Home,   label: 'Home'    },
  { id: 'groups',   icon: Users,  label: 'Groups'  },
  { id: 'world',    icon: Globe,  label: 'World'   },
  { id: 'activity', icon: Clock,  label: 'Activity'},
  { id: 'social',   icon: Users2, label: 'Social'  },
  { id: 'profile',  icon: User,   label: 'Profile' },
]

export function BottomNav({ activeTab, onTabChange, className }: BottomNavProps) {
  return (
    <nav className={cn(
      'fixed bottom-0 left-0 right-0 z-50',
      'glass-card border-t border-border/50',
      'px-2 py-2 pb-safe',
      className
    )}>
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'flex flex-col items-center gap-0.5 p-1 rounded-lg transition-all duration-300',
                'hover:bg-muted/50',
                isActive && 'text-primary'
              )}
            >
              <Icon className={cn(
                'w-4.5 h-4.5 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )} />
              <span className={cn(
                'text-[9px] transition-colors',
                isActive ? 'text-primary font-medium' : 'text-muted-foreground'
              )}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

interface TopHeaderProps {
  title?: string
  showBack?: boolean
  onBack?: () => void
  showNotifications?: boolean
  notificationCount?: number
  onNotificationClick?: () => void
  userAvatar?: string
  userInitial?: string
  onAvatarClick?: () => void
  className?: string
}

export function TopHeader({
  title = 'Nexus',
  showBack = false,
  onBack,
  showNotifications = true,
  notificationCount = 0,
  onNotificationClick,
  userAvatar,
  userInitial,
  onAvatarClick,
  className,
}: TopHeaderProps) {
  return (
    <header className={cn(
      'sticky top-0 z-40 glass-card border-b border-border/50',
      'px-4 py-2.5',
      className
    )}>
      <div className="max-w-md mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {showBack ? (
            <button 
              onClick={onBack}
              className="p-1.5 -ml-1.5 rounded-full hover:bg-muted/50 transition-colors"
            >
              <svg 
                className="w-5 h-5" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : userAvatar ? (
            <button
              onClick={onAvatarClick}
              className="rounded-full focus:outline-none"
            >
              <img 
                src={userAvatar} 
                alt="Profile" 
                className="w-8 h-8 rounded-full border-2 border-primary/30"
              />
            </button>
          ) : userInitial ? (
            <button
              onClick={onAvatarClick}
              className="w-8 h-8 rounded-full border-2 border-primary/30 bg-primary/10 flex items-center justify-center focus:outline-none"
            >
              <span className="text-xs font-medium text-primary">{userInitial}</span>
            </button>
          ) : null}
          <h1 className="text-base font-medium">{title}</h1>
        </div>
        
        {showNotifications && (
          <button 
            onClick={onNotificationClick}
            className="relative p-1.5 rounded-full hover:bg-muted/50 transition-colors"
          >
            <svg 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {notificationCount > 0 && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-primary rounded-full" />
            )}
          </button>
        )}
      </div>
    </header>
  )
}
