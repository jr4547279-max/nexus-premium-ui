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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createGroup } from '@/lib/group-service'
import { toast } from 'sonner'
import { ActivityPickerContent, ActivityBadge } from './activity-picker'
import { isCustomActivity } from '@/lib/activities/types'
import type { AnyActivity } from '@/lib/activities/types'

interface CreateGroupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (groupId: string, activity?: AnyActivity) => void
}

const EMOJI_CHOICES = ['👥', '🍺', '👨‍👩‍👧‍👦', '🏔️', '🍕', '🎉', '☕', '🎬', '⚽', '✈️']

type Step = 'details' | 'activity'

export function CreateGroupModal({ open, onOpenChange, onCreated }: CreateGroupModalProps) {
  const [step, setStep] = useState<Step>('details')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('👥')
  const [activity, setActivity] = useState<AnyActivity | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setStep('details')
    setName('')
    setEmoji('👥')
    setActivity(null)
    setSubmitting(false)
  }

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    console.log('[CreateGroupModal] handleCreate — start', { trimmed, emoji, activity })

    // Build the storage ID: registry ID for predefined, 'custom:<label>' for custom.
    const activityStorageId = activity
      ? isCustomActivity(activity) ? `custom:${activity.label}` : activity.id
      : undefined

    try {
      console.log('[CreateGroupModal] calling createGroup', { trimmed, emoji, activityStorageId })
      const { group, errorMessage } = await createGroup(trimmed, emoji, activityStorageId)
      console.log('[CreateGroupModal] createGroup returned', { group: group?.id, errorMessage })

      if (!group) {
        toast.error(errorMessage ?? 'Could not create group. Please try again.')
        return
      }

      // If the group was created but activity save failed, still proceed —
      // show a gentle warning rather than blocking the user.
      if (errorMessage) {
        console.warn('[CreateGroupModal] group created with activity warning:', errorMessage)
        toast.warning('Group created — activity could not be saved yet.')
      } else {
        toast.success(`Created ${emoji} ${group.name}`)
      }

      console.log('[CreateGroupModal] calling onCreated / closing modal')
      onCreated?.(group.id, activity ?? undefined)
      onOpenChange(false)
      reset()
    } catch (err) {
      console.error('[CreateGroupModal] handleCreate unexpected error', err)
      toast.error('Something went wrong. Please try again.')
    } finally {
      // Always release the button — no matter what happened above.
      setSubmitting(false)
    }
  }

  const handleActivitySelect = (selected: AnyActivity) => {
    setActivity(selected)
    // Auto-advance back — the user picked their activity
    setTimeout(() => setStep('details'), 150)
  }

  // ── Render: step 1 — group details ─────────────────────────────────────────
  const detailsStep = (
    <>
      <DialogHeader>
        <DialogTitle>Create a new group</DialogTitle>
        <DialogDescription>
          Give your group a name, pick an emoji, and optionally choose an activity.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {/* Group name */}
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
                if (name.trim()) setStep('activity')
              }
            }}
          />
        </div>

        {/* Emoji */}
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

        {/* Activity */}
        <div className="space-y-2">
          <Label>Activity <span className="text-muted-foreground font-normal">(optional)</span></Label>
          {activity ? (
            <ActivityBadge
              activity={activity}
              onClick={() => setStep('activity')}
              onClear={() => setActivity(null)}
              className="w-full"
            />
          ) : (
            <button
              type="button"
              onClick={() => setStep('activity')}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground border border-dashed border-border/60 hover:border-primary/50 hover:text-foreground transition-all duration-150"
            >
              <span className="flex-1 text-left">What are you planning to do?</span>
              <ChevronRight className="w-4 h-4 shrink-0" />
            </button>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          disabled={!name.trim() || submitting}
        >
          {submitting ? 'Creating…' : 'Create group'}
        </Button>
      </DialogFooter>
    </>
  )

  // ── Render: step 2 — activity picker ───────────────────────────────────────
  const activityStep = (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep('details')}
            className="p-1 -ml-1 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <DialogTitle>Choose an Activity</DialogTitle>
        </div>
        <DialogDescription className="pl-6">
          What&apos;s the plan for{' '}
          <span className="font-medium text-foreground">{emoji} {name || 'this group'}</span>?
        </DialogDescription>
      </DialogHeader>

      <div className="py-2 max-h-[60vh] overflow-y-auto">
        <ActivityPickerContent onSelect={handleActivitySelect} compact />
      </div>
    </>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        {step === 'details' ? detailsStep : activityStep}
      </DialogContent>
    </Dialog>
  )
}
