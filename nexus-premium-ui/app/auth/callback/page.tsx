'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GoldenRing } from '@/components/nexus/golden-ring'
import { AlertTriangle } from 'lucide-react'

type Phase = 'exchanging' | 'done' | 'error'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('exchanging')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const hasStarted = useRef(false)

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    let active = true
    const finishWithError = (message: string) => {
      if (!active) return
      setErrorMessage(message)
      setPhase('error')
      window.setTimeout(() => router.replace('/'), 5000)
    }

    const handleCallback = async () => {
      const url = new URL(window.location.href)
      const oauthError = url.searchParams.get('error')
      const oauthErrorDesc = url.searchParams.get('error_description')

      if (oauthError) {
        finishWithError(
          oauthError === 'access_denied'
            ? 'Sign-in was cancelled.'
            : (oauthErrorDesc ? decodeURIComponent(oauthErrorDesc) : oauthError),
        )
        return
      }

      const code = url.searchParams.get('code')
      if (code) {
        const storageKey = `nexus-oauth-code:${code}`
        const alreadyAttempted = window.sessionStorage.getItem(storageKey) === '1'

        if (!alreadyAttempted) {
          window.sessionStorage.setItem(storageKey, '1')
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
              finishWithError(error.message || 'Google sign-in could not be completed.')
              return
            }
          }
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          setPhase('done')
          router.replace('/')
          return
        }

        finishWithError('Google sign-in completed without creating a session. Please try again.')
        return
      }

      // Support an implicit-flow response as a safe fallback.
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
          finishWithError(error.message || 'Google sign-in could not establish a session.')
          return
        }
        setPhase('done')
        router.replace('/')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/')
      } else {
        finishWithError('No authentication response was received. Please try signing in again.')
      }
    }

    handleCallback().catch((error) => {
      finishWithError(error instanceof Error ? error.message : 'Unable to complete Google sign-in.')
    })

    return () => {
      active = false
    }
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
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed break-words">
              {errorMessage ?? 'Something went wrong. Returning to the app…'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.replace('/')}
            className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground"
          >
            Back to Nexus
          </button>
          <p className="text-[10px] text-muted-foreground/50 tracking-wide">Returning automatically…</p>
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
