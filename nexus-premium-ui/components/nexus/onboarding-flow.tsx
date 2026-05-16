'use client'

import { useState } from 'react'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { GoldenRing } from './golden-ring'
import { Check, ChevronRight, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { onboardingSteps } from '@/lib/mock-data'

interface OnboardingFlowProps {
  onComplete: () => void
  onBack: () => void
}

const iconMap: Record<string, React.ReactNode> = {
  utensils: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h3V3H3zm6 0v18h3V3H9zm6 0v18h3V3h-3z" /></svg>,
  wine: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 22h8M12 11v11m0-11c3.5 0 6-2.5 6-6V2H6v3c0 3.5 2.5 6 6 6z" /></svg>,
  coffee: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zm4-7v3m4-3v3m4-3v3" /></svg>,
  sun: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>,
  film: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3v18m10-18v18M3 7h4m10 0h4M3 12h18M3 17h4m10 0h4" /></svg>,
  dumbbell: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.5 6.5h11M4 10h2.5m11 0H20M4 14h2.5m11 0H20M6.5 17.5h11M6 6v12M18 6v12" /></svg>,
  sunset: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  sunrise: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v2m0 18v-2m8-8h2M2 12h2m14.071 6.071l1.414 1.414M4.515 4.515l1.414 1.414m12.142 0l1.414-1.414M4.515 19.485l1.414-1.414M12 6a6 6 0 100 12 6 6 0 000-12z" /></svg>,
  moon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>,
  zap: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
  clock: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" /></svg>,
  map: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>,
  check: <Check className="w-5 h-5" />,
  leaf: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 21c.5-4.5 2.5-8 9-11 0 0-3 4.5-3 7.5 0 3 2 5.5 5 5.5 6 0 6-9 6-9s-1-6-6-9c-3.5-2-7.5-2-10.5 0S2 12 2 12s3 9 3 9z" /></svg>,
  sprout: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22V8M12 8c0-4 3-6 7-6-1 4-3 6-7 6zM12 8c0-4-3-6-7-6 1 4 3 6 7 6z" /></svg>,
  star: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
  wheat: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 22l10-10m0 0l10-10M12 12l-2-8m2 8l2-8m-2 8l-4-6m4 6l4-6" /></svg>,
  coins: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="8" cy="8" r="6"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.09 10.37A6 6 0 1110.34 18" /></svg>,
  wallet: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-1m0-4h-6a2 2 0 000 4h6m0-4v4" /></svg>,
  'credit-card': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="5" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 10h20" /></svg>,
  gem: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l8 4v6c0 5.5-3.5 10-8 12-4.5-2-8-6.5-8-12V6l8-4z" /></svg>,
  smile: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>,
  heart: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>,
  briefcase: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="7" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></svg>,
}

export function OnboardingFlow({ onComplete, onBack }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  
  const step = onboardingSteps[currentStep]
  const isLastStep = currentStep === onboardingSteps.length - 1
  const progress = ((currentStep + 1) / onboardingSteps.length) * 100

  const toggleSelection = (optionId: string) => {
    const currentSelections = selections[step.id] || []
    const isSingleSelect = step.id === 'travel' || step.id === 'budget' || step.id === 'vibe'
    
    if (isSingleSelect) {
      setSelections(prev => ({
        ...prev,
        [step.id]: [optionId]
      }))
    } else {
      if (currentSelections.includes(optionId)) {
        setSelections(prev => ({
          ...prev,
          [step.id]: currentSelections.filter(id => id !== optionId)
        }))
      } else {
        setSelections(prev => ({
          ...prev,
          [step.id]: [...currentSelections, optionId]
        }))
      }
    }
  }

  const isSelected = (optionId: string) => {
    return (selections[step.id] || []).includes(optionId)
  }

  const handleNext = () => {
    if (isLastStep) {
      onComplete()
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep === 0) {
      onBack()
    } else {
      setCurrentStep(prev => prev - 1)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="px-5 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button 
            onClick={handlePrev}
            className="p-1.5 -ml-1.5 rounded-full hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-xs text-muted-foreground">
            {currentStep + 1} / {onboardingSteps.length}
          </span>
          <button 
            onClick={onComplete}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="px-5">
        <div className="max-w-md mx-auto h-0.5 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 flex flex-col px-5 py-5">
        <div className="max-w-md mx-auto w-full flex-1 flex flex-col">
          {/* Golden Ring */}
          <div className="flex justify-center mb-5">
            <GoldenRing size="sm" intensity="subtle" />
          </div>

          {/* Question */}
          <div className="text-center mb-5">
            <h1 className="text-xl font-medium mb-1">{step.title}</h1>
            <p className="text-muted-foreground text-sm">{step.subtitle}</p>
          </div>

          {/* Options - Compact Grid */}
          <div className="grid grid-cols-2 gap-2.5 flex-1 content-start">
            {step.options.map((option) => (
              <GlassCard
                key={option.id}
                hover
                onClick={() => toggleSelection(option.id)}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 p-4 transition-all duration-300 relative',
                  isSelected(option.id) && 'border-primary bg-primary/5 glow-gold'
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                  isSelected(option.id) ? 'bg-primary/20 text-primary' : 'bg-muted/50 text-muted-foreground'
                )}>
                  {iconMap[option.icon] || <Check className="w-4 h-4" />}
                </div>
                <span className={cn(
                  'text-xs font-medium text-center transition-colors leading-tight',
                  isSelected(option.id) && 'text-primary'
                )}>
                  {option.label}
                </span>
                {isSelected(option.id) && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>
                )}
              </GlassCard>
            ))}
          </div>

          {/* Continue Button */}
          <Button 
            onClick={handleNext}
            className="w-full h-11 mt-5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl glow-gold text-sm"
            disabled={(selections[step.id] || []).length === 0}
          >
            {isLastStep ? 'Complete Setup' : 'Continue'}
            <ChevronRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
      </main>
    </div>
  )
}
