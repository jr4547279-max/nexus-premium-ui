'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GoldenRing } from '@/components/nexus/golden-ring'

/**
 * Supabase PKCE auth callback handler.
 *
 * Supabase JS v2 uses PKCE flow by default, which redirects the user here
 * after email confirmation / magic link / OAuth with a one-time `code` param:
 *   /auth/callback?code=XXXX
 *
 * This page exchanges the code for a real session, then sends the user to the
 * root route where NexusApp's 'resolving' state checks their onboarding status
 * and routes them into the correct premium screen (onboarding or dashboard).
 */
export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const exchange = async () => {
      const code = new URLSearchParams(window.location.search).get('code')

      if (code) {
        // Exchange the PKCE authorisation code for a session.
        // Errors here are non-fatal — NexusApp will show the landing page.
        await supabase.auth.exchangeCodeForSession(code).catch(() => null)
      }

      // Hand off to NexusApp. The 'resolving' state will:
      //   • load the user's profile
      //   • route to 'onboarding' if onboarding_completed === false  (new user)
      //   • route to 'home'        if onboarding_completed === true   (returning user)
      router.replace('/')
    }

    exchange()
  }, [router])

  // Show the same premium loading screen used by NexusApp's 'resolving' state
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <GoldenRing size="md" intensity="subtle" />
        <p className="text-muted-foreground text-xs tracking-widest animate-pulse">
          NEXUS
        </p>
      </div>
    </div>
  )
}
