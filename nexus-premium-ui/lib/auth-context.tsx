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

// ---------------------------------------------------------------------------
// getCallbackUrl()
//
// Returns the absolute URL for /auth/callback on the CURRENT origin.
//
// Why this matters:
//   Supabase validates every `redirectTo` / `emailRedirectTo` against its
//   "Redirect URLs" allow-list. If the URL is not on the list, Supabase
//   silently falls back to its configured Site URL — which sends the user to
//   the wrong deployment.
//
// Resolution order:
//   1. window.location.origin — always the exact domain the user is currently
//      on. This survives preview/deployment domain changes. signInWithGoogle()
//      is only ever called from a browser click, so window is available.
//   2. NEXT_PUBLIC_SITE_URL — explicit server-side fallback for a stable
//      production origin.
//
// Supabase → Authentication → URL Configuration → Redirect URLs must include
// the origins where NEXUS is actually deployed. For Vercel previews this
// normally includes https://*.vercel.app/**, plus the stable production domain.
// ---------------------------------------------------------------------------
function getCallbackUrl(): string {
  if (typeof window !== 'undefined') {
    const url = `${window.location.origin}/auth/callback`
    console.log('[AUTH] Current origin:', window.location.origin)
    console.log('[AUTH] Redirect URL:', url)
    return url
  }

  const pinned = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (pinned) return `${pinned}/auth/callback`

  return '/auth/callback'
}

function authError(message: string, code: string): AuthError {
  return {
    message,
    code,
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
    const profileTimeout = setTimeout(() => setProfileLoading(false), 8000)
    try {
      let p = await getProfile(userId)
      if (!p) {
        p = await ensureProfile(userId, email)
      }
      setProfile(p)
    } catch {
      // Non-fatal: profile table may not exist yet
    } finally {
      clearTimeout(profileTimeout)
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

    let loadedForUserId: string | null = null

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AUTH] event', { event, hasSession: !!session, userId: session?.user?.id ?? null })
      setLoading(false)

      const uid = session?.user?.id ?? null

      if (!uid || !session) {
        if (event === 'SIGNED_OUT') {
          console.log('[AUTH] explicit SIGNED_OUT — clearing session/profile')
          loadedForUserId = null
          setSession(null)
          setProfile(null)
        } else {
          console.log('[AUTH] ignoring null-session event', event)
        }
        return
      }

      setSession(session)

      const isNewUser = uid !== loadedForUserId
      if (isNewUser || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        loadedForUserId = uid
        loadProfile(uid, session.user.email ?? '')
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
          error: authError('Supabase is not configured yet. Add your secrets to enable real auth.', 'not_configured'),
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
          error: authError('Supabase is not configured yet. Add your secrets to enable real auth.', 'not_configured'),
        }
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getCallbackUrl(),
        },
      })
      if (!error && data.user) {
        await ensureProfile(data.user.id, email)
      }
      const needsEmailConfirm = !error && !data.session
      return { error, needsEmailConfirm }
    },
    [],
  )

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      return {
        error: authError('Supabase is not configured yet. Add your secrets to enable real auth.', 'not_configured'),
      }
    }

    if (typeof window === 'undefined') {
      return {
        error: authError('Google sign-in must be started in a browser.', 'browser_required'),
      }
    }

    const redirectTo = getCallbackUrl()
    console.log('[AUTH] OAuth callback:', redirectTo)

    try {
      // Ask Supabase for the provider URL without letting the SDK own the
      // browser navigation. This prevents mobile browsers from being left in a
      // permanent loading state when the SDK returns but does not navigate.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'openid email profile',
          skipBrowserRedirect: true,
        },
      })

      if (error) return { error }
      if (!data.url) {
        return {
          error: authError(
            'Google sign-in could not start. Check the Supabase Google provider and redirect URL configuration.',
            'oauth_url_missing',
          ),
        }
      }

      const originBeforeRedirect = window.location.href
      window.location.assign(data.url)

      // If navigation is blocked or silently fails, release the caller from
      // its loading state instead of spinning forever. A successful navigation
      // unloads this page before the timeout resolves.
      await new Promise((resolve) => setTimeout(resolve, 2500))
      if (window.location.href === originBeforeRedirect) {
        return {
          error: authError(
            'Google sign-in did not open. Please try again or use email sign-in.',
            'oauth_redirect_blocked',
          ),
        }
      }

      return { error: null }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Google sign-in failed before redirect.'
      return { error: authError(message, 'oauth_start_failed') }
    }
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
