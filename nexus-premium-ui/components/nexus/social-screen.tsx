'use client'

import {
  useState, useRef, useEffect, useCallback, useTransition,
} from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { TopHeader, BottomNav } from './navigation'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Camera, Check, X, Search, MapPin, AtSign,
  Pencil, Calendar, Loader2, UserSearch, Trash2, Trophy,
} from 'lucide-react'

// ── Founder badge ──────────────────────────────────────────────────────────────

const FOUNDER_USERNAME = 'jayruss'

function FounderBadge() {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
      'text-[10px] font-semibold tracking-wide',
      'bg-gradient-to-r from-amber-500/20 via-yellow-400/20 to-amber-500/20',
      'border border-amber-400/40',
      'text-amber-300',
      'shadow-[0_0_8px_rgba(251,191,36,0.15)]',
    )}>
      <Trophy className="w-2.5 h-2.5 text-amber-400 shrink-0" />
      Founder
    </span>
  )
}
import { cn } from '@/lib/utils'
import { ACTIVITY_REGISTRY } from '@/lib/activities/registry'
import { extractCity } from '@/lib/profile-service'
import {
  updateSocialProfile,
  checkUsernameAvailable,
  uploadAvatar,
  deleteAvatar,
  searchUsers,
  validateUsernameFormat,
  usernameErrorMessage,
  type SocialProfile,
} from '@/lib/social-service'

interface SocialScreenProps {
  onNavigate: (screen: string) => void
}

// ── Top-level tabs ─────────────────────────────────────────────────────────────

type View = 'profile' | 'search'

export function SocialScreen({ onNavigate }: SocialScreenProps) {
  const { user } = useAuth()
  const [view, setView] = useState<View>('profile')

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopHeader title="Nexus Social" showNotifications={false} />

      {/* View switcher */}
      <div className="px-4 pt-3 pb-1 max-w-md mx-auto">
        <div className="flex gap-1 p-1 rounded-xl bg-muted/30 border border-border/30">
          {(['profile', 'search'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200',
                view === v
                  ? 'bg-primary/15 text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v === 'profile' ? 'My Profile' : 'Search Users'}
            </button>
          ))}
        </div>
      </div>

      {view === 'profile'
        ? <MyProfileView key={user?.id} />
        : <SearchView currentUserId={user?.id} />
      }

      <BottomNav
        activeTab="social"
        onTabChange={(tab) => {
          if (tab !== 'social') onNavigate(tab)
        }}
      />
    </div>
  )
}

// ── My Profile view ────────────────────────────────────────────────────────────

function MyProfileView() {
  const { user, profile, refreshProfile } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── edit state ───────────────────────────────────────────────────────────────
  const [editing, setEditing]         = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername]       = useState('')
  const [bio, setBio]                 = useState('')
  const [activities, setActivities]   = useState<string[]>([])
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [pendingFile, setPendingFile]     = useState<File | null>(null)

  // ── username validation ──────────────────────────────────────────────────────
  type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')
  const [usernameMsg,    setUsernameMsg]    = useState('')
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── saving ───────────────────────────────────────────────────────────────────
  const [saving, startSave] = useTransition()

  // ── populate fields from profile ─────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return
    setDisplayName((profile as any).display_name ?? '')
    setUsername((profile as any).username ?? '')
    setBio((profile as any).bio ?? '')
    setActivities((profile as any).favourite_activities ?? [])
  }, [profile])

  // ── username validation on change ────────────────────────────────────────────
  const handleUsernameChange = (val: string) => {
    const stripped = val.replace(/^@/, '')
    setUsername(stripped)

    if (usernameTimer.current) clearTimeout(usernameTimer.current)

    if (!stripped) { setUsernameStatus('idle'); setUsernameMsg(''); return }

    const fmtErr = validateUsernameFormat(stripped)
    if (fmtErr) {
      setUsernameStatus('invalid')
      setUsernameMsg(usernameErrorMessage(fmtErr))
      return
    }

    setUsernameStatus('checking')
    setUsernameMsg('')
    usernameTimer.current = setTimeout(async () => {
      const available = await checkUsernameAvailable(stripped, user?.id)
      setUsernameStatus(available ? 'available' : 'taken')
      setUsernameMsg(available ? 'Username available' : usernameErrorMessage('taken'))
    }, 500)
  }

  // ── avatar file pick ─────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    const url = URL.createObjectURL(file)
    setAvatarPreview(url)
  }

  // ── cancel edit ──────────────────────────────────────────────────────────────
  const cancelEdit = () => {
    setEditing(false)
    setDisplayName((profile as any)?.display_name ?? '')
    setUsername((profile as any)?.username ?? '')
    setBio((profile as any)?.bio ?? '')
    setActivities((profile as any)?.favourite_activities ?? [])
    setAvatarPreview(null)
    setPendingFile(null)
    setUsernameStatus('idle')
    setUsernameMsg('')
  }

  // ── save ─────────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!user?.id) return
    if (usernameStatus === 'invalid' || usernameStatus === 'taken') {
      toast.error('Please fix username before saving')
      return
    }

    startSave(async () => {
      let avatar_url: string | null | undefined = undefined

      // Upload avatar if a new file was selected
      if (pendingFile) {
        const url = await uploadAvatar(user.id, pendingFile)
        if (!url) {
          toast.error('Avatar upload failed — profile saved without it')
        } else {
          avatar_url = url
        }
      }

      const result = await updateSocialProfile(user.id, {
        display_name:         displayName.trim() || undefined,
        username:             username || null,
        bio:                  bio.trim(),
        favourite_activities: activities,
        ...(avatar_url !== undefined ? { avatar_url } : {}),
      })

      if (!result) {
        toast.error('Failed to save profile')
        return
      }

      await refreshProfile()
      setPendingFile(null)
      setAvatarPreview(null)
      setEditing(false)
      toast.success('Profile updated')
    })
  }

  // ── remove avatar ─────────────────────────────────────────────────────────────
  const handleRemoveAvatar = () => {
    startSave(async () => {
      if (!user?.id) return
      await deleteAvatar(user.id)
      await updateSocialProfile(user.id, { avatar_url: null })
      await refreshProfile()
      setAvatarPreview(null)
      setPendingFile(null)
      toast.success('Avatar removed')
    })
  }

  // ── derived values ────────────────────────────────────────────────────────────
  const currentAvatarUrl = (profile as any)?.avatar_url as string | null | undefined
  const shownAvatar      = editing ? (avatarPreview ?? currentAvatarUrl) : currentAvatarUrl
  const displayedName    = editing
    ? (displayName || 'Your Name')
    : ((profile as any)?.display_name ?? user?.email?.split('@')[0] ?? 'Account')
  const initial    = (displayedName?.[0] ?? 'N').toUpperCase()
  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : null

  const cityDisplay = extractCity((profile as any)?.formatted_address ?? null)

  return (
    <div className="px-4 py-3 max-w-md mx-auto space-y-4">

      {/* ── Avatar + name card ────────────────────────────────────────── */}
      <GlassCard className="pt-6 pb-4 px-4 flex flex-col items-center gap-1 relative">
        {/* Edit / Save / Cancel buttons */}
        <div className="absolute top-3 right-3 flex gap-1.5">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelEdit}
                disabled={saving}
                className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || usernameStatus === 'checking'}
                className="h-7 px-3 rounded-full bg-primary/20 text-primary hover:bg-primary/30 text-xs gap-1.5 border border-primary/30"
              >
                {saving
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Check className="w-3 h-3" />}
                Save
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              className="h-7 px-3 rounded-full text-muted-foreground hover:text-foreground text-xs gap-1.5"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </Button>
          )}
        </div>

        {/* Avatar */}
        <div className="relative mb-2">
          <div className={cn(
            'w-24 h-24 rounded-full border-4 border-primary/30',
            'overflow-hidden flex items-center justify-center',
            'bg-gradient-to-br from-primary/20 to-primary/5',
          )}>
            {shownAvatar ? (
              <img
                src={shownAvatar}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-3xl font-medium text-primary">{initial}</span>
            )}
          </div>

          {editing && (
            <div className="absolute -bottom-1 -right-1 flex gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
              >
                <Camera className="w-4 h-4 text-primary-foreground" />
              </button>
              {(shownAvatar) && (
                <button
                  onClick={handleRemoveAvatar}
                  className="w-8 h-8 rounded-full bg-destructive/80 flex items-center justify-center shadow-lg hover:bg-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-white" />
                </button>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Display name */}
        {editing ? (
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            className="text-center text-sm font-semibold bg-muted/30 border-border/50 h-8 max-w-[200px]"
          />
        ) : (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <h2 className="text-lg font-semibold">{displayedName}</h2>
            {(profile as any)?.username === FOUNDER_USERNAME && <FounderBadge />}
          </div>
        )}

        {/* Username */}
        <div className="w-full max-w-[220px]">
          {editing ? (
            <div className="relative">
              <AtSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="username"
                className={cn(
                  'pl-7 text-sm text-center bg-muted/30 border-border/50 h-8',
                  usernameStatus === 'available' && 'border-emerald-500/50',
                  usernameStatus === 'taken'     && 'border-destructive/50',
                  usernameStatus === 'invalid'   && 'border-amber-500/50',
                )}
              />
              {/* Validation indicator */}
              {usernameStatus === 'checking' && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground animate-spin" />
              )}
              {usernameStatus === 'available' && (
                <Check className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-500" />
              )}
              {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                <X className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-destructive" />
              )}
            </div>
          ) : (
            <p className={cn(
              'text-center text-sm',
              (profile as any)?.username
                ? 'text-primary font-medium'
                : 'text-muted-foreground text-xs',
            )}>
              {(profile as any)?.username
                ? `@${(profile as any).username}`
                : 'No username set'}
            </p>
          )}
          {editing && usernameMsg && (
            <p className={cn(
              'text-[10px] text-center mt-0.5',
              usernameStatus === 'available' ? 'text-emerald-500' : 'text-destructive',
            )}>
              {usernameMsg}
            </p>
          )}
        </div>

        {/* Meta: location + joined */}
        <div className="flex items-center gap-3 mt-1">
          {cityDisplay && (
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-primary" />
              <span className="text-[11px] text-muted-foreground">{cityDisplay}</span>
            </div>
          )}
          {joinedDate && (
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Since {joinedDate}</span>
            </div>
          )}
        </div>
      </GlassCard>

      {/* ── Bio ────────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-0.5">
          Bio
        </h3>
        <GlassCard className="p-3">
          {editing ? (
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell the group about yourself…"
              maxLength={200}
              rows={3}
              className={cn(
                'w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground',
                'resize-none outline-none leading-relaxed',
              )}
            />
          ) : (
            <p className={cn(
              'text-xs leading-relaxed',
              (profile as any)?.bio ? 'text-foreground' : 'text-muted-foreground',
            )}>
              {(profile as any)?.bio || 'No bio yet — tap Edit to add one'}
            </p>
          )}
          {editing && (
            <p className="text-[10px] text-muted-foreground text-right mt-1">
              {bio.length}/200
            </p>
          )}
        </GlassCard>
      </div>

      {/* ── Favourite activities ─────────────────────────────────────── */}
      <div>
        <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-0.5">
          Favourite Activities
        </h3>
        <GlassCard className="p-3">
          {editing ? (
            <ActivityPicker selected={activities} onChange={setActivities} />
          ) : (
            <ActivityPills ids={(profile as any)?.favourite_activities ?? []} />
          )}
        </GlassCard>
      </div>

    </div>
  )
}

// ── Activity pill display ──────────────────────────────────────────────────────

function ActivityPills({ ids }: { ids: string[] }) {
  if (!ids.length) {
    return (
      <p className="text-xs text-muted-foreground">
        No activities selected — tap Edit to choose some
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map(id => {
        const def = ACTIVITY_REGISTRY.find(a => a.id === id)
        if (!def) return null
        return (
          <span
            key={id}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
              'bg-primary/10 text-primary border border-primary/20',
            )}
          >
            <span>{def.emoji}</span>
            <span>{def.label}</span>
          </span>
        )
      })}
    </div>
  )
}

// ── Activity multi-picker ──────────────────────────────────────────────────────

function ActivityPicker({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter(s => s !== id)
        : [...selected, id],
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {ACTIVITY_REGISTRY.map(def => {
        const on = selected.includes(def.id)
        return (
          <button
            key={def.id}
            onClick={() => toggle(def.id)}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
              'transition-all duration-150 border',
              on
                ? 'bg-primary/15 text-primary border-primary/40 shadow-sm'
                : 'bg-muted/30 text-muted-foreground border-border/30 hover:border-primary/30 hover:text-foreground',
            )}
          >
            <span>{def.emoji}</span>
            <span>{def.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Search view ────────────────────────────────────────────────────────────────

function SearchView({ currentUserId }: { currentUserId?: string }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SocialProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback((val: string) => {
    setQuery(val)
    if (debounce.current) clearTimeout(debounce.current)
    if (!val.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    debounce.current = setTimeout(async () => {
      const found = await searchUsers(val, currentUserId)
      setResults(found)
      setSearched(true)
      setLoading(false)
    }, 350)
  }, [currentUserId])

  // Cleanup
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current) }, [])

  return (
    <div className="px-4 py-3 max-w-md mx-auto space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search by name or @username…"
          className="pl-9 bg-muted/30 border-border/50 text-sm"
          autoFocus
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* Results */}
      {!query.trim() && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <UserSearch className="w-7 h-7 text-primary/60" />
          </div>
          <p className="text-sm text-muted-foreground">
            Search for other Nexus members
          </p>
          <p className="text-xs text-muted-foreground/60">
            Find people by name or @username
          </p>
        </div>
      )}

      {searched && !loading && results.length === 0 && query.trim() && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center">
            <UserSearch className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No users found</p>
          <p className="text-xs text-muted-foreground/60">
            Try a different name or username
          </p>
        </div>
      )}

      {loading && !results.length && (
        <div className="space-y-2.5">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-card rounded-xl p-3 flex items-center gap-3 animate-pulse">
              <div className="w-11 h-11 rounded-full bg-muted/60 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 rounded bg-muted/60 w-2/3" />
                <div className="h-2.5 rounded bg-muted/40 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2.5">
          {results.map(user => (
            <UserCard key={user.id} user={user} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── User card (search result) ─────────────────────────────────────────────────

function UserCard({ user }: { user: SocialProfile }) {
  const initial = (user.display_name?.[0] ?? user.username?.[0] ?? '?').toUpperCase()
  const city    = extractCity(user.location)

  return (
    <GlassCard className="p-3 flex items-center gap-3">
      {/* Avatar */}
      <div className={cn(
        'w-11 h-11 rounded-full shrink-0',
        'border-2 border-primary/20',
        'overflow-hidden flex items-center justify-center',
        'bg-gradient-to-br from-primary/20 to-primary/5',
      )}>
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.display_name ?? ''}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-sm font-semibold text-primary">{initial}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium truncate">
            {user.display_name ?? user.username ?? 'Unknown'}
          </p>
          {user.username && (
            <span className="text-xs text-primary/70 font-medium shrink-0">
              @{user.username}
            </span>
          )}
          {user.username === FOUNDER_USERNAME && <FounderBadge />}
        </div>
        {user.bio && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{user.bio}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {city && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
              <MapPin className="w-2.5 h-2.5" />
              {city}
            </span>
          )}
          {user.favourite_activities.slice(0, 3).map(id => {
            const def = ACTIVITY_REGISTRY.find(a => a.id === id)
            return def ? (
              <span key={id} className="text-[10px] text-muted-foreground/60">
                {def.emoji}
              </span>
            ) : null
          })}
        </div>
      </div>
    </GlassCard>
  )
}
