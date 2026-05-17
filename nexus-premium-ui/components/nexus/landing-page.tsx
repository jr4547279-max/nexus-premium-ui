'use client'

import { NexusLogo } from './nexus-logo'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

interface LandingPageProps {
  onGetStarted: () => void
  onLogin: () => void
}

export function LandingPage({ onGetStarted, onLogin }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between">
        <NexusLogo size="sm" />
        <Button
          variant="ghost"
          onClick={onLogin}
          className="text-muted-foreground hover:text-foreground"
        >
          Sign in
        </Button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-6 px-5">
        <h1 className="text-4xl md:text-6xl font-light tracking-[0.25em]">
          NEXUS
        </h1>
        <p className="text-lg text-primary font-light">
          Plans, perfectly aligned.
        </p>
        <Button
          onClick={onGetStarted}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 h-12 text-sm rounded-full mt-2"
        >
          Get Started
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </main>
    </div>
  )
}
