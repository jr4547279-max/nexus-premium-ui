'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { Session, User, AuthError } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from './supabase'
import { type Profile, getProfile, ensureProfile } from './profile-service'

function getCallbackUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`
  }

  const pinned = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '')
  if (pinned) return `${pinned}/auth/callback`
  return '/auth/callback'
}

function notConfiguredError(): AuthError {
  return {
    message: 'Supabase is not configured yet. Add your production secrets to enable real auth.',
    code: 'not_configured',
    name: 'AuthError',
    status: 0,
  } as unknown as AuthError
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  profileLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signUp: (email: string, password: string) => Promise<{
    error: AuthError | null
    needsEmailConfirm?: boolean
  }>
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

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return
    await loadProfile(session.user.id, session.user.email ?? '')
  }, [session, loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: notConfiguredError() }
    const cleanEmail = email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })
    if (!error && data.session?.user) {
      setSession(data.session)
      void loadProfile(data.session.user.id, data.session.user.email ?? cleanEmail)
    }
    return { error }
  }, [loadProfile])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: notConfiguredError() }
    const cleanEmail = email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { emailRedirectTo: getCallbackUrl() },
    })
    if (!error && data.user) {
      await ensureProfile(data.user.id, cleanEmail)
    }
    return { error, needsEmailConfirm: !error && !data.session }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) return { error: notConfiguredError() }

    // Ask Supabase for the provider URL without relying on its implicit browser
    // redirect. Explicit navigation is more reliable on mobile browsers and
    // avoids leaving the UI stuck on "Redirecting to Google…" if the client
    // returns before navigation has occurred.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getCallbackUrl(),
        scopes: 'openid email profile',
        skipBrowserRedirect: true,
      },
    })

    if (error) return { error }
    if (!data.url) {
      return {
        error: {
          message: 'Google sign-in could not create a redirect URL. Check the Google provider configuration in Supabase.',
          code: 'oauth_redirect_missing',
          name: 'AuthError',
          status: 0,
        } as unknown as AuthError,
      }
    }

    if (typeof window !== 'undefined') {
      window.location.assign(data.url)
    }

    return { error: null }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) return { error: notConfiguredError() }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: getCallbackUrl(),
    })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
