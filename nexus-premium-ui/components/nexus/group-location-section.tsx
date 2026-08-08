'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Group Planning Location Section — Nexus Location Intelligence
// ─────────────────────────────────────────────────────────────────────────────
// Shown in GroupDetail. Lets group members set where Nexus should search
// for venues. Uses the existing LocationPicker with a custom save path.
//
// After a location is saved, calls POST /nx/location/resolve server-side to
// enrich it with area type and planning radius. The resolved intelligence is
// merged into the location and persisted once to Supabase.
//
// No Nominatim URLs or server credentials are exposed to the browser —
// the resolve call goes to our own Next.js API route.

import { useState } from 'react'
import { MapPin, ChevronRight, X, Loader2 } from 'lucide-react'
import { GlassCard } from './glass-card'
import { LocationPicker, type LocationResult } from './location-picker'
import { extractCity } from '@/lib/profile-service'
import { saveGroupPlanningLocation, clearGroupPlanningLocation } from '@/lib/group-service'
import type { PlanningLocation } from '@/lib/types/planning-location'
import { AREA_TYPE_LABELS, formatRadius } from '@/lib/location-intelligence'
import type { LocationIntelligence } from '@/lib/location-intelligence'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface GroupLocationSectionProps {
  groupId: string
  /** Current planning location (null if not set) */
  planningLocation: PlanningLocation | null
  /** Called when the location is saved or cleared, with the new value */
  onChanged: (location: PlanningLocation | null) => void
}

// ── Location Intelligence fetch ───────────────────────────────────────────────

/**
 * Resolve location intelligence via the server-side API route.
 * Returns null on failure — the caller degrades gracefully.
 * Nominatim is called server-side; no implementation details reach the client.
 */
async function fetchLocationIntelligence(
  lat: number,
  lng: number,
): Promise<LocationIntelligence | null> {
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

// ── Component ─────────────────────────────────────────────────────────────────

export function GroupLocationSection({
  groupId,
  planningLocation,
  onChanged,
}: GroupLocationSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [clearing,   setClearing]   = useState(false)
  const [resolving,  setResolving]  = useState(false)

  // ── Custom save: resolve intelligence, then write to groups table ─────────
  const handleSave = async (result: LocationResult): Promise<boolean> => {
    const cityName = extractCity(result.address) || result.address

    // Build the base location first
    const location: PlanningLocation = {
      lat:     result.lat,
      lng:     result.lng,
      name:    cityName,
      address: result.address,
      source:  result.placeId ? 'search' : 'gps',
    }

    // Resolve location intelligence server-side (Nominatim behind API route)
    setResolving(true)
    const intelligence = await fetchLocationIntelligence(result.lat, result.lng)
    setResolving(false)

    // Merge intelligence into location (gracefully handles null / API failure)
    if (intelligence) {
      location.areaType             = intelligence.areaType
      location.planningRadiusMetres = intelligence.planningRadiusMetres
      location.neighborhood         = intelligence.neighborhood || undefined
      location.planningCity         = intelligence.city || undefined
    }

    // Single Supabase write — includes all base + intelligence fields
    const ok = await saveGroupPlanningLocation(groupId, location)
    if (ok) {
      toast.success('Planning location set', {
        description: `Nexus will search around ${cityName}`,
        icon: '📍',
      })
      onChanged(location)
    } else {
      toast.error('Could not save location', {
        description: 'Make sure the database migrations have been applied.',
      })
    }
    return ok
  }

  // ── Clear ─────────────────────────────────────────────────────────────────
  const handleClear = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setClearing(true)
    const ok = await clearGroupPlanningLocation(groupId)
    if (ok) {
      toast.success('Planning location removed')
      onChanged(null)
    } else {
      toast.error('Could not remove location')
    }
    setClearing(false)
  }

  // ── Derived display values ────────────────────────────────────────────────
  const intelligenceLabel =
    planningLocation?.areaType && planningLocation?.planningRadiusMetres
      ? `${AREA_TYPE_LABELS[planningLocation.areaType]} · ${formatRadius(planningLocation.planningRadiusMetres)} radius`
      : null

  const displayName =
    planningLocation?.name ||
    extractCity(planningLocation?.address ?? '') ||
    planningLocation?.address ||
    null

  return (
    <>
      {/*
        Outer container is a GlassCard rendered as <div role="button"> — never
        a native <button> — so the inner X button remains the only interactive
        element and there are no nested-button hydration warnings.
      */}
      <GlassCard
        className={cn(
          'mb-4 px-4 py-3 cursor-pointer hover:bg-muted/10 transition-colors',
        )}
        onClick={() => setPickerOpen(true)}
      >
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className={cn(
            'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
            planningLocation ? 'bg-primary/15' : 'bg-muted/30',
          )}>
            {resolving
              ? <Loader2 className="w-4 h-4 text-primary animate-spin" />
              : (
                <MapPin className={cn(
                  'w-4 h-4',
                  planningLocation ? 'text-primary' : 'text-muted-foreground',
                )} />
              )
            }
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-0.5">
              Planning Location
            </p>

            {planningLocation ? (
              <>
                <p className="text-sm font-medium text-foreground truncate leading-tight">
                  {displayName}
                </p>
                {planningLocation.address && displayName !== planningLocation.address && (
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {planningLocation.address}
                  </p>
                )}
                {/* Intelligence row — area type + radius */}
                {intelligenceLabel && (
                  <p className="text-[11px] text-primary/60 mt-0.5 font-medium">
                    {intelligenceLabel}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Add a location so Nexus can find places nearby
              </p>
            )}
          </div>

          {/* Actions — X clear button is the only native <button> in this tree */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {planningLocation && (
              <button
                onClick={handleClear}
                disabled={clearing}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                aria-label="Remove planning location"
              >
                {clearing
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <X className="w-3.5 h-3.5" />
                }
              </button>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </GlassCard>

      <LocationPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Where are you meeting?"
        confirmLabel="Set Planning Location"
        onSave={handleSave}
        hidePrivacyNote
        initialLat={planningLocation?.lat}
        initialLng={planningLocation?.lng}
      />
    </>
  )
}
