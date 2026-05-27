'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/nexus/glass-card'
import { GoldenRing } from '@/components/nexus/golden-ring'
import { useAuth } from '@/lib/auth-context'
import {
  getGroupByInvite,
  joinGroupByInvite,
  type InvitePreview,
} from '@/lib/group-service'
import { toast } from 'sonner'

const PENDING_INVITE_KEY = 'nexus.pendingInviteCode'

/**
 * Persist an invite code so that, after the user signs in via the existing
 * landing/auth flow, NexusApp can finish joining the group automatically.
 */
function storePendingInvite(code: string) {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, code)
  } catch {
    /* private mode etc. — non-fatal */
  }
}

export default function InvitePage() {
  const params = useParams<{ code: string }>()
  const router = useRouter()
  const { session, loading } = useAuth()
  const code = (params?.code ?? '').toString().toUpperCase()

  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load the group preview (works for both signed-in and signed-out users
  // because get_group_by_invite is granted to anon as well).
  useEffect(() => {
    let cancelled = false
    if (!code) return
    setPreviewLoading(true)
    getGroupByInvite(code).then((p) => {
      if (cancelled) return
      setPreview(p)
      setPreviewLoading(false)
      if (!p) setError('This invite link is invalid or has expired.')
    })
    return () => {
      cancelled = true
    }
  }, [code])

  const handleJoin = async () => {
    if (!session) {
      // Stash the code; NexusApp picks it up after sign-in.
      storePendingInvite(code)
      router.push('/')
      return
    }
    setJoining(true)
    const { groupId, errorMessage } = await joinGroupByInvite(code)
    setJoining(false)
    if (!groupId) {
      setError(errorMessage ?? 'Could not join the group.')
      toast.error(errorMessage ?? 'Could not join the group.')
      return
    }
    toast.success(`Joined ${preview?.emoji ?? '👥'} ${preview?.name ?? 'the group'}`)
    router.push('/')
  }

  if (loading || previewLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <GoldenRing size="md" intensity="subtle" />
          <p className="text-muted-foreground text-xs tracking-widest animate-pulse">
            NEXUS
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <GlassCard className="w-full max-w-sm p-6 space-y-5">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center text-5xl">
            {preview?.emoji ?? '👥'}
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              You're invited to
            </p>
            <h1 className="text-2xl font-medium mt-1">
              {preview?.name ?? 'Unknown group'}
            </h1>
            {preview && (
              <p className="text-sm text-muted-foreground mt-1">
                {preview.member_count} member{preview.member_count === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <div className="space-y-2">
          {preview && (
            <Button
              onClick={handleJoin}
              disabled={joining}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
            >
              {joining
                ? 'Joining…'
                : session
                ? 'Join group'
                : 'Sign in to join'}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => router.push('/')}
            className="w-full"
          >
            Not now
          </Button>
        </div>
      </GlassCard>
    </div>
  )
}
