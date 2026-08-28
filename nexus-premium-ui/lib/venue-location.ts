export interface ProviderVenueLocation {
  name?: string | null
  lat?: number | null
  lng?: number | null
}

const EARTH_RADIUS_KM = 6371

export function venueDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = radians(to.lat - from.lat)
  const dLng = radians(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Reject malformed or out-of-area provider results before they become map
 * markers. Accepted coordinates are never modified: they remain the exact
 * WGS-84 latitude/longitude returned by Google Places or OpenStreetMap.
 */
export function hasValidProviderLocation(
  venue: ProviderVenueLocation,
  searchCenter: { lat: number; lng: number },
  radiusMetres: number,
): venue is ProviderVenueLocation & { name: string; lat: number; lng: number } {
  if (!venue.name?.trim() || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) return false

  const lat = venue.lat as number
  const lng = venue.lng as number
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false

  // Google Text Search applies a location bias rather than a hard boundary.
  // Enforce the caller's circle, with 50 m allowance for provider rounding.
  const maximumDistanceKm = Math.max(0, radiusMetres) / 1000 + 0.05
  return venueDistanceKm(searchCenter, { lat, lng }) <= maximumDistanceKm
}
