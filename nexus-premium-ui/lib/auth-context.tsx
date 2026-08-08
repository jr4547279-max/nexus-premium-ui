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
//   silently falls back to its configured Site URL — which is typically the
//   *production* .replit.app domain. That causes the dev preview (.replit.dev)
//   to bounce the user to the published app immediately after sign-in.
//
// Resolution order (most-specific → least-specific):
//   1. NEXT_PUBLIC_SITE_URL  — set explicitly for the production deployment;
//      pinned to the stable .replit.app URL.  Do NOT set this in the shared
//      environment; leave it for the production env only.
//   2. NEXT_PUBLIC_REPLIT_DEV_DOMAIN — baked at build time from REPLIT_DEV_DOMAIN
//      (injected by next.config.mjs → env). Resolves to the exact hostname of
//      the current Replit workspace (dev preview or deployed app).
//   3. window.location.origin — runtime fallback; always correct in the browser.
//
// When to add a URL to Supabase Redirect URLs:
//   Authentication → URL Configuration → Redirect URLs
//   Add both:
//     https://<NEXT_PUBLIC_REPLIT_DEV_DOMAIN>/auth/callback   ← dev preview
//     https://*.replit.app/**                                  ← production
// ---------------------------------------------------------------------------
function getCallbackUrl(): string {
  // 1. Explicit production pin (set only in production env, not shared)
  const pinned = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (pinned) return `${pinned}/auth/callback`

  // 2. Build-time Replit domain (works before window is available, and survives
  //    hydration without a mismatch — both server and client see the same value)
  const replitDomain = process.env.NEXT_PUBLIC_REPLIT_DEV_DOMAIN?.trim()
  if (replitDomain) return `https://${replitDomain}/auth/callback`

  // 3. Runtime browser origin — correct for any other environment
  if (typeof window !== 'undefined') return `${window.location.origin}/auth/callback`

  return '/auth/callback'
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
    // Safety cap: if the Supabase profiles query hangs (slow network, paused
    // project), release the loading state after 8 s so the user is never stuck
    // on the resolving splash indefinitely.
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

    // Track which user we've already loaded a profile for so transient events
    // like TOKEN_REFRESHED don't trigger redundant fetches (which flip
    // profileLoading and cause spurious re-renders / navigation flicker).
    let loadedForUserId: string | null = null

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AUTH] event', { event, hasSession: !!session, userId: session?.user?.id ?? null })
      setLoading(false)

      const uid = session?.user?.id ?? null

      if (!uid || !session) {
        // Only treat as signed-out for explicit sign-out events. This protects
        // against transient null sessions (e.g. brief refresh failures or
        // INITIAL_SESSION races) that would otherwise bounce the user back to
        // the landing screen. For any non-SIGNED_OUT null event, keep the
        // previous session intact and do nothing.
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

      // We have a real session — adopt it.
      setSession(session)

      // Refresh the profile when the user changes, on first sign-in, or when
      // the user record was updated. Skip on TOKEN_REFRESHED to avoid churn.
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
          error: {
            message: 'Supabase is not configured yet. Add your secrets to enable real auth.',
            code: 'not_configured',
            name: 'AuthError',
            status: 0,
          } as unknown as AuthError,
        }
      }
      // signInWithPassword returns the session inline — no browser redirect.
      // (emailRedirectTo is not an option here; it only applies to signUp and
      //  signInWithOtp. Confirmation emails are only sent for new accounts.)
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Confirmation email links must resolve on the CURRENT origin so new
          // accounts confirmed on the dev preview stay on .replit.dev.
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

  // ---------------------------------------------------------------------------
  // Google OAuth
  // Calls supabase.auth.signInWithOAuth which redirects the browser to Google.
  // After consent, Google redirects to /auth/callback?code=XXX where the PKCE
  // code is exchanged for a real session, then the user is sent to the dashboard.
  //
  // The redirectTo URL MUST be whitelisted in your Supabase project under
  // Authentication → URL Configuration → Redirect URLs. Add wildcard patterns
  // for Replit so every preview and deployed origin is covered:
  //
  //   https://*.replit.dev/**      ← Replit preview (dev) URLs
  //   https://*.replit.app/**      ← Replit deployed URLs
  //   http://localhost:5000/**     ← Local dev
  //
  // If redirectTo is not in the allowed list, Supabase silently falls back to
  // its Site URL — which will send users to the wrong page.
  //
  // Set NEXT_PUBLIC_SITE_URL to pin a stable callback origin in production
  // (e.g. https://yourapp.replit.app). When absent, window.location.origin is
  // used, which always matches the current tab — correct for preview & deployed.
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

    // Use getCallbackUrl() — see its definition above for resolution order.
    // The resolved URL must be whitelisted in Supabase → Authentication →
    // URL Configuration → Redirect URLs. For Replit, add:
    //   https://<your-repl-dev-domain>/auth/callback   ← dev preview
    //   https://*.replit.app/**                         ← production
    const redirectTo = getCallbackUrl()

    console.log('[auth] signInWithGoogle → redirectTo:', redirectTo,
      '| Add this URL to Supabase → Authentication → URL Configuration → Redirect URLs if sign-in fails.')

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
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
