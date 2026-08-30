'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, Clock3, Loader2, MapPin, Navigation, Radio, ShieldCheck, Users, X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useLiveEvent } from '@/hooks/use-live-event'
import { scheduleFromGoldenWindow } from '@/lib/live-event-service'
import { loadSavedGoldenWindow } from '@/lib/golden-window-persistence'
import { getGroup, listGroupMembers, type Group, type GroupMember } from '@/lib/group-service'
import { cn } from '@/lib/utils'
import LiveLocationMap from './live-location-map'

interface LiveEventScreenProps {
  groupId: string
  onBack: () => void
}

function formatCountdown(totalSeconds: number) {
  const abs = Math.max(0, Math.abs(totalSeconds))
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const s = abs % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatWindow(isoStart: string, isoEnd: string) {
  const start = new Date(isoStart)
  const end = new Date(isoEnd)
  const day = start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = `${start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  return `${day} · ${time}`
}

export function LiveEventScreen({ groupId, onBack }: LiveEventScreenProps) {
  const { user } = useAuth()
  const live = useLiveEvent(groupId)
  const [group, setGroup] = useState<Group | null>(null)
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([])
  const [scheduling, setScheduling] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([getGroup(groupId), listGroupMembers(groupId)]).then(([nextGroup, members]) => {
      if (!alive) return
      setGroup(nextGroup)
      setGroupMembers(members)
    })
    return () => { alive = false }
  }, [groupId])

  useEffect(() => {
    // The server also refuses location writes outside the live window. This
    // client-side guard immediately ends the browser watcher when the event
    // transitions to ended/cancelled.
    if (!live.isLive && live.isSharing) live.stopSharing()
  }, [live.isLive, live.isSharing, live.stopSharing])

  const memberNames = useMemo(() => {
    const map = new Map<string, string>()
    groupMembers.forEach((member) => {
      map.set(member.user_id, member.user_id === user?.id ? 'You' : (member.display_name || member.email?.split('@')[0] || 'Member'))
    })
    return map
  }, [groupMembers, user?.id])

  const handleSchedule = async () => {
    if (scheduling || !user?.id) return
    setScheduling(true)
    setScheduleError(null)
    try {
      const saved = await loadSavedGoldenWindow(groupId)
      if (!saved.window) {
        setScheduleError('Create a Golden Window first, then come back here.')
        return
      }
      const result = await scheduleFromGoldenWindow(groupId, saved.window, {
        title: `${group?.name ?? 'Group'} · Live Meetup`,
        description: 'Live meetup with optional location sharing during the Golden Window.',
        invitedMemberIds: groupMembers.map((member) => member.user_id),
        arrivalRadiusM: 75,
      })
      if (result.errorMessage) setScheduleError(result.errorMessage)
      else await live.refresh()
    } finally {
      setScheduling(false)
    }
  }

  const handleShare = async () => { await live.startSharing() }

  const isPending = live.status === 'pending'
  const isLive = live.status === 'live'
  const isEnded = live.status === 'ended' || live.status === 'cancelled'
  const hasLocations = live.locations.length > 0

  return (
    <main className="min-h-screen bg-background text-foreground pb-8">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/20 bg-background/90 px-4 py-4 backdrop-blur-xl">
        <button type="button" onClick={onBack} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card/40 hover:bg-card/70"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><Radio className={cn('h-4 w-4', isLive ? 'text-emerald-400 animate-pulse' : 'text-primary')} /><h1 className="truncate text-lg font-semibold">Live Meetup</h1></div>
          <p className="truncate text-xs text-muted-foreground">{group?.name ?? 'Your group'}</p>
        </div>
        {isLive && <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold tracking-wider text-emerald-400">LIVE</span>}
      </header>

      <div className="mx-auto max-w-2xl space-y-4 p-4">
        {!live.event && !live.isLoading && (
          <section className="rounded-2xl border border-primary/20 bg-card/50 p-5 shadow-[0_0_50px_rgba(201,160,48,0.08)]">
            <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Navigation className="h-5 w-5" /></div><div><h2 className="font-semibold">Make this meetup live</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">Nexus will use your Golden Window as the meetup slot. Location sharing is optional and only starts when a member chooses it.</p></div></div>
            <button type="button" onClick={handleSchedule} disabled={scheduling} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-50">{scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}Schedule Live Meetup</button>
            {scheduleError && <ErrorBox message={scheduleError} />}
          </section>
        )}

        {live.event && (
          <>
            <section className="rounded-2xl border border-border/25 bg-card/50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-muted-foreground">{isPending ? 'Starts in' : isLive ? 'Ends in' : 'Meetup'}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{live.countdown ? formatCountdown(live.countdown.totalSeconds) : isEnded ? 'Finished' : '—'}</p></div><div className="text-right text-xs text-muted-foreground">{formatWindow(live.event.window_start, live.event.window_end)}</div></div></section>

            {isLive && <section className="overflow-hidden rounded-2xl border border-emerald-400/20 bg-card/50">
              <div className="relative h-[360px] w-full"><LiveLocationMap locations={live.locations} memberNames={memberNames} destination={live.currentStop?.latitude != null && live.currentStop?.longitude != null ? { lat: live.currentStop.latitude, lng: live.currentStop.longitude, name: live.currentStop.name } : null} /><div className="absolute left-3 top-3 rounded-full border border-emerald-400/20 bg-background/85 px-3 py-1.5 text-xs font-semibold text-emerald-300 backdrop-blur">{live.locations.length} sharing · {live.members.filter((m) => m.status === 'arrived').length} arrived</div></div>
              <div className="p-4"><div className="mb-3 flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /><div><p className="font-medium">Live location is optional</p><p className="text-xs leading-5 text-muted-foreground">Only members who turn it on appear on the map. Nexus automatically stops tracking when the meetup ends.</p></div></div>{live.isSharing ? <button type="button" onClick={live.stopSharing} className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 font-semibold text-primary"><MapPin className="h-4 w-4" />Stop sharing my location</button> : <button type="button" onClick={handleShare} disabled={live.locationPermission === 'denied'} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50"><MapPin className="h-4 w-4" />Share my live location</button>}{live.locationPermission === 'denied' && <p className="mt-2 text-center text-xs text-amber-400">Location permission is blocked. Enable it in your browser settings to share.</p>}{live.error && <ErrorBox message={live.error} />}</div>
            </section>}

            {!isLive && isPending && <section className="rounded-2xl border border-primary/15 bg-card/40 p-5 text-center"><Clock3 className="mx-auto mb-3 h-7 w-7 text-primary" /><h2 className="font-semibold">Location sharing opens when it starts</h2><p className="mt-1 text-sm text-muted-foreground">You can come back here during the Golden Window and choose to share your live location.</p></section>}
            {isEnded && <section className="rounded-2xl border border-border/25 bg-card/40 p-5 text-center"><Check className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><h2 className="font-semibold">This meetup has ended</h2><p className="mt-1 text-sm text-muted-foreground">Live location sharing is no longer available for this event.</p></section>}

            <section className="rounded-2xl border border-border/20 bg-card/40 p-4"><div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h2 className="font-semibold">Group</h2></div><div className="space-y-2">{groupMembers.map((member) => { const presence = live.members.find((item) => item.user_id === member.user_id); const location = live.locations.find((item) => item.user_id === member.user_id); const label = memberNames.get(member.user_id) ?? 'Member'; return <div key={member.user_id} className="flex items-center justify-between rounded-xl border border-border/15 bg-background/30 px-3 py-2.5"><div><p className="text-sm font-medium">{label}</p><p className="text-xs capitalize text-muted-foreground">{presence?.status?.replace('_', ' ') ?? 'not joined'}</p></div><span className={cn('text-xs', location ? 'text-emerald-400' : 'text-muted-foreground')}>{location ? 'Sharing' : 'Private'}</span></div> })}</div>{!hasLocations && isLive && <p className="mt-3 text-center text-xs text-muted-foreground">Nobody is sharing their location yet.</p>}</section>
          </>
        )}

        {live.isLoading && <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      </div>
    </main>
  )
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-3 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300"><AlertCircle className="h-4 w-4 shrink-0" /><span>{message}</span></div>
}
