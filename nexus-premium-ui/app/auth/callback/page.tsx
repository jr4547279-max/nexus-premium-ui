'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GoldenRing } from '@/components/nexus/golden-ring'
import { AlertTriangle } from 'lucide-react'

type Phase = 'exchanging' | 'done' | 'error'

/**
 * Browser-side Supabase OAuth callback.
 *
 * The login screen starts a PKCE OAuth flow and sends the provider back to
 * this route with a one-time `code`. We exchange that code for the browser
 * session, then return to the app.
 *
 * This handler is deliberately tolerant of a duplicate callback. Browsers,
 * previews, or an already-consumed OAuth state can cause the same callback to
 * be reached twice. If the first request already established a session, the
 * second request simply reuses that session instead of showing a false login
 * failure.
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('exchanging')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const hasStarted = useRef(false)

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    const handleCallback = async () => {
      const url = new URL(window.location.href)

      const oauthError = url.searchParams.get('error')
      const oauthErrorDesc = url.searchParams.get('error_description')
      if (oauthError) {
        const msg =
          oauthError === 'access_denied'
            ? 'Sign-in was cancelled.'
            : (oauthErrorDesc ?? oauthError)
        setErrorMessage(msg)
        setPhase('error')
        setTimeout(() => router.replace('/'), 3000)
        return
      }

      const code = url.searchParams.get('code')
      if (code) {
        // A PKCE code is one-time-use. Remember codes we've already attempted
        // so a duplicate navigation cannot deliberately consume it twice.
        const storageKey = `nexus-oauth-code:${code}`
        const alreadyAttempted = window.sessionStorage.getItem(storageKey) === '1'
        if (alreadyAttempted) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            setPhase('done')
            router.replace('/')
            return
          }
        }

        window.sessionStorage.setItem(storageKey, '1')

        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          // If another callback already consumed the code, the session may
          // nevertheless be valid. Check before reporting a real failure.
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            setPhase('done')
            router.replace('/')
            return
          }

          setErrorMessage('Sign-in failed — please try again.')
          setPhase('error')
          setTimeout(() => router.replace('/'), 4000)
          return
        }

        setPhase('done')
        router.replace('/')
        return
      }

      // Fallback for an implicit-flow response.
      const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
      const hashParams = new URLSearchParams(hash)
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          setErrorMessage('Sign-in failed — could not establish your session.')
          setPhase('error')
          setTimeout(() => router.replace('/'), 4000)
          return
        }
        setPhase('done')
        router.replace('/')
        return
      }

      router.replace('/')
    }

    handleCallback()
  }, [router])

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
          <p className="text-[10px] text-muted-foreground/50 tracking-wide">Redirecting…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <GoldenRing size="md" intensity="subtle" />
        <p className="text-muted-foreground text-xs tracking-widest animate-pulse">NEXUS</p>
      </div>
    </div>
  )
}
