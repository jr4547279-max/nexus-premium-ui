'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Copy, Check } from 'lucide-react'

interface InviteMemberModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  inviteCode: string | null
}

export function InviteMemberModal({
  open,
  onOpenChange,
  groupName,
  inviteCode,
}: InviteMemberModalProps) {
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [origin, setOrigin] = useState('')

  // Compute origin on the client after mount — guarantees a stable, fully
  // qualified URL regardless of SSR/hydration timing.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin)
    }
  }, [])

  const link = inviteCode && origin ? `${origin}/invite/${inviteCode}` : ''

  const copy = async (text: string, kind: 'link' | 'code') => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      if (kind === 'link') {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 1500)
      } else {
        setCopiedCode(true)
        setTimeout(() => setCopiedCode(false), 1500)
      }
      toast.success(kind === 'link' ? 'Invite link copied' : 'Invite code copied')
    } catch {
      toast.error('Could not copy — please copy manually')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite to {groupName}</DialogTitle>
          <DialogDescription>
            Share this link or code with anyone you want to add. They'll join
            this group as soon as they sign in.
          </DialogDescription>
        </DialogHeader>

        {!inviteCode ? (
          <p className="text-sm text-muted-foreground py-4">
            Loading invite link…
          </p>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-link">Invite link</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-link"
                  value={link}
                  readOnly
                  className="text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copy(link, 'link')}
                  aria-label="Copy invite link"
                >
                  {copiedLink ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-code">Invite code</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-code"
                  value={inviteCode}
                  readOnly
                  className="font-mono tracking-widest text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copy(inviteCode, 'code')}
                  aria-label="Copy invite code"
                >
                  {copiedCode ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
