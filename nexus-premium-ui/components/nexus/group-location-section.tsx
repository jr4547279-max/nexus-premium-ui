'use client'

// Group Planning Location Section — Nexus Location Intelligence

import { useEffect, useState } from 'react'
import { MapPin, ChevronRight, X, Loader2, Trash2, ExternalLink, Route } from 'lucide-react'
import { GlassCard } from './glass-card'
import { LocationPicker, type LocationResult } from './location-picker'
import { extractCity } from '@/lib/profile-service'
import { getGroup, saveGroupPlanningLocation, clearGroupPlanningLocation } from '@/lib/group-service'
import type { PlanningLocation } from '@/lib/types/planning-location'
import { AREA_TYPE_LABELS, formatRadius } from '@/lib/location-intelligence'
import type { LocationIntelligence } from '@/lib/location-intelligence'
import { getActivityById } from '@/lib/activities/registry'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { listGroupSavedVenues, removeVenueFromGroup, type SavedVenue } from '@/lib/saved-venue-service'

interface GroupLocationSectionProps {
  groupId: string
  planningLocation: PlanningLocation | null
  onChanged: (location: PlanningLocation | null) => void
}

async function fetchLocationIntelligence(lat: number, lng: number): Promise<LocationIntelligence | null> {
  try {
    const res = await fetch('/nx/location/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
    })
    if (!res.ok) return null
    return (await res.json()) as LocationIntelligence
  } catch {
    return null
  }
}

function dispatchSavedVenue(venue: SavedVenue, activityId: string | null) {
  const detail = {
    id: venue.place_id,
    name: venue.venue_name,
    category: venue.venue_category,
    photo_url: venue.venue_photo_url,
    maps_url: venue.map_url,
    address: venue.venue_address,
    rating: venue.venue_rating,
    lat: venue.venue_lat,
    lng: venue.venue_lng,
    activityId,
  }
  const eventName = activityId === 'pub-crawl' ? 'nexus:add-crawl-venue' : 'nexus:use-group-venue'
  window.dispatchEvent(new CustomEvent(eventName, { detail }))
  try {
    window.localStorage.setItem('nexus:group-venue-candidate', JSON.stringify(detail))
  } catch { /* non-fatal */ }
  const activity = activityId ? getActivityById(activityId as never) : undefined
  const label = activity?.label ?? 'activity'
  toast.success('Venue ready for your plan', {
    description: `${venue.venue_name} is ready to use in your ${label.toLowerCase()} plan.`,
    icon: activityId === 'pub-crawl' ? '🍻' : '📍',
  })
}

function SavedVenuesSection({ groupId }: { groupId: string }) {
  const [venues, setVenues] = useState<SavedVenue[]>([])
  const [activityId, setActivityId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const [savedVenues, group] = await Promise.all([
      listGroupSavedVenues(groupId),
      getGroup(groupId),
    ])
    setVenues(savedVenues)
    setActivityId(group?.activity_id ?? null)
    setLoading(false)
  }

  useEffect(() => { void load() }, [groupId])

  const remove = async (id: string) => {
    setRemovingId(id)
    const ok = await removeVenueFromGroup(id)
    if (ok) {
      setVenues((current) => current.filter((venue) => venue.id !== id))
      toast.success('Removed from group')
    } else {
      toast.error('Could not remove venue')
    }
    setRemovingId(null)
  }

  if (loading) {
    return <GlassCard className="mb-4 px-4 py-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading group places…</div></GlassCard>
  }

  if (!venues.length) return null

  const activity = activityId ? getActivityById(activityId as never) : undefined
  const isPubCrawl = activityId === 'pub-crawl'
  const actionLabel = isPubCrawl ? 'Use in Pub Crawl' : `Use in ${activity?.label ?? 'Plan'}`

  return (
    <GlassCard className="mb-4 overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Group Places</p>
          <p className="mt-0.5 text-xs text-foreground/80">Saved by your group · {venues.length}{activity?.label ? ` · ${activity.label}` : ''}</p>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] text-primary">SHORTLIST</span>
      </div>
      <div className="divide-y divide-border/20">
        {venues.map((venue) => (
          <div key={venue.id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              {venue.venue_photo_url ? (
                <img src={venue.venue_photo_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl">📍</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{venue.venue_name}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {venue.venue_rating != null ? `★ ${Number(venue.venue_rating).toFixed(1)} · ` : ''}{venue.venue_category || 'Venue'}
                </p>
                {venue.venue_address && <p className="mt-0.5 truncate text-[10px] text-muted-foreground/60">{venue.venue_address}</p>}
              </div>
              <button type="button" onClick={() => remove(venue.id)} disabled={removingId === venue.id} aria-label={`Remove ${venue.venue_name}`} className="rounded-lg p-2 text-muted-foreground hover:bg-muted/30 hover:text-foreground disabled:opacity-50">
                {removingId === venue.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-2.5 flex gap-2 pl-[60px]">
              {activityId && <button type="button" onClick={() => dispatchSavedVenue(venue, activityId)} disabled={venue.venue_lat == null || venue.venue_lng == null} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-primary disabled:cursor-not-allowed disabled:opacity-40"><Route className="h-3 w-3" />{actionLabel}</button>}
              {venue.map_url && <a href={venue.map_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 px-2.5 py-1.5 text-[10px] text-muted-foreground hover:text-foreground"><ExternalLink className="h-3 w-3" />Maps</a>}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

export function GroupLocationSection({ groupId, planningLocation, onChanged }: GroupLocationSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [resolving, setResolving] = useState(false)

  const handleSave = async (result: LocationResult): Promise<boolean> => {
    const cityName = extractCity(result.address) || result.address
    const location: PlanningLocation = {
      lat: result.lat,
      lng: result.lng,
      name: cityName,
      address: result.address,
      source: result.placeId ? 'search' : 'gps',
    }

    setResolving(true)
    const intelligence = await fetchLocationIntelligence(result.lat, result.lng)
    setResolving(false)

    if (intelligence) {
      location.areaType = intelligence.areaType
      location.planningRadiusMetres = intelligence.planningRadiusMetres
      location.neighborhood = intelligence.neighborhood || undefined
      location.planningCity = intelligence.city || undefined
    }

    const ok = await saveGroupPlanningLocation(groupId, location)
    if (ok) {
      toast.success('Planning location set', { description: `Nexus will search around ${cityName}`, icon: '📍' })
      onChanged(location)
    } else {
      toast.error('Could not save location', { description: 'Make sure the database migrations have been applied.' })
    }
    return ok
  }

  const handleClear = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setClearing(true)
    const ok = await clearGroupPlanningLocation(groupId)
    if (ok) {
      toast.success('Planning location removed')
      onChanged(null)
    } else {
      toast.error('Could not remove planning location')
    }
    setClearing(false)
  }

  const intelligenceLabel = planningLocation?.areaType && planningLocation?.planningRadiusMetres
    ? `${AREA_TYPE_LABELS[planningLocation.areaType]} · ${formatRadius(planningLocation.planningRadiusMetres)} radius`
    : null
  const displayName = planningLocation?.name || extractCity(planningLocation?.address ?? '') || planningLocation?.address || null

  return (
    <>
      <SavedVenuesSection groupId={groupId} />
      <GlassCard className={cn('mb-4 px-4 py-3 cursor-pointer hover:bg-muted/10 transition-colors')} onClick={() => setPickerOpen(true)}>
        <div className="flex items-center gap-3">
          <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0', planningLocation ? 'bg-primary/15' : 'bg-muted/30')}>
            {resolving ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> : <MapPin className={cn('w-4 h-4', planningLocation ? 'text-primary' : 'text-muted-foreground')} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-0.5">Planning Location</p>
            {planningLocation ? <>
              <p className="text-sm font-medium text-foreground truncate leading-tight">{displayName}</p>
              {planningLocation.address && displayName !== planningLocation.address && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{planningLocation.address}</p>}
              {intelligenceLabel && <p className="text-[11px] text-primary/60 mt-0.5 font-medium">{intelligenceLabel}</p>}
            </> : <p className="text-xs text-muted-foreground">Add a location so Nexus can find places nearby</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {planningLocation && <button onClick={handleClear} disabled={clearing} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors" aria-label="Remove planning location">
              {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            </button>}
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </GlassCard>
      <LocationPicker open={pickerOpen} onOpenChange={setPickerOpen} title="Where are you meeting?" confirmLabel="Set Planning Location" onSave={handleSave} hidePrivacyNote initialLat={planningLocation?.lat} initialLng={planningLocation?.lng} />
    </>
  )
}
