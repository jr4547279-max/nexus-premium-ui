'use client'

import { cn } from '@/lib/utils'

interface NexusLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  className?: string
}

const sizeMap = {
  sm: { ring: 'w-8 h-8', text: 'text-lg' },
  md: { ring: 'w-12 h-12', text: 'text-xl' },
  lg: { ring: 'w-16 h-16', text: 'text-2xl' },
  xl: { ring: 'w-24 h-24', text: 'text-3xl' },
}

export function NexusLogo({ size = 'md', showText = true, className }: NexusLogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className={cn('relative', sizeMap[size].ring)}>
        {/* Golden ring SVG representation */}
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <circle 
            cx="50" 
            cy="50" 
            r="40" 
            fill="none" 
            stroke="url(#goldGradient)" 
            strokeWidth="4"
            filter="url(#glow)"
          />
          {/* Top highlight */}
          <ellipse 
            cx="50" 
            cy="15" 
            rx="15" 
            ry="3" 
            fill="#fef3c7"
            opacity="0.6"
          />
        </svg>
      </div>
      {showText && (
        <span className={cn(
          'font-light tracking-[0.3em] text-foreground',
          sizeMap[size].text
        )}>
          NEXUS
        </span>
      )}
    </div>
  )
}

export function NexusLogoAnimated({ className }: { className?: string }) {
  return (
    <div className={cn('relative w-64 h-64 md:w-80 md:h-80', className)}>
      {/* Outer glow */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-500/10 via-yellow-400/20 to-amber-600/10 blur-3xl animate-glow-pulse pointer-events-none" />
      
      {/* Main golden ring */}
      <svg viewBox="0 0 200 200" className="w-full h-full pointer-events-none">
        <defs>
          <linearGradient id="heroGoldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="25%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#fcd34d" />
            <stop offset="75%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <filter id="heroGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Main ring */}
        <circle 
          cx="100" 
          cy="100" 
          r="80" 
          fill="none" 
          stroke="url(#heroGoldGradient)" 
          strokeWidth="6"
          filter="url(#heroGlow)"
          className="orbital-ring"
          style={{ transformOrigin: 'center' }}
        />
        
        {/* Top highlight arc */}
        <path 
          d="M 40 60 Q 100 20 160 60" 
          fill="none" 
          stroke="#fef3c7" 
          strokeWidth="2"
          opacity="0.4"
          strokeLinecap="round"
        />
      </svg>
      
      {/* Inner subtle orbital */}
      <div className="absolute inset-12 rounded-full border border-amber-500/10 orbital-ring-reverse pointer-events-none" />
    </div>
  )
}
