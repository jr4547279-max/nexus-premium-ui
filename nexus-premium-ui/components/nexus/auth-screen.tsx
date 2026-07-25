'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { NexusLogo } from './nexus-logo'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OrbitalBackground, GoldenRing } from './golden-ring'
import { Eye, EyeOff, Mail, Lock, ArrowLeft, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { AuthError } from '@supabase/supabase-js'

interface AuthScreenProps {
  onBack: () => void
  onSuccess: () => void
}

function friendlyError(error: AuthError): string {
  switch ((error as { code?: string }).code) {
    case 'invalid_credentials':    return 'Invalid email or password.'
    case 'user_not_found':         return 'No account found with this email.'
    case 'email_not_confirmed':    return 'Please verify your email before signing in.'
    case 'user_already_exists':
    case 'email_exists':           return 'An account with this email already exists.'
    case 'weak_password':          return 'Password must be at least 6 characters.'
    case 'over_request_rate_limit':return 'Too many attempts — please wait a moment.'
    case 'signup_disabled':        return 'Sign-ups are currently disabled.'
    case 'not_configured':         return error.message
    default:                       return error.message || 'Something went wrong. Please try again.'
  }
}

export function AuthScreen({ onBack, onSuccess }: AuthScreenProps) {
  const { signIn, signUp, signInWithGoogle } = useAuth()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  // Separate loading state for Google OAuth — shows spinner only on that button
  // and does not disable the email/password form.
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Please fill in all fields.', { icon: '⚠️' })
      return
    }

    setIsLoading(true)
    try {
      if (mode === 'signup') {
        const { error, needsEmailConfirm } = await signUp(email, password)
        if (error) {
          toast.error(friendlyError(error), { icon: '⚠️' })
        } else if (needsEmailConfirm) {
          toast.success('Account created!', {
            description: 'Check your email for a confirmation link, then sign in.',
            icon: '📧',
            duration: 7000,
          })
          setMode('login')
        } else {
          toast.success('Welcome to Nexus!', { icon: '✨' })
          onSuccess()
        }
      } else {
        const { error } = await signIn(email, password)
        if (error) {
          toast.error(friendlyError(error), { icon: '⚠️' })
        } else {
          toast.success('Welcome back!', { icon: '✨' })
          onSuccess()
        }
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <OrbitalBackground className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="relative z-10 px-6 py-4">
          <div className="max-w-md mx-auto flex items-center">
            <button
              onClick={onBack}
              className="p-2 -ml-2 rounded-full hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-6">
          <div className="w-full max-w-sm">
            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
              <GoldenRing size="md" className="mb-4" />
              <NexusLogo size="md" showText={false} />
              <h1 className="text-xl font-light tracking-wide mt-3">
                {mode === 'login' ? 'Welcome back' : 'Join Nexus'}
              </h1>
              <p className="text-muted-foreground text-xs mt-1 text-center">
                {mode === 'login'
                  ? 'Sign in to continue aligning your plans'
                  : 'Create an account to start organising'}
              </p>
            </div>

            {/* Auth Card */}
            <GlassCard className="p-4">
              <form onSubmit={handleSubmit} className="space-y-3">
                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Full name</label>
                    <Input
                      type="text"
                      placeholder="Enter your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-muted/50 border-border/50 h-10 text-sm"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-muted/50 border-border/50 h-10 pl-9 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-muted/50 border-border/50 h-10 pl-9 pr-9 text-sm"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => toast('Password reset — coming soon', {
                      description: 'Contact support to reset your password for now.',
                      icon: '🔑',
                    })}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                )}

                <Button
                  type="submit"
                  className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl glow-gold text-sm"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      <span>{mode === 'login' ? 'Signing in…' : 'Creating account…'}</span>
                    </div>
                  ) : (
                    <span>{mode === 'login' ? 'Sign in' : 'Create account'}</span>
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              {/* Social login buttons */}
              <div className="space-y-2">
                {/*
                  * Google OAuth — uses supabase.auth.signInWithOAuth({ provider: 'google' }).
                  * Supabase redirects the browser to Google's consent screen; after approval
                  * Google redirects back to /auth/callback?code=XXX where the PKCE code is
                  * exchanged for a session. Works for both sign-in and sign-up — Supabase
                  * creates the account automatically on first OAuth login.
                  *
                  * Prerequisites (must be configured before this button does anything):
                  *   1. Supabase dashboard → Authentication → Providers → Google → Enable
                  *   2. Google Cloud Console → OAuth 2.0 Client → Authorised redirect URIs
                  *      add: https://<project>.supabase.co/auth/v1/callback
                  */}
                <Button
                  variant="outline"
                  type="button"
                  disabled={isGoogleLoading || isLoading}
                  onClick={async () => {
                    setIsGoogleLoading(true)
                    const { error } = await signInWithGoogle()
                    // Only reaches here if an error occurred before the redirect
                    // (e.g. Google provider not enabled in Supabase dashboard).
                    if (error) {
                      toast.error(
                        error.message || 'Google sign-in failed — check Supabase provider settings.',
                        { icon: '⚠️' },
                      )
                      setIsGoogleLoading(false)
                    }
                    // On success the browser navigates away — no further action needed.
                  }}
                  className="w-full h-10 border-border/50 hover:bg-muted/50 text-sm"
                >
                  {isGoogleLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      <span>Redirecting to Google…</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      <span>Continue with Google</span>
                    </div>
                  )}
                </Button>

                {/* Apple — placeholder until Apple provider is configured in Supabase */}
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => toast('Apple sign-in — coming soon', {
                    description: 'Use email/password or Google to sign in for now.',
                    icon: '🔜',
                  })}
                  className="w-full h-10 border-border/50 hover:bg-muted/50 text-sm"
                >
                  <svg className="w-4 h-4 mr-1.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"/>
                  </svg>
                  Continue with Apple
                </Button>
              </div>
            </GlassCard>

            {/* Switch Mode */}
            <p className="text-center text-xs text-muted-foreground mt-4">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="text-primary hover:underline"
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>

            {/* Trust Indicators */}
            <div className="flex items-center justify-center gap-3 mt-6 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Secure</span>
              </div>
              <div className="flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>Private</span>
              </div>
              <div className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Encrypted</span>
              </div>
            </div>
          </div>
        </main>
      </OrbitalBackground>
    </div>
  )
}
