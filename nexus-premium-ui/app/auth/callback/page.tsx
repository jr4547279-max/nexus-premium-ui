'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GoldenRing } from '@/components/nexus/golden-ring'
import { AlertTriangle } from 'lucide-react'

type Phase = 'exchanging' | 'done' | 'error'

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

/**
 * Browser-side Supabase OAuth callback.
 *
 * The login screen starts a PKCE OAuth flow and sends the provider back to
 * this route with a one-time `code`. We exchange that code for the browser
 * session, then return to the app.
 *
 * The exchange is bounded so a slow/failed auth request can never leave the
 * user on an infinite NEXUS loading screen.
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('exchanging')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const hasStarted = useRef(false)

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    const failAndReturn = (message: string, delay = 4000) => {
      setErrorMessage(message)
      setPhase('error')
      setTimeout(() => router.replace('/'), delay)
    }

    const getCurrentSession = async () => {
      return withTimeout(
        supabase.auth.getSession(),
        8000,
        'The authentication service took too long to respond.',
      )
    }

    const handleCallback = async () => {
      try {
        const url = new URL(window.location.href)

        const oauthError = url.searchParams.get('error')
        const oauthErrorDesc = url.searchParams.get('error_description')
        if (oauthError) {
          const msg =
            oauthError === 'access_denied'
              ? 'Sign-in was cancelled.'
              : (oauthErrorDesc ?? oauthError)
          failAndReturn(msg, 3000)
          return
        }

        const code = url.searchParams.get('code')
        if (code) {
          const storageKey = `nexus-oauth-code:${code}`
          const alreadyAttempted = window.sessionStorage.getItem(storageKey) === '1'
          if (alreadyAttempted) {
            const { data: { session } } = await getCurrentSession()
            if (session) {
              setPhase('done')
              router.replace('/')
              return
            }
          }

          window.sessionStorage.setItem(storageKey, '1')

          const { error } = await withTimeout(
            supabase.auth.exchangeCodeForSession(code),
            12000,
            'Google sign-in took too long to complete.',
          )

          if (error) {
            const { data: { session } } = await getCurrentSession()
            if (session) {
              setPhase('done')
              router.replace('/')
              return
            }

            failAndReturn('Sign-in failed — please try again.')
            return
          }

          setPhase('done')
          router.replace('/')
          return
        }

        const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
        const hashParams = new URLSearchParams(hash)
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        if (accessToken && refreshToken) {
          const { error } = await withTimeout(
            supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            }),
            12000,
            'Sign-in took too long to establish a session.',
          )
          if (error) {
            failAndReturn('Sign-in failed — could not establish your session.')
            return
          }
          setPhase('done')
          router.replace('/')
          return
        }

        router.replace('/')
      } catch (caught) {
        const message = caught instanceof Error
          ? caught.message
          : 'Sign-in could not be completed. Please try again.'
        failAndReturn(message)
      }
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
