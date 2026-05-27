'use client'

import { useState } from 'react'
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
import { createGroup } from '@/lib/group-service'
import { toast } from 'sonner'

interface CreateGroupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (groupId: string) => void
}

const EMOJI_CHOICES = ['👥', '🍺', '👨‍👩‍👧‍👦', '🏔️', '🍕', '🎉', '☕', '🎬', '⚽', '✈️']

export function CreateGroupModal({ open, onOpenChange, onCreated }: CreateGroupModalProps) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('👥')
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setName('')
    setEmoji('👥')
    setSubmitting(false)
  }

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    const group = await createGroup(trimmed, emoji)
    setSubmitting(false)
    if (!group) {
      toast.error('Could not create group. Please try again.')
      return
    }
    toast.success(`Created ${emoji} ${group.name}`)
    onCreated?.(group.id)
    onOpenChange(false)
    reset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create a new group</DialogTitle>
          <DialogDescription>
            Give your group a name and pick an emoji. You'll be the owner.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Friday Drinks"
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Emoji</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setEmoji(choice)}
                  className={
                    'w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors ' +
                    (emoji === choice
                      ? 'bg-primary/20 ring-1 ring-primary'
                      : 'bg-muted/50 hover:bg-muted')
                  }
                  aria-label={`Pick ${choice}`}
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || submitting}>
            {submitting ? 'Creating…' : 'Create group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
