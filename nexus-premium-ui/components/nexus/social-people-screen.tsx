'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { TopHeader, BottomNav } from './navigation'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ACTIVITY_REGISTRY } from '@/lib/activities/registry'
import { extractCity } from '@/lib/profile-service'
import {
  getPublicProfile,
  searchUsers,
  type SocialProfile,
} from '@/lib/social-service'
import {
  acceptFriendRequest,
  declineFriendRequest,
  getFriendStatus,
  getIncomingFriendRequests,
  getMyFriends,
  removeFriend,
  sendFriendRequest,
  cancelFriendRequest,
  type FriendStatus,
} from '@/lib/friend-service'
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock3,
  Loader2,
  MapPin,
  Search,
  UserPlus,
  UserSearch,
  Users,
  X,
} from 'lucide-react'

const FOUNDER_USERNAME = 'jayruss'

type View = 'discover' | 'friends' | 'requests'

function FounderBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
      ★ Founder
    </span>
  )
}

export function SocialPeopleScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const { user } = useAuth()
  const [view, setView] = useState<View>('discover')
  const [selectedUser, setSelectedUser] = useState<SocialProfile | null>(null)

  if (selectedUser) {
    return (
      <PublicProfile
        profile={selectedUser}
        currentUserId={user?.id}
        onBack={() => setSelectedUser(null)}
        onProfileRefresh={setSelectedUser}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopHeader title="Nexus People" showNotifications={false} />

      <div className="mx-auto max-w-md px-4 pt-3">
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-border/30 bg-muted/30 p-1">
          {([
            ['discover', 'Discover'],
            ['friends', 'Friends'],
            ['requests', 'Requests'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                'rounded-lg py-2 text-xs font-medium transition-all',
                view === key ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'discover' && <Discover onOpenProfile={setSelectedUser} currentUserId={user?.id} />}
      {view === 'friends' && <Friends onOpenProfile={setSelectedUser} />}
      {view === 'requests' && <Requests onOpenProfile={setSelectedUser} />}

      <BottomNav
        activeTab="social"
        onTabChange={(tab) => {
          if (tab !== 'social') onNavigate(tab)
        }}
      />
    </div>
  )
}

function Discover({ onOpenProfile, currentUserId }: { onOpenProfile: (profile: SocialProfile) => void; currentUserId?: string }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SocialProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback((value: string) => {
    setQuery(value)
    if (debounce.current) clearTimeout(debounce.current)
    if (!value.trim()) {
      setResults([])
      setSearched(false)
      setLoading(false)
      return
    }
    setLoading(true)
    debounce.current = setTimeout(async () => {
      const found = await searchUsers(value, currentUserId)
      setResults(found)
      setSearched(true)
      setLoading(false)
    }, 300)
  }, [currentUserId])

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current) }, [])

  return (
    <main className="mx-auto max-w-md space-y-3 px-4 py-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search by name or @username…"
          className="h-10 border-border/50 bg-muted/30 pl-9 text-sm"
          autoFocus
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {!query.trim() && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10"><UserSearch className="h-7 w-7 text-primary/60" /></div>
          <p className="text-sm text-muted-foreground">Find people on Nexus</p>
          <p className="text-xs text-muted-foreground/60">Search by name or username, then open their profile.</p>
        </div>
      )}

      {searched && !loading && results.length === 0 && query.trim() && (
        <div className="py-12 text-center text-sm text-muted-foreground">No Nexus members found.</div>
      )}

      <div className="space-y-2.5">
        {results.map((profile) => (
          <PersonCard key={profile.id} profile={profile} onClick={() => onOpenProfile(profile)} />
        ))}
      </div>
    </main>
  )
}

function PersonCard({ profile, onClick }: { profile: SocialProfile; onClick: () => void }) {
  const initial = (profile.display_name?.[0] ?? profile.username?.[0] ?? '?').toUpperCase()
  const city = extractCity(profile.location)

  return (
    <GlassCard hover onClick={onClick} className="flex items-center gap-3 p-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-primary/20 bg-primary/5">
        {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="text-sm font-semibold text-primary">{initial}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{profile.display_name ?? profile.username ?? 'Nexus member'}</span>
          {profile.username && <span className="text-xs font-medium text-primary/70">@{profile.username}</span>}
          {profile.username === FOUNDER_USERNAME && <FounderBadge />}
        </div>
        {profile.bio && <p className="mt-0.5 truncate text-xs text-muted-foreground">{profile.bio}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/70">
          {city && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{city}</span>}
          {profile.favourite_activities.slice(0, 3).map((id) => {
            const activity = ACTIVITY_REGISTRY.find((item) => item.id === id)
            return activity ? <span key={id}>{activity.emoji}</span> : null
          })}
        </div>
      </div>
      <span className="text-xs text-primary">View</span>
    </GlassCard>
  )
}

function Friends({ onOpenProfile }: { onOpenProfile: (profile: SocialProfile) => void }) {
  const [friends, setFriends] = useState<SocialProfile[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setFriends(await getMyFriends())
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return <LoadingState label="Loading your friends…" />
  if (!friends.length) return <EmptyState icon={<Users />} title="No friends yet" text="Search for someone, open their profile and add them." />

  return (
    <main className="mx-auto max-w-md space-y-2.5 px-4 py-3">
      {friends.map((friend) => <PersonCard key={friend.id} profile={friend} onClick={() => onOpenProfile(friend)} />)}
    </main>
  )
}

function Requests({ onOpenProfile }: { onOpenProfile: (profile: SocialProfile) => void }) {
  const [requests, setRequests] = useState<SocialProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setRequests(await getIncomingFriendRequests())
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const respond = async (profile: SocialProfile, accept: boolean) => {
    setBusyId(profile.id)
    const ok = accept ? await acceptFriendRequest(profile.id) : await declineFriendRequest(profile.id)
    setBusyId(null)
    if (!ok) {
      toast.error(accept ? 'Could not accept request' : 'Could not decline request')
      return
    }
    toast.success(accept ? `${profile.display_name ?? 'Friend'} is now your friend` : 'Request declined')
    await load()
  }

  if (loading) return <LoadingState label="Checking friend requests…" />
  if (!requests.length) return <EmptyState icon={<UserPlus />} title="No pending requests" text="New friend requests will appear here." />

  return (
    <main className="mx-auto max-w-md space-y-2.5 px-4 py-3">
      {requests.map((profile) => (
        <GlassCard key={profile.id} className="p-3">
          <button onClick={() => onOpenProfile(profile)} className="flex w-full items-center gap-3 text-left">
            <Avatar profile={profile} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile.display_name ?? profile.username ?? 'Nexus member'}</p>
              {profile.username && <p className="text-xs text-primary/70">@{profile.username}</p>}
              <p className="mt-1 text-[10px] text-muted-foreground">Wants to connect with you</p>
            </div>
          </button>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button disabled={busyId === profile.id} onClick={() => void respond(profile, true)} className="h-9 bg-primary text-primary-foreground">
              {busyId === profile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1.5 h-4 w-4" />Accept</>}
            </Button>
            <Button disabled={busyId === profile.id} variant="outline" onClick={() => void respond(profile, false)} className="h-9">
              <X className="mr-1.5 h-4 w-4" />Decline
            </Button>
          </div>
        </GlassCard>
      ))}
    </main>
  )
}

function PublicProfile({
  profile: initialProfile,
  currentUserId,
  onBack,
  onProfileRefresh,
}: {
  profile: SocialProfile
  currentUserId?: string
  onBack: () => void
  onProfileRefresh: (profile: SocialProfile) => void
}) {
  const [profile, setProfile] = useState(initialProfile)
  const [status, setStatus] = useState<FriendStatus>('none')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const loadStatus = useCallback(async () => {
    if (!currentUserId) return
    setLoading(true)
    setStatus(await getFriendStatus(profile.id))
    setLoading(false)
  }, [currentUserId, profile.id])

  useEffect(() => {
    const refresh = async () => {
      const fresh = await getPublicProfile(profile.id)
      if (fresh) {
        setProfile(fresh)
        onProfileRefresh(fresh)
      }
      await loadStatus()
    }
    void refresh()
  }, [profile.id])

  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (result === false || result === 'error') {
      toast.error('Something went wrong — please try again')
      return
    }
    toast.success(success)
    await loadStatus()
  }

  const initial = (profile.display_name?.[0] ?? profile.username?.[0] ?? '?').toUpperCase()
  const city = extractCity(profile.location)
  const joined = profile.created_at ? new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : null

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="sticky top-0 z-20 border-b border-border/30 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />Back
        </button>
      </div>
      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <GlassCard className="relative overflow-hidden p-5 text-center">
          <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-primary/25 bg-primary/5">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="text-4xl font-medium text-primary">{initial}</span>}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <h1 className="text-xl font-semibold">{profile.display_name ?? profile.username ?? 'Nexus member'}</h1>
            {profile.username === FOUNDER_USERNAME && <FounderBadge />}
          </div>
          {profile.username && <p className="mt-1 text-sm font-medium text-primary">@{profile.username}</p>}
          <div className="mt-2 flex flex-wrap justify-center gap-3 text-[11px] text-muted-foreground">
            {city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-primary" />{city}</span>}
            {joined && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Since {joined}</span>}
          </div>

          {currentUserId && currentUserId !== profile.id && (
            <div className="mt-4">
              {loading ? (
                <Button disabled className="h-9 min-w-40"><Loader2 className="h-4 w-4 animate-spin" /></Button>
              ) : status === 'friends' ? (
                <Button variant="outline" disabled={busy} onClick={() => void act(() => removeFriend(profile.id), 'Friend removed')} className="h-9 min-w-40">
                  <Check className="mr-1.5 h-4 w-4 text-emerald-400" />Friends
                </Button>
              ) : status === 'request_sent' ? (
                <Button variant="outline" disabled={busy} onClick={() => void act(() => cancelFriendRequest(profile.id), 'Friend request cancelled')} className="h-9 min-w-40">
                  <Clock3 className="mr-1.5 h-4 w-4" />Request sent
                </Button>
              ) : status === 'request_received' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button disabled={busy} onClick={() => void act(() => acceptFriendRequest(profile.id), 'You are now friends')} className="h-9">
                    <Check className="mr-1.5 h-4 w-4" />Accept
                  </Button>
                  <Button disabled={busy} variant="outline" onClick={() => void act(() => declineFriendRequest(profile.id), 'Request declined')} className="h-9">
                    <X className="mr-1.5 h-4 w-4" />Decline
                  </Button>
                </div>
              ) : (
                <Button disabled={busy} onClick={() => void act(async () => {
                  const result = await sendFriendRequest(profile.id)
                  if (result !== 'sent' && result !== 'request_exists') throw new Error(result)
                  return true
                }, 'Friend request sent')} className="h-9 min-w-40 bg-primary text-primary-foreground">
                  <UserPlus className="mr-1.5 h-4 w-4" />Add as friend
                </Button>
              )}
            </div>
          )}
        </GlassCard>

        <section>
          <h2 className="mb-2 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">About</h2>
          <GlassCard className="p-4">
            <p className={cn('text-sm leading-6', profile.bio ? 'text-foreground' : 'text-muted-foreground')}>
              {profile.bio || 'No bio yet.'}
            </p>
          </GlassCard>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">Favourite activities</h2>
          <GlassCard className="p-4">
            {profile.favourite_activities.length ? (
              <div className="flex flex-wrap gap-1.5">
                {profile.favourite_activities.map((id) => {
                  const activity = ACTIVITY_REGISTRY.find((item) => item.id === id)
                  return activity ? <span key={id} className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary">{activity.emoji} {activity.label}</span> : null
                })}
              </div>
            ) : <p className="text-xs text-muted-foreground">No activities selected.</p>}
          </GlassCard>
        </section>
      </main>
    </div>
  )
}

function Avatar({ profile, size = 'sm' }: { profile: SocialProfile; size?: 'sm' | 'md' }) {
  const initial = (profile.display_name?.[0] ?? profile.username?.[0] ?? '?').toUpperCase()
  const sizeClass = size === 'md' ? 'h-11 w-11' : 'h-9 w-9'
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary/5', sizeClass)}>
      {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="text-xs font-semibold text-primary">{initial}</span>}
    </div>
  )
}

function LoadingState({ label }: { label: string }) {
  return <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin text-primary" />{label}</div>
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex flex-col items-center gap-2 px-8 py-16 text-center"><div className="text-primary/60">{icon}</div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{text}</p></div>
}
