'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { NexusLogo } from './nexus-logo'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OrbitalBackground, GoldenRing } from './golden-ring'
import { ArrowLeft, Mail } from 'lucide-react'
import { toast } from 'sonner'
import type { AuthError } from '@/lib/auth-context'

interface AuthScreenProps { onBack: () => void; onSuccess: () => void }

function friendlyError(error: AuthError): string {
  if (error.code === 'rate_limited') return 'Too many attempts. Give it a few minutes and try again.'
  if (error.code === 'email_unavailable') return 'Email sign-in is not connected yet. Your details were not sent anywhere.'
  if (error.code === 'google_not_configured') return error.message
  return error.message || 'Something went wrong. Please try again.'
}

export function AuthScreen({ onBack }: AuthScreenProps) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [linkSent, setLinkSent] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.trim()) { toast.error('Enter your email address.'); return }
    setIsLoading(true)
    try {
      const { error } = mode === 'signup' ? await signUp(email) : await signIn(email)
      if (error) { toast.error(friendlyError(error)); return }
      setLinkSent(true)
      toast.success('Check your inbox for your secure sign-in link.', { duration: 7000 })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <OrbitalBackground className="min-h-screen flex flex-col">
        <header className="relative z-10 px-6 py-4">
          <div className="max-w-md mx-auto flex items-center">
            <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-muted/50 transition-colors" aria-label="Back">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
        </header>
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-6">
          <div className="w-full max-w-sm">
            <div className="flex flex-col items-center mb-8">
              <GoldenRing size="md" className="mb-4" />
              <NexusLogo size="md" showText={false} />
              <h1 className="text-xl font-light tracking-wide mt-3">{linkSent ? 'Check your email' : mode === 'login' ? 'Welcome back' : 'Join Nexus'}</h1>
              <p className="text-muted-foreground text-xs mt-1 text-center">
                {linkSent ? `We sent a one-time sign-in link to ${email.trim()}. It expires in 15 minutes.` : 'Sign in securely with a one-time email link.'}
              </p>
            </div>
            <GlassCard className="p-4">
              {linkSent ? (
                <div className="space-y-4 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-primary/30 bg-primary/10"><Mail className="h-5 w-5 text-primary" /></div>
                  <p className="text-xs text-muted-foreground">The link can only be used once. If you do not see it, check your spam folder.</p>
                  <Button variant="outline" className="w-full" onClick={() => setLinkSent(false)}>Use a different email</Button>
                  <button type="button" className="text-xs text-primary hover:underline" disabled={isLoading} onClick={() => void handleSubmit({ preventDefault() {} } as React.FormEvent)}>
                    Send the link again
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="nexus-email" className="text-xs text-muted-foreground">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="nexus-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} className="bg-muted/50 border-border/50 h-11 pl-9 text-sm" required />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm" disabled={isLoading}>
                    {isLoading ? 'Sending secure link…' : mode === 'login' ? 'Email me a sign-in link' : 'Create account by email'}
                  </Button>
                  <p className="text-center text-[11px] text-muted-foreground">No password to remember. The link expires after 15 minutes.</p>
                </form>
              )}
            </GlassCard>
            {!linkSent && <div className="mt-5 text-center text-xs text-muted-foreground">
              {mode === 'login' ? 'New to Nexus?' : 'Already have an account?'}{' '}
              <button type="button" className="text-primary hover:underline" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
                {mode === 'login' ? 'Create an account' : 'Sign in'}
              </button>
            </div>}
            <p className="mt-6 text-center text-[10px] text-muted-foreground/70">Google sign-in can be added later. Email verification is the only active authentication method.</p>
          </div>
        </main>
      </OrbitalBackground>
    </div>
  )
}
