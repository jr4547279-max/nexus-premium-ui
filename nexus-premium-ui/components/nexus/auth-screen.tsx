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
    case 'oauth_redirect_missing': return error.message
    default:                       return error.message || 'Something went wrong. Please try again.'
  }
}

export function AuthScreen({ onBack, onSuccess }: AuthScreenProps) {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
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

  const handleForgotPassword = async () => {
    const requestedEmail = email.trim() || window.prompt('Enter the email address for your Nexus account:')?.trim() || ''
    if (!requestedEmail) return

    const { error } = await resetPassword(requestedEmail)
    if (error) {
      toast.error(friendlyError(error), { icon: '⚠️' })
      return
    }

    setEmail(requestedEmail)
    toast.success('Password reset email sent.', {
      description: 'Check your inbox for the secure reset link.',
      icon: '🔑',
      duration: 7000,
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <OrbitalBackground className="min-h-screen flex flex-col">
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

        <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-6">
          <div className="w-full max-w-sm">
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
                    onClick={handleForgotPassword}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                )}

                <Button
                  type="submit"
                  className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl glow-gold text-sm"
                  disabled={isLoading || isGoogleLoading}
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

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  variant="outline"
                  type="button"
                  disabled={isGoogleLoading || isLoading}
                  onClick={async () => {
                    setIsGoogleLoading(true)
                    const { error } = await signInWithGoogle()
                    if (error) {
                      toast.error(friendlyError(error), { icon: '⚠️' })
                      setIsGoogleLoading(false)
                    }
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
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      <span>Continue with Google</span>
                    </div>
                  )}
                </Button>

                <Button
                  variant="outline"
                  type="button"
                  onClick={() => toast('Apple sign-in is not enabled yet.', {
                    description: 'Google or email/password sign-in is ready to use.',
                    icon: '',
                  })}
                  className="w-full h-10 border-border/50 hover:bg-muted/50 text-sm"
                >
                  <svg className="w-4 h-4 mr-1.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M16.55 12.93c-.02-2.17 1.77-3.21 1.85-3.26-1.01-1.48-2.58-1.68-3.12-1.7-1.3-.14-2.56.78-3.22.78-.67 0-1.7-.76-2.8-.74-1.44.02-2.77.84-3.51 2.12-1.51 2.62-.39 6.48 1.07 8.61.73 1.04 1.58 2.2 2.71 2.16 1.09-.04 1.5-.69 2.82-.69 1.31 0 1.68.69 2.82.67 1.17-.02 1.9-1.05 2.62-2.09.83-1.2 1.17-2.36 1.19-2.42-.03-.01-2.41-.93-2.43-3.44Zm-2.11-6.34c.59-.72.98-1.71.87-2.7-.84.04-1.86.56-2.47 1.28-.54.63-1.02 1.64-.89 2.6.94.07 1.9-.48 2.49-1.18Z" />
                  </svg>
                  Continue with Apple
                </Button>
              </div>
            </GlassCard>

            <p className="text-center text-xs text-muted-foreground mt-4">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="text-primary hover:underline"
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>

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
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
