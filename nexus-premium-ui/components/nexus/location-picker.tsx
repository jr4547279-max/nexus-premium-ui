'use client'

/**
 * LocationPicker — bottom sheet with three location input methods:
 *   1. GPS   — device geolocation → reverse-geocoded via Nominatim proxy
 *   2. Search — Google Places Autocomplete (server-side key)
 *   3. Map    — tap/click on an interactive Leaflet map
 *
 * Supports two save modes:
 *   - Profile mode (default): writes to `profiles` table via updateUserLocation.
 *   - Custom mode: caller supplies `onSave(result)` which returns true on success.
 *     Pass `hidePrivacyNote` to suppress the "city shown publicly" footer.
 *
 * On confirm the chosen coordinates + address are emitted via `onSaved`.
 */

import { useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Navigation, Search, Map, Loader2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { updateUserLocation, extractCity } from '@/lib/profile-service'
import { useAuth } from '@/lib/auth-context'

// Dynamically imported so Leaflet (which uses window/document) never runs SSR
const MapPicker = dynamic(() => import('./map-picker'), {
  ssr: false,
  loading: () => (
    <div className="h-[280px] rounded-xl bg-muted/30 flex items-center justify-center border border-border/40">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'gps' | 'search' | 'map'

export interface LocationResult {
  lat:     number
  lng:     number
  address: string
  placeId?: string
}

interface Suggestion {
  placeId:       string
  mainText:      string
  secondaryText: string
}

export interface LocationPickerProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful save with the chosen result */
  onSaved?:     (result: LocationResult) => void
  /** Pass the user's currently saved location so the map starts there */
  initialLat?:  number
  initialLng?:  number
  /** Override the sheet title (default: "Update Location") */
  title?: string
  /** Confirm button label (default: "Confirm Location") */
  confirmLabel?: string
  /**
   * Custom save function. When provided, this replaces the default profile save.
   * Return true on success, false on failure (the component will toast on false).
   */
  onSave?: (result: LocationResult) => Promise<boolean>
  /** When true, hides the "Only your city is shown publicly" privacy note */
  hidePrivacyNote?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LocationPicker({
  open,
  onOpenChange,
  onSaved,
  initialLat,
  initialLng,
  title = 'Update Location',
  confirmLabel = 'Confirm Location',
  onSave: customSave,
  hidePrivacyNote = false,
}: LocationPickerProps) {
  const { user, refreshProfile } = useAuth()

  const [tab,     setTab]     = useState<Tab>('gps')
  const [selected, setSelected] = useState<LocationResult | null>(null)
  const [saving,   setSaving]   = useState(false)

  // GPS
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [gpsError,  setGpsError]  = useState('')

  // Search
  const [query,         setQuery]         = useState('')
  const [suggestions,   setSuggestions]   = useState<Suggestion[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Best-known device GPS position — used to bias autocomplete toward the user's
  // actual physical location so ambiguous place names (e.g. "Willingdon") resolve
  // to the correct country. Updated whenever the GPS tab succeeds; also attempted
  // silently when the Search tab is first activated.
  const gpsRef = useRef<{ lat: number; lng: number } | null>(null)

  // Map reverse-geocode
  const [reverseLoading, setReverseLoading] = useState(false)

  // ── Reset on close ──────────────────────────────────────────────────────────
  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setTab('gps')
      setSelected(null)
      setGpsStatus('idle')
      setGpsError('')
      setQuery('')
      setSuggestions([])
      setReverseLoading(false)
    }
    onOpenChange(val)
  }

  // ── GPS tab ─────────────────────────────────────────────────────────────────
  const handleGps = useCallback(async () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.')
      setGpsStatus('error')
      return
    }
    setGpsStatus('loading')
    setGpsError('')
    setSelected(null)

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        // Store for autocomplete bias (persists across tabs in this session)
        gpsRef.current = { lat, lng }
        try {
          const res  = await fetch(`/nx/places/reverse-geocode?lat=${lat}&lng=${lng}`)
          const data = res.ok ? await res.json() : null
          setSelected({ lat, lng, address: data?.address ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}` })
        } catch {
          setSelected({ lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` })
        }
        setGpsStatus('success')
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: 'Location permission denied. Please allow access in your browser or device settings.',
          2: 'Position unavailable. Please try Search or Map instead.',
          3: 'Location request timed out. Please try again.',
        }
        setGpsError(msgs[err.code] ?? 'Could not determine your location.')
        setGpsStatus('error')
      },
      { timeout: 12_000, enableHighAccuracy: true },
    )
  }, [])

  // ── Search tab ──────────────────────────────────────────────────────────────

  // Silently request device GPS when search tab is opened so autocomplete can
  // bias results toward the user's actual location without requiring them to
  // explicitly use the GPS tab first.
  const handleSearchTabActivated = useCallback(() => {
    if (gpsRef.current) return   // already have a position
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => { gpsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude } },
      () => { /* ignore — bias is optional, we just won't have it */ },
      { timeout: 5_000, enableHighAccuracy: false, maximumAge: 60_000 },
    )
  }, [])

  const handleQueryChange = (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) { setSuggestions([]); return }

    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        // Include device GPS as a location bias so ambiguous place names
        // (e.g. "Willingdon") resolve to the user's actual country.
        const gps  = gpsRef.current
        const bias = gps ? `&lat=${gps.lat.toFixed(6)}&lng=${gps.lng.toFixed(6)}` : ''
        const res  = await fetch(`/nx/places/autocomplete?q=${encodeURIComponent(val)}${bias}`)
        const data = res.ok ? await res.json() : { suggestions: [] }
        setSuggestions(data.suggestions ?? [])
      } catch {
        setSuggestions([])
      } finally {
        setSearchLoading(false)
      }
    }, 350)
  }

  const handleSelectSuggestion = async (s: Suggestion) => {
    setSuggestions([])
    setQuery(`${s.mainText}${s.secondaryText ? `, ${s.secondaryText}` : ''}`)
    setDetailLoading(true)
    try {
      const res  = await fetch(`/nx/places/autocomplete?placeId=${encodeURIComponent(s.placeId)}`)
      if (!res.ok) throw new Error('Details failed')
      const data = await res.json() as { latitude: number; longitude: number; formattedAddress: string }
      setSelected({
        lat:     data.latitude,
        lng:     data.longitude,
        address: data.formattedAddress,
        placeId: s.placeId,
      })
    } catch {
      toast.error('Could not load place details. Please try another result.')
    } finally {
      setDetailLoading(false)
    }
  }

  // ── Map tab ─────────────────────────────────────────────────────────────────
  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setSelected(null)
    setReverseLoading(true)
    try {
      const res  = await fetch(`/nx/places/reverse-geocode?lat=${lat}&lng=${lng}`)
      const data = res.ok ? await res.json() : null
      setSelected({ lat, lng, address: data?.address ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}` })
    } catch {
      setSelected({ lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` })
    } finally {
      setReverseLoading(false)
    }
  }, [])

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      if (customSave) {
        // Custom save path (e.g. group planning location)
        const ok = await customSave(selected)
        if (!ok) throw new Error('Save returned false')
        onSaved?.(selected)
        handleOpenChange(false)
      } else {
        // Default: save to user profile
        if (!user) throw new Error('Not authenticated')
        const result = await updateUserLocation(user.id, {
          latitude:          selected.lat,
          longitude:         selected.lng,
          formatted_address: selected.address,
          place_id:          selected.placeId ?? null,
        })
        if (!result) throw new Error('Save returned null — run supabase/migration.sql first')
        await refreshProfile()
        toast.success('Location saved', {
          description: extractCity(selected.address) || selected.address,
          icon: '📍',
        })
        onSaved?.(selected)
        handleOpenChange(false)
      }
    } catch (err) {
      console.error('[location-picker] save failed', err)
      toast.error('Could not save location', {
        description: 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'gps'    as Tab, label: 'GPS',    Icon: Navigation },
    { id: 'search' as Tab, label: 'Search', Icon: Search     },
    { id: 'map'    as Tab, label: 'Map',    Icon: Map        },
  ]

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[88vh] rounded-t-2xl flex flex-col p-0 gap-0"
      >
        {/* Header */}
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border/30 shrink-0">
          <SheetTitle className="text-base font-medium">{title}</SheetTitle>
        </SheetHeader>

        {/* Method tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-border/20 shrink-0 bg-muted/20">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => {
                setTab(id)
                setSelected(null)
                // When switching to Search, silently try to get device GPS so
                // autocomplete can bias results toward the user's actual location.
                if (id === 'search') handleSearchTabActivated()
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors',
                tab === id
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
          {tab === 'gps' && (
            <GpsTab
              status={gpsStatus}
              error={gpsError}
              onUseGps={handleGps}
            />
          )}
          {tab === 'search' && (
            <SearchTab
              query={query}
              suggestions={suggestions}
              searchLoading={searchLoading}
              detailLoading={detailLoading}
              onQueryChange={handleQueryChange}
              onSelectSuggestion={handleSelectSuggestion}
            />
          )}
          {tab === 'map' && (
            <MapTab
              reverseLoading={reverseLoading}
              onMapClick={handleMapClick}
              initialLat={initialLat}
              initialLng={initialLng}
            />
          )}
        </div>

        {/* Footer — preview + confirm */}
        <div className="px-4 pb-safe-area-inset-bottom pb-6 pt-3 border-t border-border/30 shrink-0 space-y-3">
          {selected ? (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-primary/8 border border-primary/20">
              <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-primary leading-tight">
                  {extractCity(selected.address) || selected.address}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {selected.address}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground text-center">
              {tab === 'gps'    ? 'Tap "Use GPS" to detect your location.'   : ''}
              {tab === 'search' ? 'Search for a place to set your location.' : ''}
              {tab === 'map'    ? 'Tap anywhere on the map to drop a pin.'   : ''}
            </p>
          )}

          <Button
            onClick={handleSave}
            disabled={!selected || saving}
            className="w-full h-10 rounded-xl text-sm font-medium"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
            ) : (
              <><Check className="w-4 h-4 mr-2" />{confirmLabel}</>
            )}
          </Button>

          {!hidePrivacyNote && (
            <p className="text-[10px] text-muted-foreground text-center">
              Only your city is shown publicly. Exact coordinates stay private.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── GPS tab ──────────────────────────────────────────────────────────────────

function GpsTab({
  status,
  error,
  onUseGps,
}: {
  status: 'idle' | 'loading' | 'success' | 'error'
  error:  string
  onUseGps: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <div className={cn(
        'w-16 h-16 rounded-2xl flex items-center justify-center transition-colors',
        status === 'success' ? 'bg-emerald-500/15' : 'bg-primary/10',
      )}>
        {status === 'loading'
          ? <Loader2 className="w-7 h-7 text-primary animate-spin" />
          : status === 'success'
          ? <Check className="w-7 h-7 text-emerald-500" />
          : <Navigation className="w-7 h-7 text-primary" />
        }
      </div>

      <div className="text-center max-w-xs">
        <p className="font-medium text-sm">Use Current Location</p>
        <p className="text-muted-foreground text-xs mt-1.5 leading-relaxed">
          Your device's GPS will detect where you are.
          Only the city name will ever be shown to other members.
        </p>
      </div>

      {error && (
        <p className="text-xs text-destructive text-center bg-destructive/8 border border-destructive/20 px-3 py-2 rounded-xl max-w-xs">
          {error}
        </p>
      )}

      <Button
        onClick={onUseGps}
        disabled={status === 'loading'}
        variant={status === 'success' ? 'outline' : 'default'}
        className="w-full max-w-xs h-10 rounded-xl text-sm"
      >
        {status === 'loading' ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Locating…</>
        ) : status === 'success' ? (
          <><Check className="w-4 h-4 mr-2 text-emerald-500" />Location found — use a different one?</>
        ) : (
          <><Navigation className="w-4 h-4 mr-2" />Use GPS</>
        )}
      </Button>
    </div>
  )
}

// ─── Search tab ───────────────────────────────────────────────────────────────

function SearchTab({
  query,
  suggestions,
  searchLoading,
  detailLoading,
  onQueryChange,
  onSelectSuggestion,
}: {
  query:              string
  suggestions:        Suggestion[]
  searchLoading:      boolean
  detailLoading:      boolean
  onQueryChange:      (val: string) => void
  onSelectSuggestion: (s: Suggestion) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        {(searchLoading || detailLoading) && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search for a city or address…"
          className="pl-9 pr-9 h-10 text-sm rounded-xl"
          autoFocus
        />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="rounded-xl border border-border/50 overflow-hidden glass-card p-0">
          {suggestions.map((s, i) => (
            <button
              key={s.placeId}
              onClick={() => onSelectSuggestion(s)}
              className={cn(
                'w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-muted/50 transition-colors',
                i !== 0 && 'border-t border-border/30',
              )}
            >
              <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{s.mainText}</p>
                {s.secondaryText && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {s.secondaryText}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Empty states */}
      {!suggestions.length && !searchLoading && !detailLoading && query.trim() && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No results — try a different search term.
        </p>
      )}
      {!query.trim() && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Type a city, town, or full address to search.
        </p>
      )}
    </div>
  )
}

// ─── Map tab ──────────────────────────────────────────────────────────────────

function MapTab({
  reverseLoading,
  onMapClick,
  initialLat,
  initialLng,
}: {
  reverseLoading: boolean
  onMapClick:     (lat: number, lng: number) => void
  initialLat?:    number
  initialLng?:    number
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Tap the map to drop a pin at your location. Pan and zoom to find your area.
      </p>
      <div className="rounded-xl overflow-hidden border border-border/50" style={{ height: 300 }}>
        <MapPicker
          onLocationSelect={onMapClick}
          initialLat={initialLat}
          initialLng={initialLng}
        />
      </div>
      {reverseLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Finding address for this location…
        </div>
      )}
    </div>
  )
}

// Re-export helper so consumers can import it from here
export { extractCity }
