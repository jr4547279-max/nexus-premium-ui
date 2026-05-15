'use client'

import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
  glow?: boolean
}

export function GlassCard({ children, className, hover = false, onClick, glow = false }: GlassCardProps) {
  const Component = onClick ? 'button' : 'div'
  
  return (
    <Component
      onClick={onClick}
      className={cn(
        'rounded-2xl p-4',
        hover ? 'glass-card-hover cursor-pointer' : 'glass-card',
        glow && 'glow-gold',
        'text-left w-full',
        className
      )}
    >
      {children}
    </Component>
  )
}

interface GroupCardProps {
  name: string
  emoji?: string
  memberCount: number
  members: { avatar: string; name: string }[]
  pendingCount?: number
  hasGoldenWindow?: boolean
  onClick?: () => void
  className?: string
}

export function GroupCard({
  name,
  emoji,
  memberCount,
  members,
  pendingCount = 0,
  hasGoldenWindow = false,
  onClick,
  className,
}: GroupCardProps) {
  return (
    <GlassCard hover onClick={onClick} className={cn('flex items-center gap-4', className)}>
      {/* Icon/Emoji */}
      <div className={cn(
        'w-12 h-12 rounded-xl flex items-center justify-center text-xl',
        'bg-muted/50'
      )}>
        {emoji}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium truncate">{name}</h3>
          {hasGoldenWindow && (
            <span className="text-primary text-xs">✨</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{memberCount} members</p>
      </div>
      
      {/* Avatars */}
      <div className="flex items-center">
        <div className="flex -space-x-2">
          {members.slice(0, 3).map((member, i) => (
            <img
              key={i}
              src={member.avatar}
              alt={member.name}
              className="w-7 h-7 rounded-full border-2 border-background"
            />
          ))}
          {members.length > 3 && (
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs border-2 border-background">
              +{members.length - 3}
            </div>
          )}
        </div>
        
        {pendingCount > 0 && (
          <span className="ml-2 text-xs text-amber-500">
            •{pendingCount}
          </span>
        )}
        
        <ChevronRight className="w-5 h-5 text-muted-foreground ml-2" />
      </div>
    </GlassCard>
  )
}

interface AvatarStackProps {
  avatars: { avatar: string; name: string; synced?: boolean }[]
  max?: number
  size?: 'sm' | 'md' | 'lg'
  showSyncStatus?: boolean
  className?: string
}

const avatarSizes = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
}

export function AvatarStack({ 
  avatars, 
  max = 4, 
  size = 'md',
  showSyncStatus = false,
  className 
}: AvatarStackProps) {
  const visibleAvatars = avatars.slice(0, max)
  const remaining = avatars.length - max
  
  return (
    <div className={cn('flex items-center', className)}>
      <div className="flex -space-x-2">
        {visibleAvatars.map((avatar, i) => (
          <div key={i} className="relative">
            <img
              src={avatar.avatar}
              alt={avatar.name}
              className={cn(
                'rounded-full border-2 border-background',
                avatarSizes[size]
              )}
            />
            {showSyncStatus && (
              <span className={cn(
                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background',
                avatar.synced ? 'bg-emerald-500' : 'bg-amber-500'
              )} />
            )}
          </div>
        ))}
        {remaining > 0 && (
          <div className={cn(
            'rounded-full bg-muted flex items-center justify-center text-xs border-2 border-background',
            avatarSizes[size]
          )}>
            +{remaining}
          </div>
        )}
      </div>
    </div>
  )
}

interface StatBadgeProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'gold'
  className?: string
}

export function StatBadge({ label, value, icon, variant = 'default', className }: StatBadgeProps) {
  const variants = {
    default: 'bg-muted/50 text-foreground',
    success: 'bg-emerald-500/10 text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-400',
    gold: 'bg-primary/10 text-primary',
  }
  
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm',
      variants[variant],
      className
    )}>
      {icon}
      <span className="font-medium">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}
