'use client'

import { NexusLogo } from './nexus-logo'
import { ArrowRight } from 'lucide-react'

interface LandingPageProps {
  onGetStarted: () => void
  onLogin: () => void
}

export function LandingPage({ onGetStarted, onLogin }: LandingPageProps) {
  function handleGetStarted() {
    alert('GET STARTED CLICKED')
    window.location.hash = 'onboarding'
  }

  function handleSignIn() {
    alert('SIGN IN CLICKED')
    window.location.hash = 'auth'
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--background)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 0,
      }}
    >
      <header
        style={{
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <NexusLogo size="sm" />
        <button
          type="button"
          onPointerUp={handleSignIn}
          style={{
            fontSize: '14px',
            color: 'var(--muted-foreground)',
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
            pointerEvents: 'auto',
          }}
        >
          Sign in
        </button>
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
          padding: '0 20px',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(2rem, 8vw, 4rem)',
            fontWeight: 300,
            letterSpacing: '0.25em',
            margin: 0,
          }}
        >
          NEXUS
        </h1>
        <p
          style={{
            fontSize: '18px',
            color: 'var(--primary)',
            fontWeight: 300,
            margin: 0,
          }}
        >
          Plans, perfectly aligned.
        </p>
        <button
          type="button"
          onPointerUp={handleGetStarted}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            padding: '12px 32px',
            fontSize: '14px',
            borderRadius: '9999px',
            border: 'none',
            cursor: 'pointer',
            marginTop: '8px',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
            pointerEvents: 'auto',
          }}
        >
          Get Started
          <ArrowRight style={{ width: '16px', height: '16px' }} />
        </button>
      </main>
    </div>
  )
}
