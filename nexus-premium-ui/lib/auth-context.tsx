'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { nexusApi, NexusApiError } from './nexus-api'
import { type Profile, getProfile } from './profile-service'

export const CANONICAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nexus-premium-website-business.vercel.app'

export interface NexusUser { id: string; email: string }
export interface NexusSession { user: NexusUser }
export interface AuthError { message: string; code: string; name: string }

function authError(error: unknown): AuthError {
  if (error instanceof NexusApiError) return { message: error.message, code: error.code, name: error.name }
  return { message: error instanceof Error ? error.message : 'Unable to reach Nexus. Please try again.', code: 'request_failed', name: 'NexusAuthError' }
}

interface AuthContextValue {
  session: NexusSession | null
  user: NexusUser | null
  profile: Profile | null
  loading: boolean
  profileLoading: boolean
  signIn: (email: string) => Promise<{ error: AuthError | null }>
  signUp: (email: string) => Promise<{ error: AuthError | null; needsEmailConfirm?: boolean }>
  signInWithGoogle: () => Promise<{ error: AuthError | null }>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [session, setSession] = useState<NexusSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const loadProfile = useCallback(async (userId: string) => {
    setProfileLoading(true)
    try { setProfile(await getProfile(userId)) }
    finally { setProfileLoading(false) }
  }, [])

  const refreshSession = useCallback(async () => {
    try {
      const result = await nexusApi<{ user: NexusUser }>('/v1/auth/me')
      setSession({ user: result.user })
      await loadProfile(result.user.id)
    } catch {
      setSession(null)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [loadProfile])

  useEffect(() => {
    if (pathname === '/auth/verify') return
    void refreshSession()
    const onAuthenticated = () => { void refreshSession() }
    window.addEventListener('nexus:auth-changed', onAuthenticated)
    return () => window.removeEventListener('nexus:auth-changed', onAuthenticated)
  }, [pathname, refreshSession])

  const requestLink = useCallback(async (email: string) => {
    try {
      await nexusApi('/v1/auth/request-link', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase() }) })
      return { error: null as AuthError | null }
    } catch (error) {
      return { error: authError(error) }
    }
  }, [])

  const signIn = useCallback((email: string) => requestLink(email), [requestLink])
  const signUp = useCallback(async (email: string) => ({ ...(await requestLink(email)), needsEmailConfirm: true }), [requestLink])
  const resetPassword = useCallback((email: string) => requestLink(email), [requestLink])

  const signInWithGoogle = useCallback(async () => ({
    error: { message: 'Google sign-in will be added after the email sign-in flow is connected.', code: 'google_not_configured', name: 'NexusAuthError' },
  }), [])

  const signOut = useCallback(async () => {
    try { await nexusApi('/v1/auth/logout', { method: 'POST', body: '{}' }) }
    finally { setSession(null); setProfile(null) }
  }, [])

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, profileLoading, signIn, signUp, signInWithGoogle, resetPassword, signOut, refreshProfile: () => session ? loadProfile(session.user.id) : Promise.resolve() }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
