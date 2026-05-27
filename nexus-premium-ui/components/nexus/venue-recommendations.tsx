'use client'

import { useEffect, useMemo, useState } from 'react'
import { GlassCard } from './glass-card'
import { ExternalLink, Star, MapPin, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  fetchVenues,
  inferVibe,
  VIBE_LABEL,
  type Vibe,
  type Venue,
} from '@/lib/venue-service'

interface Props {
  groupName: string | null
}

const VIBES: Vibe[] = ['pub', 'drinks', 'food', 'coffee', 'activity']

export function VenueRecommendations({ groupName }: Props) {
  const initialVibe = useMemo(() => inferVibe(groupName), [groupName])
  const [vibe, setVibe] = useState<Vibe>(initialVibe)
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fallback, setFallback] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchVenues({ vibe, limit: 5 }).then((result) => {
      if (cancelled) return
      if (result.error) setError(result.error)
      setVenues(result.venues)
      setFallback(result.fallback)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [vibe])

  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Recommended Spots
        </p>
        {fallback && (
          <span className="text-[10px] text-muted-foreground italic truncate ml-2">
            {fallback}
          </span>
        )}
      </div>

      {/* Vibe chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
        {VIBES.map((v) => {
          const on = v === vibe
          return (
            <button
              key={v}
              type="button"
              onClick={() => setVibe(v)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                on
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/50',
              )}
            >
              {VIBE_LABEL[v]}
            </button>
          )
        })}
      </div>

      {loading ? (
        <GlassCard className="p-4">
          <p className="text-xs text-muted-foreground">Finding spots near you…</p>
        </GlassCard>
      ) : error ? (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Couldn't load venues</span>
          </div>
          <p className="text-xs text-muted-foreground">{error}</p>
        </GlassCard>
      ) : venues.length === 0 ? (
        <GlassCard className="p-4">
          <p className="text-xs text-muted-foreground">
            No venues found for this vibe in the search area.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {venues.map((v) => (
            <VenueRow key={`${v.name}-${v.address ?? ''}`} venue={v} />
          ))}
        </div>
      )}
    </div>
  )
}

function VenueRow({ venue }: { venue: Venue }) {
  const inner = (
    <GlassCard hover className="p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-medium text-sm truncate">{venue.name}</h3>
            {venue.rating != null && (
              <span className="text-[11px] text-amber-400 flex items-center gap-0.5">
                <Star className="w-3 h-3 fill-current" />
                {venue.rating.toFixed(1)}
                {venue.rating_count != null && (
                  <span className="text-muted-foreground ml-0.5">
                    ({venue.rating_count})
                  </span>
                )}
              </span>
            )}
            {venue.open_now === true && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                Open
              </span>
            )}
            {venue.open_now === false && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground">
                Closed
              </span>
            )}
          </div>
          {venue.category && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {venue.category}
            </p>
          )}
          {venue.address && (
            <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
              <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
              <span className="truncate">{venue.address}</span>
            </p>
          )}
        </div>
        {venue.maps_url && (
          <ExternalLink className="w-4 h-4 text-muted-foreground self-center shrink-0" />
        )}
      </div>
    </GlassCard>
  )

  if (venue.maps_url) {
    return (
      <a
        href={venue.maps_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {inner}
      </a>
    )
  }
  return inner
}
