'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Session, User, AuthError } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from './supabase'
import { type Profile, getProfile, ensureProfile } from './profile-service'

// Vercel is the canonical production host.
export const CANONICAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nexus-premium-website-business.vercel.app'

function getCallbackUrl(): string {
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
  }, [loadProfile])

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: notConfiguredError() }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signUp = async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: notConfiguredError() }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: getCallbackUrl() },
    })
    return { error, needsEmailConfirm: !error && !data.session }
  }

  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured) return { error: notConfiguredError() }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getCallbackUrl() },
    })
    return { error }
  }

  const resetPassword = async (email: string) => {
    if (!isSupabaseConfigured) return { error: notConfiguredError() }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getCallbackUrl(),
    })
    return { error }
  }

  const signOut = async () => {
    if (!isSupabaseConfigured) return
    await supabase.auth.signOut()
  }

  const refreshProfile = async () => {
    if (!session?.user) return
    await loadProfile(session.user.id, session.user.email ?? '')
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileLoading,
      signIn,
      signUp,
      signInWithGoogle,
      resetPassword,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
