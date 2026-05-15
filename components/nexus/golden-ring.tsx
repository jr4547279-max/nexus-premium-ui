'use client'

import { cn } from '@/lib/utils'

interface GoldenRingProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero'
  animated?: boolean
  className?: string
  showInnerRing?: boolean
  intensity?: 'subtle' | 'normal' | 'intense'
}

const sizeMap = {
  sm: 'w-12 h-12',
  md: 'w-20 h-20',
  lg: 'w-28 h-28',
  xl: 'w-40 h-40',
  hero: 'w-52 h-52 md:w-64 md:h-64',
}

export function GoldenRing({ 
  size = 'md', 
  animated = true, 
  className,
  showInnerRing = false,
  intensity = 'normal'
}: GoldenRingProps) {
  const glowIntensity = {
    subtle: 'opacity-30',
    normal: 'opacity-50',
    intense: 'opacity-70',
  }

  return (
    <div className={cn('relative flex items-center justify-center', sizeMap[size], className)}>
      {/* Outer glow */}
      <div 
        className={cn(
          'absolute inset-0 rounded-full',
          'bg-gradient-to-r from-amber-500/20 via-yellow-400/30 to-amber-600/20',
          'blur-xl',
          glowIntensity[intensity],
          animated && 'animate-glow-pulse'
        )}
      />
      
      {/* Main ring */}
      <div 
        className={cn(
          'absolute inset-2 rounded-full',
          'bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600',
          'p-[2px]',
          animated && 'orbital-ring'
        )}
        style={{
          animationDuration: '20s',
        }}
      >
        <div className="w-full h-full rounded-full bg-background" />
      </div>
      
      {/* Inner subtle ring */}
      {showInnerRing && (
        <div 
          className={cn(
            'absolute inset-6 rounded-full',
            'border border-amber-500/30',
            animated && 'orbital-ring-reverse'
          )}
        />
      )}
      
      {/* Top highlight */}
      <div 
        className="absolute top-1 left-1/2 -translate-x-1/2 w-1/4 h-2 rounded-full bg-gradient-to-r from-transparent via-yellow-300 to-transparent opacity-60"
      />
    </div>
  )
}

interface OrbitalBackgroundProps {
  className?: string
  children?: React.ReactNode
}

export function OrbitalBackground({ className, children }: OrbitalBackgroundProps) {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Ambient glow spots */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-amber-600/5 rounded-full blur-3xl" />
      
      {/* Orbital rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] border border-amber-500/5 rounded-full orbital-ring" />
        <div className="absolute w-[400px] h-[400px] border border-amber-500/10 rounded-full orbital-ring-reverse" />
        <div className="absolute w-[200px] h-[200px] border border-amber-500/5 rounded-full orbital-ring" style={{ animationDuration: '15s' }} />
      </div>
      
      {children}
    </div>
  )
}

interface GlowingDotProps {
  className?: string
  color?: 'gold' | 'green' | 'blue'
}

export function GlowingDot({ className, color = 'gold' }: GlowingDotProps) {
  const colorMap = {
    gold: 'bg-amber-500',
    green: 'bg-emerald-500',
    blue: 'bg-blue-500',
  }
  
  return (
    <span className={cn('relative inline-flex', className)}>
      <span className={cn('w-2 h-2 rounded-full', colorMap[color])} />
      <span className={cn('absolute inset-0 w-2 h-2 rounded-full animate-ping', colorMap[color], 'opacity-75')} />
    </span>
  )
}
