// ─────────────────────────────────────────────────────────────────────────────
// Area Classifier
// ─────────────────────────────────────────────────────────────────────────────
// Converts a Nominatim reverse-geocode response into a typed AreaType and
// derives the recommended planning radius. Pure functions — no side effects,
// no network calls.
//
// Nominatim is used ONLY for reverse-geocoding address/area information.
// Venue/POI discovery uses the Overpass API via OpenStreetMapVenueProvider.

import { type AreaType, AREA_TYPE_RADII, type LocationIntelligence } from './types'

// ── Nominatim response shape ──────────────────────────────────────────────────
// We only declare the fields we actually read.

export interface NominatimAddressBlock {
  city?:          string
  town?:          string
  village?:       string
  hamlet?:        string
  municipality?:  string
  suburb?:        string
  neighbourhood?: string
  quarter?:       string
  county?:        string
  state?:         string
  country?:       string
}

export interface NominatimReverseResult {
  display_name?: string
  /** OSM feature type, e.g. 'city', 'town', 'village', 'suburb' */
  type?: string
  address?: NominatimAddressBlock
}

// ── Classification ────────────────────────────────────────────────────────────

/**
 * Infer AreaType from a Nominatim address block.
 *
 * Priority order mirrors the Nominatim address-importance hierarchy:
 *   suburb/neighbourhood within a city → suburban
 *   city alone                         → urban-core
 *   town / municipality                → town
 *   village / hamlet                   → rural
 *   OSM `type` field fallback
 *   default                            → suburban (safe middle ground)
 */
export function classifyArea(data: NominatimReverseResult): AreaType {
  const addr = data.address ?? {}

  // Named inner district of a city → suburban density
  if ((addr.suburb || addr.neighbourhood || addr.quarter) && addr.city) {
    return 'suburban'
  }

  // City without a suburb qualifier → urban core
  if (addr.city) {
    return 'urban-core'
  }

  // Town or municipality → smaller settlement
  if (addr.town || addr.municipality) {
    return 'town'
  }

  // Village or hamlet → sparse rural
  if (addr.village || addr.hamlet) {
    return 'rural'
  }

  // Secondary fallback: OSM `type` field
  switch (data.type) {
    case 'city':                  return 'urban-core'
    case 'town':                  return 'town'
    case 'village':
    case 'hamlet':
    case 'isolated_dwelling':     return 'rural'
    case 'suburb':
    case 'neighbourhood':
    case 'quarter':               return 'suburban'
  }

  // If only administrative fields present (county/state), treat as rural
  if (!addr.city && !addr.town && !addr.municipality && !addr.village && !addr.hamlet) {
    return 'rural'
  }

  return 'suburban'
}

// ── Intelligence builder ──────────────────────────────────────────────────────

/**
 * Build a complete LocationIntelligence from a Nominatim reverse result.
 * All string fields degrade gracefully to empty strings on missing data.
 */
export function buildLocationIntelligence(data: NominatimReverseResult): LocationIntelligence {
  const addr = data.address ?? {}

  const areaType             = classifyArea(data)
  const planningRadiusMetres = AREA_TYPE_RADII[areaType]

  // Fine-grained area name (innermost named component)
  const neighborhood = addr.suburb ?? addr.neighbourhood ?? addr.quarter ?? ''

  // Settlement name
  const city = addr.city ?? addr.town ?? addr.municipality ?? ''

  // Administrative area
  const adminArea = addr.state ?? addr.county ?? ''

  const country = addr.country ?? ''

  // Display label — combine neighbourhood + city when they differ
  const displayLabel =
    neighborhood && city && neighborhood !== city
      ? `${neighborhood}, ${city}`
      : (city || neighborhood || data.display_name?.split(',')[0]?.trim() || '')

  return {
    areaType,
    planningRadiusMetres,
    neighborhood,
    city,
    adminArea,
    country,
    displayLabel,
  }
}
