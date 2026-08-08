// ─────────────────────────────────────────────────────────────────────────────
// Nexus Location Intelligence — Core Types
// ─────────────────────────────────────────────────────────────────────────────
// Safe to import on both server and client.
// Server-only resolver logic lives in ./resolver.ts.

/** Urban density classification derived from Nominatim address hierarchy. */
export type AreaType = 'urban-core' | 'suburban' | 'town' | 'rural'

/** Human-readable labels for display in the UI. */
export const AREA_TYPE_LABELS: Record<AreaType, string> = {
  'urban-core': 'Urban Core',
  'suburban':   'Suburban',
  'town':       'Town',
  'rural':      'Rural',
}

/**
 * Recommended venue-search radius keyed by area type.
 * Urban-core is dense and walkable; rural requires a much wider net.
 */
export const AREA_TYPE_RADII: Record<AreaType, number> = {
  'urban-core':  800,
  'suburban':   2000,
  'town':       3500,
  'rural':      8000,
}

/**
 * Enriched location intelligence resolved from a lat/lng pair.
 * Returned by POST /nx/location/resolve and stored alongside the group location.
 */
export interface LocationIntelligence {
  /** Urban density classification */
  areaType: AreaType
  /** Recommended venue search radius in metres */
  planningRadiusMetres: number
  /** Fine-grained area name: suburb, neighbourhood, or quarter */
  neighborhood: string
  /** Settlement name: city or town */
  city: string
  /** Administrative area: county or state */
  adminArea: string
  /** Country name */
  country: string
  /**
   * Short display label combining neighbourhood + city where meaningful.
   * e.g. "Soho, London" | "Brighton" | "Harrogate"
   */
  displayLabel: string
}

/**
 * Format a radius in metres for human display.
 * "800 m" | "2 km" | "3.5 km"
 */
export function formatRadius(metres: number): string {
  if (metres < 1000) return `${metres} m`
  const km = metres / 1000
  return `${km % 1 === 0 ? km : km.toFixed(1)} km`
}
