'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Star, MapPin, Navigation, Sparkles, ThumbsUp, ThumbsDown, ExternalLink, Plus, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VIBE_LABEL, buildMapUrl, type Venue, type Vibe } from '@/lib/venue-service'
import { buildWeatherReason, type Weather } from '@/lib/weather-service'
import type { ActivityIntent } from '@/lib/activity-intelligence'
import { listVenueGroups, listSavedVenueGroupIds, saveVenueToGroup, removeVenueFromGroupByPlace, type GroupChoice } from '@/lib/saved-venue-service'

interface Props {
  venue: Venue | null
  groupId?: string
  activityId?: string
  groupId?: string
  activityId?: string
  groupId?: string
  activityId?: string
  vibe: Vibe
  goldenWindow?: { day_of_week: number; start_time: string; end_time: string } | null
  midpointFallback: boolean
  weather?: Weather | null
  vote: 1 | -1 | 0
  onVote: (dir: 1 | -1) => void
  onClose: () => void
  intent?: ActivityIntent | null
}

export function VenueDetailSheet({ venue, groupId, activityId, vibe, goldenWindow, midpointFallback, weather, vote, onVote, onClose, intent }: Props) {
  const [mounted, setMounted] = useState(false)
  const [groupPickerOpen, setGroupPickerOpen] = useState(false)
  const [groups, setGroups] = useState<GroupChoice[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null)
  const [savedGroupIds, setSavedGroupIds] = useState<string[]>([])
  const [addingToCrawl, setAddingToCrawl] = useState(false)
  const [crawlAdded, setCrawlAdded] = useState(false)
  const [addingToCrawl, setAddingToCrawl] = useState(false)
  const [crawlAdded, setCrawlAdded] = useState(false)
  const [addingToCrawl, setAddingToCrawl] = useState(false)
  const [crawlAdded, setCrawlAdded] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!venue) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !sheetRef.current) return
      const focusables = sheetRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea')
      if (!focusables.length) return
      const first = focusables[0], last = focusables[focusables.length - 1], active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.clearTimeout(focusTimer); document.body.style.overflow = prevOverflow; window.removeEventListener('keydown', onKey); previouslyFocused?.focus?.() }
  }, [venue, onClose])

  useEffect(() => {
    setGroupPickerOpen(false)
    setGroups([])
    setSavedGroupIds([])
    setSavingGroupId(null)
    setAddingToCrawl(false)
    setCrawlAdded(false)
    setAddingToCrawl(false)
    setCrawlAdded(false)
    setAddingToCrawl(false)
    setCrawlAdded(false)
  }, [venue?.id, venue?.name])

  const openGroupPicker = async () => {
    setGroupPickerOpen(true)
    if (groups.length || groupsLoading || !venue) return
    setGroupsLoading(true)
    const [groupResult, savedIds] = await Promise.all([
      listVenueGroups(),
      listSavedVenueGroupIds(venue),
    ])
    setGroups(groupResult.groups)
    setSavedGroupIds(savedIds)
    setGroupsLoading(false)
  }

  const handleAddToPubCrawl = async () => {
    if (!venue || !groupId || activityId !== 'pub-crawl' || addingToCrawl) return
    setAddingToCrawl(true)
    const result = await saveVenueToGroup(groupId, venue)
    if (result.ok) {
      setCrawlAdded(true)
      window.dispatchEvent(new CustomEvent('nexus:add-crawl-venue', {
        detail: {
          id: venue.id || venue.maps_url || `${venue.name}|${venue.address || ''}`,
          name: venue.name,
          category: venue.category,
          photo_url: venue.photo_url,
          maps_url: venue.maps_url,
          address: venue.address,
          rating: venue.rating,
          lat: venue.lat,
          lng: venue.lng,
          activityId: 'pub-crawl',
        },
      }))
    }
    setAddingToCrawl(false)
  }

  const handleAddToPubCrawl = async () => {
    if (!venue || !groupId || activityId !== 'pub-crawl' || addingToCrawl) return
    setAddingToCrawl(true)
    const result = await saveVenueToGroup(groupId, venue)
    if (result.ok) {
      setCrawlAdded(true)
      window.dispatchEvent(new CustomEvent('nexus:add-crawl-venue', {
        detail: {
          id: venue.id || venue.maps_url || `${venue.name}|${venue.address || ''}`,
          name: venue.name,
          category: venue.category,
          photo_url: venue.photo_url,
          maps_url: venue.maps_url,
          address: venue.address,
          rating: venue.rating,
          lat: venue.lat,
          lng: venue.lng,
          activityId: 'pub-crawl',
        },
      }))
    }
    setAddingToCrawl(false)
  }

  const handleAddToPubCrawl = async () => {
    if (!venue || !groupId || activityId !== 'pub-crawl' || addingToCrawl) return
    setAddingToCrawl(true)
    const result = await saveVenueToGroup(groupId, venue)
    if (result.ok) {
      setCrawlAdded(true)
      window.dispatchEvent(new CustomEvent('nexus:add-crawl-venue', {
        detail: {
          id: venue.id || venue.maps_url || `${venue.name}|${venue.address || ''}`,
          name: venue.name,
          category: venue.category,
          photo_url: venue.photo_url,
          maps_url: venue.maps_url,
          address: venue.address,
          rating: venue.rating,
          lat: venue.lat,
          lng: venue.lng,
          activityId: 'pub-crawl',
        },
      }))
    }
    setAddingToCrawl(false)
  }

  const handleToggleGroup = async (groupId: string) => {
    if (!venue || savingGroupId) return
    const saved = savedGroupIds.includes(groupId)
    setSavingGroupId(groupId)

    const ok = saved
      ? await removeVenueFromGroupByPlace(groupId, venue)
      : (await saveVenueToGroup(groupId, venue)).ok

    setSavingGroupId(null)

    if (!ok) return

    setSavedGroupIds((current) => saved
      ? current.filter((id) => id !== groupId)
      : current.includes(groupId) ? current : [...current, groupId])
  }

  if (!venue || !mounted) return null

  const reasons = buildReasons(venue, vibe, goldenWindow, midpointFallback, weather ?? null, intent ?? null)
  const distanceLabel = formatDistance(venue.distance_km)
  const ratingCountLabel = formatRatingCount(venue.rating_count)
  const mapUrl = venue.lat != null && venue.lng != null ? buildMapUrl({ lat: venue.lat, lng: venue.lng, topPickCoord: { lat: venue.lat, lng: venue.lng }, zoom: 16, w: 600, h: 300 }) : null

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${venue.name} details`} className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div ref={sheetRef} onClick={(e) => e.stopPropagation()} className="relative w-full sm:max-w-md sm:max-h-[92vh] max-h-[96vh] overflow-y-auto bg-[#05080f] text-foreground sm:rounded-2xl rounded-t-2xl border border-amber-400/15 shadow-[0_0_60px_rgba(251,191,36,0.10)] animate-in slide-in-from-bottom-8 duration-300">
        <div className="relative w-full aspect-[16/10] bg-[radial-gradient(ellipse_at_center,#0c1626,#05080f)] overflow-hidden">
          {venue.photo_url ? <img src={venue.photo_url.replace('w=200&h=200', 'w=800&h=500')} alt={venue.name} className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} /> : <div className="absolute inset-0 flex items-center justify-center"><MapPin className="w-12 h-12 text-muted-foreground/30" /></div>}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05080f] via-[#05080f]/30 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
          {venue.open_now !== null && <div className={cn('absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide backdrop-blur', venue.open_now ? 'bg-emerald-500/15 border border-emerald-400/50 text-emerald-300' : 'bg-rose-500/15 border border-rose-400/50 text-rose-300')}><span className={cn('w-1.5 h-1.5 rounded-full', venue.open_now ? 'bg-emerald-400' : 'bg-rose-400')} />{venue.open_now ? 'OPEN' : 'CLOSED'}</div>}
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close venue details" className="absolute top-3 right-3 flex items-center justify-center w-8 h-8 rounded-full bg-black/50 backdrop-blur border border-white/10 text-white/90 hover:bg-black/70 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"><X className="w-4 h-4" /></button>
          <div className="absolute bottom-3 left-4 right-4"><h2 className="text-2xl font-semibold text-white drop-shadow-lg leading-tight">{venue.name}</h2></div>
        </div>

        <div className="px-4 pt-3 space-y-1.5">
          <div className="flex items-center gap-2 text-[13px] flex-wrap">
            {venue.rating != null && <span className="inline-flex items-center gap-1 text-amber-400"><Star className="w-3.5 h-3.5 fill-current" /><span className="font-medium">{venue.rating.toFixed(1)}</span>{ratingCountLabel && <span className="text-muted-foreground">({ratingCountLabel})</span>}</span>}
            {venue.category && <><span className="text-muted-foreground/40">•</span><span className="text-muted-foreground">{venue.category}</span></>}
          </div>
          {(distanceLabel || venue.address) && <div className="flex items-start gap-1.5 text-[12px] text-muted-foreground"><Navigation className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{distanceLabel && <span>{distanceLabel} from midpoint</span>}{distanceLabel && venue.address && <span className="text-muted-foreground/40"> · </span>}{venue.address && <span>{venue.address}</span>}</span></div>}
        </div>

        {activityId === 'pub-crawl' && groupId && (
          <section className="mx-4 mt-4">
            <button type="button" onClick={handleAddToPubCrawl} disabled={addingToCrawl || crawlAdded} className={cn('w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors', crawlAdded ? 'border-emerald-400/30 bg-emerald-400/[0.06]' : 'border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.10]')}>
              <span className="flex items-center gap-3"><span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 border border-primary/20">{crawlAdded ? <Check className="w-4 h-4 text-emerald-300" /> : <Plus className="w-4 h-4 text-primary" />}</span><span><span className="block text-[12px] font-semibold">{crawlAdded ? 'Added to Pub Crawl' : 'Add to Pub Crawl'}</span><span className="block text-[11px] text-muted-foreground mt-0.5">{crawlAdded ? 'Saved to this group and ready for the crawl.' : 'Use this venue as one of your crawl stops.'}</span></span></span><span className="text-[11px] font-medium text-primary">{addingToCrawl ? 'Saving…' : crawlAdded ? 'Added' : 'Add'}</span>
            </button>
          </section>
        )}

        {activityId === 'pub-crawl' && groupId && (
          <section className="mx-4 mt-4">
            <button type="button" onClick={handleAddToPubCrawl} disabled={addingToCrawl || crawlAdded} className={cn('w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors', crawlAdded ? 'border-emerald-400/30 bg-emerald-400/[0.06]' : 'border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.10]')}>
              <span className="flex items-center gap-3"><span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 border border-primary/20">{crawlAdded ? <Check className="w-4 h-4 text-emerald-300" /> : <Plus className="w-4 h-4 text-primary" />}</span><span><span className="block text-[12px] font-semibold">{crawlAdded ? 'Added to Pub Crawl' : 'Add to Pub Crawl'}</span><span className="block text-[11px] text-muted-foreground mt-0.5">{crawlAdded ? 'Saved to this group and ready for the crawl.' : 'Use this venue as one of your crawl stops.'}</span></span></span><span className="text-[11px] font-medium text-primary">{addingToCrawl ? 'Saving…' : crawlAdded ? 'Added' : 'Add'}</span>
            </button>
          </section>
        )}

        {activityId === 'pub-crawl' && groupId && (
          <section className="mx-4 mt-4">
            <button type="button" onClick={handleAddToPubCrawl} disabled={addingToCrawl || crawlAdded} className={cn('w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors', crawlAdded ? 'border-emerald-400/30 bg-emerald-400/[0.06]' : 'border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.10]')}>
              <span className="flex items-center gap-3"><span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 border border-primary/20">{crawlAdded ? <Check className="w-4 h-4 text-emerald-300" /> : <Plus className="w-4 h-4 text-primary" />}</span><span><span className="block text-[12px] font-semibold">{crawlAdded ? 'Added to Pub Crawl' : 'Add to Pub Crawl'}</span><span className="block text-[11px] text-muted-foreground mt-0.5">{crawlAdded ? 'Saved to this group and ready for the crawl.' : 'Use this venue as one of your crawl stops.'}</span></span></span><span className="text-[11px] font-medium text-primary">{addingToCrawl ? 'Saving…' : crawlAdded ? 'Added' : 'Add'}</span>
            </button>
          </section>
        )}

        <section className="mx-4 mt-4">
          <button type="button" onClick={openGroupPicker} className="w-full flex items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-left hover:bg-amber-400/[0.10] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
            <span className="flex items-center gap-3"><span className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-400/10 border border-amber-400/20"><Plus className="w-4 h-4 text-amber-300" /></span><span><span className="block text-[12px] font-semibold text-foreground">Add this to your group</span><span className="block text-[11px] text-muted-foreground mt-0.5">Keep this place in the group shortlist</span></span></span><Plus className="w-4 h-4 text-amber-300 shrink-0" />
          </button>
        </section>

        {groupPickerOpen && <section className="mx-4 mt-3 rounded-xl border border-amber-400/20 bg-white/[0.025] overflow-hidden"><div className="flex items-center justify-between px-4 py-3 border-b border-white/10"><div><h3 className="text-[11px] font-semibold tracking-widest uppercase text-amber-300">Add to group</h3><p className="text-[11px] text-muted-foreground mt-0.5">Tap an added group again to remove the place.</p></div><button type="button" onClick={() => setGroupPickerOpen(false)} className="text-[11px] text-muted-foreground hover:text-foreground">Close</button></div>{groupsLoading ? <div className="flex items-center gap-2 px-4 py-4 text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading your groups…</div> : groups.length === 0 ? <div className="px-4 py-4 text-xs text-muted-foreground">No groups found yet. Create a group first, then come back here.</div> : <div className="p-2">{groups.map((group) => { const saved = savedGroupIds.includes(group.id); return <button key={group.id} type="button" disabled={savingGroupId !== null} onClick={() => handleToggleGroup(group.id)} className={cn('w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors', saved ? 'bg-emerald-400/10' : 'hover:bg-white/[0.04]')}><span className="text-xl w-8 text-center">{group.emoji || '👥'}</span><span className="flex-1 min-w-0"><span className="block text-[13px] font-medium truncate">{group.name}</span><span className="block text-[10px] text-muted-foreground mt-0.5">{saved ? 'Added — tap to remove' : 'Add venue'}</span></span>{saved ? <Check className="w-4 h-4 text-emerald-300" /> : savingGroupId === group.id ? <Loader2 className="w-4 h-4 animate-spin text-amber-300" /> : <Plus className="w-4 h-4 text-muted-foreground" />}</button>})}</div>}</section>}

        {reasons.length > 0 && <section className="mx-4 mt-4 p-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.03]"><h3 className="flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase text-amber-300 mb-2.5"><Sparkles className="w-3.5 h-3.5" />Why this fits your group</h3><ul className="space-y-2">{reasons.map((r, i) => <li key={i} className="flex gap-2 text-[13px] text-foreground/90 leading-snug"><span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-amber-400" /><span>{r}</span></li>)}</ul></section>}
        {venue.description && <section className="mx-4 mt-3 p-4 rounded-xl border border-white/10 bg-white/[0.02]"><h3 className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">About this place</h3><p className="text-[13px] leading-relaxed text-foreground/85">{venue.description}</p></section>}
        {mapUrl && <section className="mx-4 mt-3 overflow-hidden rounded-xl border border-amber-400/15 bg-white/[0.02]"><div className="flex items-center justify-between px-4 py-3"><div><h3 className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">Where it is</h3><p className="mt-0.5 text-[11px] text-muted-foreground/70">Venue location</p></div>{venue.maps_url && <a href={venue.maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-amber-300"><Navigation className="h-3.5 w-3.5" />Directions</a>}</div><img src={mapUrl} alt={`Map showing ${venue.name}`} className="block w-full aspect-[2/1] object-cover bg-[#08111d]" loading="lazy" /></section>}
        <section className="mx-4 mt-3 p-4 rounded-xl border border-amber-400/15 bg-white/[0.02]"><h3 className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">Group vote</h3><div className="flex items-center justify-between gap-3"><p className="text-[12px] text-muted-foreground leading-snug flex-1">Cast your vote — your group will see it in real time.</p><div className="flex items-center gap-2 shrink-0"><VoteChip active={vote === 1} onClick={() => onVote(1)} icon="up" count={vote === 1 ? 1 : 0} venueName={venue.name} /><VoteChip active={vote === -1} onClick={() => onVote(-1)} icon="down" count={vote === -1 ? 1 : 0} venueName={venue.name} /></div></div></section>
        {venue.address && <section className="mx-4 mt-3 mb-4 rounded-xl border border-amber-400/15 bg-white/[0.02] overflow-hidden">{venue.maps_url ? <a href={venue.maps_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 hover:bg-white/[0.03]"><span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-400/10 border border-amber-400/30"><MapPin className="w-4 h-4 text-amber-300" /></span><span className="flex-1 min-w-0"><span className="block text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">Address</span><span className="block text-[13px] text-foreground/90 truncate mt-0.5">{venue.address}</span></span><ExternalLink className="w-4 h-4 text-muted-foreground" /></a> : <div className="flex items-center gap-3 p-4"><MapPin className="w-4 h-4 text-amber-300" /><span className="text-[13px]">{venue.address}</span></div>}</section>}
      </div>
    </div>, document.body,
  )
}

function VoteChip({ active, icon, count, venueName, onClick }: { active: boolean; icon: 'up' | 'down'; count: number; venueName: string; onClick: () => void }) {
  const Icon = icon === 'up' ? ThumbsUp : ThumbsDown
  const activeColor = icon === 'up' ? 'border-emerald-400/60 text-emerald-300 bg-emerald-400/10' : 'border-rose-400/60 text-rose-300 bg-rose-400/10'
  return <button type="button" onClick={onClick} aria-label={`${icon === 'up' ? 'Vote up' : 'Vote down'} ${venueName}`} aria-pressed={active} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-all', active ? activeColor : 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border')}><Icon className="w-3.5 h-3.5" /><span>{count}</span></button>
}

function formatDistance(km: number | null): string | null { if (km == null || !Number.isFinite(km)) return null; return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km` }
function formatRatingCount(n: number | null): string | null { if (n == null || !Number.isFinite(n) || n <= 0) return null; if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`; return String(n) }

function buildReasons(venue: Venue, vibe: Vibe, goldenWindow: Props['goldenWindow'], midpointFallback: boolean, weather: Weather | null, intent: ActivityIntent | null): string[] {
  const reasons: string[] = []
  const weatherReason = buildWeatherReason(weather, venue, vibe)
  if (weatherReason) reasons.push(weatherReason)
  if (intent && intent.confidence >= 50 && intent.category !== 'general') {
    const cat = (venue.category ?? '').toLowerCase()
    if (intent.preferIndoor && /\b(bar|pub|restaurant|cafe|coffee|bistro|brewery|cocktail|club|cinema|theatre|museum|gallery|bowling)\b/i.test(cat)) reasons.push('Good indoor option — stays comfortable whatever the forecast.')
    else if (intent.category === 'dining' && /\b(restaurant|dining|bistro|brasserie|kitchen|food)\b/i.test(cat)) reasons.push("Restaurant setting matches your group's dining plans.")
    else if (intent.category === 'cafe_coffee' && /\b(cafe|coffee|bakery|brunch)\b/i.test(cat)) reasons.push('Café setting suits the relaxed vibe your group is after.')
    else if (intent.category === 'indoor_social' && /\b(bar|pub|brewery|cocktail|wine|lounge)\b/i.test(cat)) reasons.push('Great bar or pub — ideal for a social night out.')
    else if ((intent.category === 'outdoor_active' || intent.category === 'outdoor_social') && /\b(park|garden|beach|trail|outdoor|promenade)\b/i.test(cat)) reasons.push('Open-air venue — fits an outdoor outing perfectly.')
    else if (intent.category === 'culture' && /\b(museum|gallery|theatre|cinema|art|heritage)\b/i.test(cat)) reasons.push("Cultural venue well suited to the group's plans.")
    else if (intent.category === 'entertainment' && /\b(bowling|arcade|escape|karaoke|gaming|cinema)\b/i.test(cat)) reasons.push('Activity venue the whole group can enjoy together.')
  }
  if (!midpointFallback && venue.distance_km != null) { if (venue.distance_km < 0.5) reasons.push(`Just ${Math.round(venue.distance_km * 1000)}m from your midpoint — practically next door.`); else if (venue.distance_km < 1.5) reasons.push(`Close to your midpoint — only ${venue.distance_km < 1 ? `${Math.round(venue.distance_km * 1000)}m` : `${venue.distance_km.toFixed(1)}km`} away.`) }
  if (venue.rating != null && venue.rating >= 4.4) { const count = formatRatingCount(venue.rating_count); reasons.push(count ? `Highly rated at ${venue.rating.toFixed(1)}★ across ${count} reviews.` : `Highly rated at ${venue.rating.toFixed(1)}★.`) }
  if (venue.open_now === true && goldenWindow) reasons.push(`Open right now — fits your Golden Window of ${goldenWindow.start_time}–${goldenWindow.end_time}.`)
  else if (venue.open_now === true) reasons.push('Open right now and ready when your group is.')
  if (!reasons.length) reasons.push(`Matches the group vibe — ${VIBE_LABEL[vibe].toLowerCase()}.`)
  return reasons.slice(0, 4)
}
