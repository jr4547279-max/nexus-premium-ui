'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GoldenRing } from '@/components/nexus/golden-ring'
import { AlertTriangle } from 'lucide-react'

/**
 * Supabase PKCE auth callback handler.
 *
 * Supabase JS v2 uses PKCE by default. After the user authenticates with
 * Google (or any OAuth provider), Supabase redirects here with either:
 *
 *   /auth/callback?code=XXXX         ← PKCE flow (normal case)
 *   /auth/callback?error=access_denied&error_description=... ← user denied
 *   /auth/callback#access_token=...  ← implicit flow (rare fallback)
 *
 * This page handles all three cases.
 *
 * ─── Why detectSessionInUrl is disabled ────────────────────────────────────
 * The Supabase client in lib/supabase.ts sets detectSessionInUrl: false.
 * When that flag is true (the SDK default), the client calls
 * exchangeCodeForSession() automatically on module init. This page then calls
 * it again inside useEffect, consuming the one-time PKCE flow state twice and
 * producing "flow_state_already_consumed". Disabling the flag gives this page
 * sole responsibility for the exchange.
 *
 * ─── Why useRef guards against double execution ────────────────────────────
 * React Strict Mode (development only) intentionally runs every useEffect
 * twice (mount → unmount → remount). A plain async function inside useEffect
 * would therefore call exchangeCodeForSession twice even without detectSessionInUrl,
 * producing the same error. The hasExchanged ref ensures the exchange runs
 * exactly once regardless of how many times the effect fires.
 *
 * ─── Supabase configuration requirements ───────────────────────────────────
 * For the redirect back here to succeed, BOTH of these must be set in the
 * Supabase dashboard (Authentication → URL Configuration):
 *
 *   Site URL:        The primary app URL (e.g. https://yourapp.replit.app)
 *   Redirect URLs:   Whitelist every origin that can receive the callback.
 *                    Add wildcard patterns for Replit:
 *                      https://*.kirk.replit.dev/**   (current Replit cluster)
 *                      https://*.replit.dev/**         (all Replit clusters)
 *                      https://*.replit.app/**         (production deployments)
 *                      http://localhost:3000/**         (local dev)
 *
 * If a redirectTo URL is not in the allowed list, Supabase falls back to the
 * Site URL — which will cause the OAuth redirect to go to the wrong place.
 * ───────────────────────────────────────────────────────────────────────────
 */

type Phase = 'exchanging' | 'done' | 'error'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('exchanging')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Guard against React Strict Mode double-invocation (and any other scenario
  // that would cause the effect to run more than once). The PKCE flow state is
  // one-time-use: a second exchangeCodeForSession() call always fails.
  const hasExchanged = useRef(false)

  useEffect(() => {
    // Bail out immediately on the second Strict Mode invocation.
    if (hasExchanged.current) return
    hasExchanged.current = true

    const handleCallback = async () => {
      console.log('[AUTH] OAuth callback:', window.location.href)
      const url = new URL(window.location.href)

      // ── 1. OAuth provider returned an explicit error ──────────────────────
      const oauthError = url.searchParams.get('error')
      const oauthErrorDesc = url.searchParams.get('error_description')
      if (oauthError) {
        const msg =
          oauthError === 'access_denied'
            ? 'Sign-in was cancelled.'
            : (oauthErrorDesc ?? oauthError)
        console.error('[auth/callback] OAuth error from provider:', oauthError, oauthErrorDesc)
        setErrorMessage(msg)
        setPhase('error')
        // Short pause so the user sees the message, then go back to the landing page.
        setTimeout(() => router.replace('/'), 3000)
        return
      }

      // ── 2. PKCE flow — exchange the one-time code for a session ──────────
      // detectSessionInUrl is false in lib/supabase.ts so this is the only
      // call that consumes the PKCE code. The hasExchanged ref above ensures
      // this block runs exactly once.
      const code = url.searchParams.get('code')
      if (code) {
        console.log('[auth/callback] PKCE code received — exchanging for session')
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('[auth/callback] Code exchange failed:', error.message)
          setErrorMessage('Sign-in failed — the authorisation code may have expired. Please try again.')
          setPhase('error')
          setTimeout(() => router.replace('/'), 4000)
          return
        }
        console.log('[AUTH] Session established: PKCE code exchange successful')
        setPhase('done')
        router.replace('/')
        return
      }

      // ── 3. Implicit flow — tokens arrive in the URL hash fragment ─────────
      // Fallback for when PKCE wasn't used (rare with Supabase v2).
      const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
      const hashParams = new URLSearchParams(hash)
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      if (accessToken && refreshToken) {
        console.log('[auth/callback] Implicit flow tokens detected in hash — setting session')
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          console.error('[auth/callback] setSession failed:', error.message)
          setErrorMessage('Sign-in failed — could not establish session. Please try again.')
          setPhase('error')
          setTimeout(() => router.replace('/'), 4000)
          return
        }
        setPhase('done')
        router.replace('/')
        return
      }

      // ── 4. No auth params — nothing to do ────────────────────────────────
      console.warn('[auth/callback] No code, no hash tokens — redirecting home')
      router.replace('/')
    }

    handleCallback()
  }, [router])

  // ── Loading state ────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-xs">
          <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-400/40 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Sign-in failed</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {errorMessage ?? 'Something went wrong. Returning to the app…'}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground/50 tracking-wide">
            Redirecting…
          </p>
        </div>
      </div>
    )
  }

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
