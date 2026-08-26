'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Loader2, Search, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addGroupMemberByUsername, getPublicProfile, searchGroupMemberCandidates, type PublicProfile } from '@/lib/profile-discovery-service'

interface InviteMemberModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  inviteCode: string | null
  groupId: string
  onMemberAdded?: () => void
}

type Candidate = { user_id: string; username: string | null; display_name: string | null; avatar_url: string | null }

export function InviteMemberModal({ open, onOpenChange, groupName, inviteCode, groupId, onMemberAdded }: InviteMemberModalProps) {
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [origin, setOrigin] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<PublicProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setResults([])
    setSelected(null)
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearching(false); return }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const rows = await searchGroupMemberCandidates(groupId, q)
        if (!cancelled) setResults(rows as Candidate[])
      } catch (error) {
        if (!cancelled) toast.error('Username search failed', { description: error instanceof Error ? error.message : 'Please try again.' })
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 220)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query, groupId])

  const link = inviteCode && origin ? `${origin}/invite/${inviteCode}` : ''

  const copy = async (text: string, kind: 'link' | 'code') => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      if (kind === 'link') { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 1500) }
      else { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 1500) }
      toast.success(kind === 'link' ? 'Invite link copied' : 'Invite code copied')
    } catch { toast.error('Could not copy — please copy manually') }
  }

  const viewProfile = async (candidate: Candidate) => {
    if (!candidate.username) return
    setLoadingProfile(true)
    try {
      const profile = await getPublicProfile(candidate.username)
      if (!profile) toast.error('Profile unavailable', { description: 'This profile could not be loaded.' })
      else setSelected(profile)
    } finally { setLoadingProfile(false) }
  }

  const addSelected = async () => {
    if (!selected || adding) return
    setAdding(true)
    try {
      const result = await addGroupMemberByUsername(groupId, selected.username)
      if (!result?.success) throw new Error(result?.error_message || 'Could not add this person.')
      toast.success(result.already_member ? 'Already in the group' : `${selected.display_name || selected.username} added to ${groupName}`)
      setSelected(null)
      setQuery('')
      setResults([])
      onMemberAdded?.()
    } catch (error) {
      toast.error('Could not add member', { description: error instanceof Error ? error.message : 'Please try again.' })
    } finally { setAdding(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite to {groupName}</DialogTitle>
          <DialogDescription>Find a Nexus member by username, view their profile, then add them to the group.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search username…" className="pl-10" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />}
          </div>

          {query.trim().length >= 2 && !selected && (
            <div className="space-y-2">
              {!searching && results.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No available Nexus members found.</p>}
              {results.map(candidate => (
                <button key={candidate.user_id} onClick={() => viewProfile(candidate)} className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:bg-muted/30 text-left">
                  {candidate.avatar_url ? <img src={candidate.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium">{(candidate.display_name || candidate.username || '?')[0].toUpperCase()}</div>}
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{candidate.display_name || candidate.username}</p><p className="text-xs text-primary truncate">@{candidate.username}</p></div>
                  <span className="text-[10px] text-primary">View</span>
                </button>
              ))}
            </div>
          )}

          {loadingProfile && <div className="flex justify-center py-5"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}

          {selected && (
            <div className="rounded-2xl border border-border/40 bg-muted/10 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {selected.avatar_url ? <img src={selected.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-primary/20" /> : <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-medium">{(selected.display_name || selected.username)[0].toUpperCase()}</div>}
                  <div><p className="font-semibold">{selected.display_name || selected.username}</p><p className="text-xs text-primary">@{selected.username}</p></div>
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-full hover:bg-muted/30" aria-label="Close profile"><X className="w-4 h-4" /></button>
              </div>
              {selected.bio && <p className="text-xs text-muted-foreground mt-4 leading-relaxed">{selected.bio}</p>}
              {!!selected.favourite_activities?.length && <div className="flex flex-wrap gap-1.5 mt-3">{selected.favourite_activities.slice(0, 6).map(a => <span key={a} className="px-2 py-1 rounded-full bg-primary/10 text-[10px] text-primary">{a}</span>)}</div>}
              <Button onClick={addSelected} disabled={adding} className="w-full mt-4 h-10 rounded-xl">
                {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                {adding ? 'Adding…' : 'Add to group'}
              </Button>
            </div>
          )}

          <div className="pt-3 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Or share an invite</p>
            {!inviteCode ? <p className="text-sm text-muted-foreground py-2">Loading invite link…</p> : <div className="space-y-3">
              <div className="space-y-2"><Label htmlFor="invite-link">Invite link</Label><div className="flex gap-2"><Input id="invite-link" value={link} readOnly className="text-xs" onFocus={e => e.currentTarget.select()} /><Button type="button" variant="outline" size="icon" onClick={() => copy(link, 'link')} aria-label="Copy invite link">{copiedLink ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}</Button></div></div>
              <div className="space-y-2"><Label htmlFor="invite-code">Invite code</Label><div className="flex gap-2"><Input id="invite-code" value={inviteCode} readOnly className="font-mono tracking-widest text-center" /><Button type="button" variant="outline" size="icon" onClick={() => copy(inviteCode, 'code')} aria-label="Copy invite code">{copiedCode ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}</Button></div></div>
            </div>}
          </div>
        </div>

        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
