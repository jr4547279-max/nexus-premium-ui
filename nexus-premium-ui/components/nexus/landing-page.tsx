'use client'

import { useEffect, useState } from 'react'
import { NexusLogo } from './nexus-logo'
import { ArrowRight } from 'lucide-react'

interface LandingPageProps {
  onGetStarted: () => void
  onLogin: () => void
}

export function LandingPage({ onGetStarted, onLogin }: LandingPageProps) {
  const [hitInfo, setHitInfo] = useState('')

  // Run elementFromPoint on both button areas and display the result on screen
  useEffect(() => {
    const timer = setTimeout(() => {
      const w = window.innerWidth
      const h = window.innerHeight
      const elBtn  = document.elementFromPoint(w / 2, h * 0.68)
      const elSign = document.elementFromPoint(w - 90, 34)
      const fmt = (el: Element | null) =>
        el ? `${el.tagName}#${el.id || '-'}.${(el.className || '').toString().slice(0, 30)}` : 'null'
      setHitInfo(`GetStarted area: ${fmt(elBtn)} | SignIn area: ${fmt(elSign)}`)
    }, 800)
    return () => clearTimeout(timer)
  }, [])

  function handleGetStarted() {
    alert('GET STARTED CLICKED')
    window.location.hash = 'onboarding'
  }

  function handleSignIn() {
    alert('SIGN IN CLICKED')
    window.location.hash = 'auth'
  }

  const btnStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 1000000,
    pointerEvents: 'auto',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'rgba(0,0,0,0)',
    cursor: 'pointer',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--background)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* elementFromPoint diagnostic — shown on screen, not in console */}
      {hitInfo ? (
        <div
          style={{
            position: 'fixed',
            bottom: 8,
            left: 8,
            right: 8,
            zIndex: 9999999,
            background: 'rgba(0,0,0,0.85)',
            color: '#4ade80',
            fontSize: '10px',
            fontFamily: 'monospace',
            padding: '6px 8px',
            borderRadius: '6px',
            pointerEvents: 'none',
            wordBreak: 'break-all',
          }}
        >
          {hitInfo}
        </div>
      ) : null}

      {/* ── All interactive content at extreme z-index ── */}
      <div
        style={{
          position: 'relative',
          zIndex: 999999,
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
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
            style={{
              ...btnStyle,
              fontSize: '14px',
              color: 'var(--muted-foreground)',
              padding: '8px 16px',
              borderRadius: '6px',
              background: 'transparent',
            }}
            onClick={handleSignIn}
            onPointerUp={handleSignIn}
            onTouchEnd={(e) => { e.preventDefault(); handleSignIn() }}
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
            style={{
              ...btnStyle,
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
              padding: '12px 32px',
              fontSize: '14px',
              borderRadius: '9999px',
              marginTop: '8px',
            }}
            onClick={handleGetStarted}
            onPointerUp={handleGetStarted}
            onTouchEnd={(e) => { e.preventDefault(); handleGetStarted() }}
          >
            Get Started
            <ArrowRight style={{ width: '16px', height: '16px', pointerEvents: 'none' }} />
          </button>
        </main>
      </div>
    </div>
  )
}
