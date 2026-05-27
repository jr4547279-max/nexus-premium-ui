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
  // Google OAuth — initiates a redirect to Google's consent screen.
  // On return, /auth/callback exchanges the PKCE code for a Supabase session.
  signInWithGoogle: () => Promise<{ error: AuthError | null }>
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
    try {
      let p = await getProfile(userId)
      if (!p) {
        p = await ensureProfile(userId, email)
      }
      setProfile(p)
    } catch {
      // Non-fatal: profile table may not exist yet
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    const timeout = setTimeout(() => setLoading(false), 5000)

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        setLoading(false)
        if (session?.user) {
          loadProfile(session.user.id, session.user.email ?? '')
        }
      })
      .catch(() => setLoading(false))
      .finally(() => clearTimeout(timeout))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
      if (session?.user) {
        loadProfile(session.user.id, session.user.email ?? '')
      } else {
        setProfile(null)
      }
    })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return
    await loadProfile(session.user.id, session.user.email ?? '')
  }, [session, loadProfile])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!isSupabaseConfigured) {
        return {
          error: {
            message: 'Supabase is not configured yet. Add your secrets to enable real auth.',
            code: 'not_configured',
            name: 'AuthError',
            status: 0,
          } as unknown as AuthError,
        }
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error }
    },
    [],
  )

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!isSupabaseConfigured) {
        return {
          error: {
            message: 'Supabase is not configured yet. Add your secrets to enable real auth.',
            code: 'not_configured',
            name: 'AuthError',
            status: 0,
          } as unknown as AuthError,
        }
      }
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (!error && data.user) {
        await ensureProfile(data.user.id, email)
      }
      const needsEmailConfirm = !error && !data.session
      return { error, needsEmailConfirm }
    },
    [],
  )

  // ---------------------------------------------------------------------------
  // Google OAuth
  // Calls supabase.auth.signInWithOAuth which redirects the browser to Google.
  // After consent, Google redirects to /auth/callback?code=XXX where the PKCE
  // code is exchanged for a real session, then the user is sent to the dashboard.
  // The redirectTo must be listed as an allowed redirect URL in your Supabase
  // project (Authentication → URL Configuration) and as an authorised redirect
  // URI in Google Cloud Console (OAuth 2.0 Client → Authorised redirect URIs).
  // ---------------------------------------------------------------------------
  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      return {
        error: {
          message: 'Supabase is not configured yet. Add your secrets to enable real auth.',
          code: 'not_configured',
          name: 'AuthError',
          status: 0,
        } as unknown as AuthError,
      }
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // /auth/callback exchanges the PKCE code for a session, then → /
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'openid email profile',
      },
    })

    // This only returns if an error occurred before the redirect.
    // On success the browser navigates away and this line is never reached.
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut()
    }
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
