'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import type { Session, User, AuthError } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from './supabase'
import { type Profile, getProfile, ensureProfile } from './profile-service'

export const CANONICAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nexus-premium-website-business.vercel.app'

function getCallbackUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`
  }
  return `${CANONICAL_SITE_URL}/auth/callback`
}

function authError(message: string, code: string): AuthError {
  return { message, code, name: 'AuthError', status: 0 } as unknown as AuthError
}

function notConfiguredError(): AuthError {
  return authError('Supabase is not configured yet. Add your production secrets to enable real auth.', 'not_configured')
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  profileLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null; needsEmailConfirm?: boolean }>
  signInWithGoogle: () => Promise<{ error: AuthError | null }>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const loadProfile = useCallback(async (userId: string, email: string) => {
    setProfileLoading(true)
    const timeout = setTimeout(() => setProfileLoading(false), 8000)
    try {
      let p = await getProfile(userId)
      if (!p) p = await ensureProfile(userId, email)
      setProfile(p)
    } catch {
      setProfile(null)
    } finally {
      clearTimeout(timeout)
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    // Email confirmation and password-reset links still use the dedicated
    // callback page. Google sign-in now returns directly to the current origin
    // and is handled automatically by Supabase's implicit browser flow.
    if (pathname === '/auth/callback') {
      setLoading(true)
      return
    }

    let mounted = true
    let loadedForUserId: string | null = null
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 5000)

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return
        setSession(session)
        setLoading(false)
        if (session?.user) {
          loadedForUserId = session.user.id
          void loadProfile(session.user.id, session.user.email ?? '')
        }
      })
      .catch(() => {
        if (mounted) setLoading(false)
      })
      .finally(() => clearTimeout(timeout))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      setLoading(false)
      if (!nextSession) {
        if (event === 'SIGNED_OUT') {
          loadedForUserId = null
          setSession(null)
          setProfile(null)
        }
        return
      }
      setSession(nextSession)
      const uid = nextSession.user.id
      if (uid !== loadedForUserId || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        loadedForUserId = uid
        void loadProfile(uid, nextSession.user.email ?? '')
      }
    })

    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [loadProfile, pathname])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return
    await loadProfile(session.user.id, session.user.email ?? '')
  }, [session, loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: notConfiguredError() }

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !password) return { error: authError('Enter your email and password.', 'missing_credentials') }

    try {
      const request = supabase.auth.signInWithPassword({ email: cleanEmail, password })
      const result = await Promise.race([
        request,
        new Promise<{
          data: { session: Session | null; user: User | null }
          error: AuthError
        }>((resolve) => {
          window.setTimeout(() => resolve({
            data: { session: null, user: null },
            error: authError('Sign-in timed out. Please try again.', 'auth_timeout'),
          }), 12000)
        }),
      ])

      if (!result.error && result.data.session?.user) {
        setSession(result.data.session)
        void loadProfile(result.data.session.user.id, result.data.session.user.email ?? cleanEmail)
      }

      return { error: result.error }
    } catch (error) {
      return {
        error: authError(
          error instanceof Error ? error.message : 'Unable to reach the sign-in service. Please try again.',
          'auth_request_failed',
        ),
      }
    }
  }, [loadProfile])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: notConfiguredError() }
    const cleanEmail = email.trim().toLowerCase()
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { emailRedirectTo: getCallbackUrl() },
      })
      if (!error && data.user) await ensureProfile(data.user.id, cleanEmail)
      return { error, needsEmailConfirm: !error && !data.session }
    } catch (error) {
      return {
        error: authError(
          error instanceof Error ? error.message : 'Unable to create your account. Please try again.',
          'signup_request_failed',
        ),
      }
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) return { error: notConfiguredError() }

    try {
      // Google uses the browser-native implicit flow. Returning to the current
      // origin lets supabase-js consume the access/refresh tokens from the URL
      // fragment before Nexus initialises its normal session state. This avoids
      // the one-time PKCE callback exchange that was repeatedly losing the
      // session on mobile.
      const redirectTo = typeof window !== 'undefined'
        ? window.location.origin
        : CANONICAL_SITE_URL

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'openid email profile',
        },
      })
      return { error }
    } catch (error) {
      return {
        error: authError(
          error instanceof Error ? error.message : 'Unable to start Google sign-in. Please try again.',
          'oauth_request_failed',
        ),
      }
    }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) return { error: notConfiguredError() }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: getCallbackUrl() })
      return { error }
    } catch (error) {
      return {
        error: authError(
          error instanceof Error ? error.message : 'Unable to send the password reset email. Please try again.',
          'reset_request_failed',
        ),
      }
    }
  }, [])

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }, [])

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, profileLoading, signIn, signUp, signInWithGoogle, resetPassword, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
