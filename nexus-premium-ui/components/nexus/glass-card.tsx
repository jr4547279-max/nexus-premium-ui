'use client'

import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { getActivityById } from '@/lib/activities/registry'

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
        'rounded-xl p-3',
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
  activityId?: string | null
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
  activityId,
  memberCount,
  members,
  pendingCount = 0,
  hasGoldenWindow = false,
  onClick,
  className,
}: GroupCardProps) {
  // Resolve the activity definition for display (predefined or custom).
  const activityDef = activityId && !activityId.startsWith('custom:')
    ? getActivityById(activityId)
    : null
  const customLabel = activityId?.startsWith('custom:') ? activityId.slice('custom:'.length) : null
  const ActivityIcon = activityDef?.Icon

  return (
    <GlassCard hover onClick={onClick} className={cn('flex items-center gap-3', className)}>
      {/* Icon/Emoji */}
      <div className={cn(
        'w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0',
        'bg-muted/50'
      )}>
        {emoji}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 className="font-medium text-sm truncate">{name}</h3>
          {hasGoldenWindow && (
            <span className="text-primary text-xs">✨</span>
          )}
        </div>
        {(activityDef || customLabel) ? (
          <div className="flex items-center gap-1 mt-0.5">
            {ActivityIcon && activityDef ? (
              <div className={cn('w-3.5 h-3.5 rounded flex items-center justify-center', activityDef.color.bg)}>
                <ActivityIcon className={cn('w-2 h-2', activityDef.color.text)} />
              </div>
            ) : (
              <span className="text-[10px]">✨</span>
            )}
            <span className="text-[11px] text-muted-foreground truncate">
              {activityDef?.label ?? customLabel}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{memberCount} member{memberCount === 1 ? '' : 's'}</p>
        )}
      </div>
      
      {/* Avatars */}
      <div className="flex items-center">
        <div className="flex -space-x-1.5">
          {members.slice(0, 3).map((member, i) => (
            <img
              key={i}
              src={member.avatar}
              alt={member.name}
              className="w-6 h-6 rounded-full border-2 border-background"
            />
          ))}
          {members.length > 3 && (
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] border-2 border-background">
              +{members.length - 3}
            </div>
          )}
        </div>
        
        {pendingCount > 0 && (
          <span className="ml-1.5 text-[10px] text-amber-500">
            •{pendingCount}
          </span>
        )}
        
        <ChevronRight className="w-4 h-4 text-muted-foreground ml-1.5" />
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
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
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
      'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs',
      variants[variant],
      className
    )}>
      {icon}
      <span className="font-medium">{value}</span>
      <span className="text-muted-foreground text-[10px]">{label}</span>
    </div>
  )
}
