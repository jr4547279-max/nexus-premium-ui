'use client'

import { NexusLogo } from './nexus-logo'
import { ArrowRight } from 'lucide-react'

interface LandingPageProps {
  onGetStarted: () => void
  onLogin: () => void
}

export function LandingPage({ onGetStarted, onLogin }: LandingPageProps) {
  function handleGetStarted() {
    console.log('[Nexus] Get Started tapped')
    onGetStarted()
  }

  function handleSignIn() {
    console.log('[Nexus] Sign in tapped')
    onLogin()
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between">
        <NexusLogo size="sm" />
        <button
          type="button"
          onClick={handleSignIn}
          className="text-sm text-muted-foreground hover:text-foreground px-4 py-2 rounded-md transition-colors"
        >
          Sign in
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-6 px-5">
        <h1 className="text-4xl md:text-6xl font-light tracking-[0.25em]">
          NEXUS
        </h1>
        <p className="text-lg text-primary font-light">
          Plans, perfectly aligned.
        </p>
        <button
          type="button"
          onClick={handleGetStarted}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground px-8 py-3 text-sm rounded-full mt-2 transition-colors cursor-pointer select-none"
        >
          Get Started
          <ArrowRight className="w-4 h-4" />
        </button>
      </main>
    </div>
  )
}
