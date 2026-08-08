'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Group Planning Location Section
// ─────────────────────────────────────────────────────────────────────────────
// Shown in GroupDetail. Lets group members set where Nexus should search
// for venues. Uses the existing LocationPicker with a custom save path
// that writes to the groups table instead of the user's profile.

import { useState } from 'react'
import { MapPin, ChevronRight, X, Loader2 } from 'lucide-react'
import { GlassCard } from './glass-card'
import { LocationPicker, type LocationResult } from './location-picker'
import { extractCity } from '@/lib/profile-service'
import { saveGroupPlanningLocation, clearGroupPlanningLocation } from '@/lib/group-service'
import type { PlanningLocation } from '@/lib/types/planning-location'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface GroupLocationSectionProps {
  groupId: string
  /** Current planning location (null if not set) */
  planningLocation: PlanningLocation | null
  /** Called when the location is saved or cleared, with the new value */
  onChanged: (location: PlanningLocation | null) => void
}

export function GroupLocationSection({
  groupId,
  planningLocation,
  onChanged,
}: GroupLocationSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [clearing,   setClearing]   = useState(false)

  // ── Custom save: writes to groups table, not profile ─────────────────────
  const handleSave = async (result: LocationResult): Promise<boolean> => {
    const cityName = extractCity(result.address) || result.address

    const location: PlanningLocation = {
      lat:     result.lat,
      lng:     result.lng,
      name:    cityName,
      address: result.address,
      source:  result.placeId ? 'search' : 'gps',
    }

    const ok = await saveGroupPlanningLocation(groupId, location)
    if (ok) {
      toast.success('Planning location set', {
        description: `Nexus will search around ${cityName}`,
        icon: '📍',
      })
      onChanged(location)
    } else {
      toast.error('Could not save location', {
        description: 'Make sure the database migration has been applied.',
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

  return (
    <>
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
            planningLocation
              ? 'bg-primary/15'
              : 'bg-muted/30',
          )}>
            <MapPin className={cn(
              'w-4 h-4',
              planningLocation ? 'text-primary' : 'text-muted-foreground',
            )} />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-0.5">
              Planning Location
            </p>
            {planningLocation ? (
              <>
                <p className="text-sm font-medium text-foreground truncate leading-tight">
                  {planningLocation.name || extractCity(planningLocation.address) || planningLocation.address}
                </p>
                {planningLocation.address && planningLocation.name !== planningLocation.address && (
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {planningLocation.address}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Add a location so Nexus can find places nearby
              </p>
            )}
          </div>

          {/* Actions */}
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
