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
 * Priority order: finer-grained settlement types first so that large
 * administrative districts (e.g. "Wealden", "Greater London") stored in
 * addr.city never inflate the area type for rural or suburban locations.
 *
 * Nominatim sometimes returns addr.city for district/county boundaries that
 * cover hundreds of square kilometres. Treating those as 'urban-core' would
 * apply an 800 m venue-search radius to a rural user, hiding most nearby
 * venues. The fix: classify by the most specific settlement present, only
 * falling back to addr.city when the OSM `type` confirms it is truly a city
 * (not an administrative boundary).
 *
 *   suburb/neighbourhood within a town or city → suburban
 *   town / municipality                        → town
 *   village / hamlet                           → rural
 *   city confirmed by OSM type='city'          → urban-core or suburban
 *   addr.city only (no confirming type)        → suburban (conservative)
 *   only administrative fields (county/state)  → rural
 *   default                                    → suburban (safe middle ground)
 */
export function classifyArea(data: NominatimReverseResult): AreaType {
  const addr = data.address ?? {}
  const osmType = data.type ?? ''

  // 1. Named inner district of a settlement → suburban density
  if (addr.suburb || addr.neighbourhood || addr.quarter) {
    return 'suburban'
  }

  // 2. Town or municipality — specific, trustworthy
  if (addr.town || addr.municipality) {
    return 'town'
  }

  // 3. Village or hamlet — sparse, rural
  if (addr.village || addr.hamlet) {
    return 'rural'
  }

  // 4. addr.city is present — but verify via OSM type before promoting to
  //    urban-core. Nominatim sets addr.city for large administrative districts
  //    (type='administrative') as well as real cities (type='city'). Only
  //    classify as urban-core when OSM explicitly says it is a city.
  if (addr.city) {
    if (osmType === 'city') {
      return 'urban-core'
    }
    // Administrative boundary masquerading as a city — treat conservatively.
    // E.g. 'Wealden' (type='administrative'), 'Greater London' (type='administrative').
    return 'suburban'
  }

  // 5. OSM `type` fallback (no address block fields matched above)
  switch (osmType) {
    case 'city':                  return 'urban-core'
    case 'town':                  return 'town'
    case 'village':
    case 'hamlet':
    case 'isolated_dwelling':     return 'rural'
    case 'suburb':
    case 'neighbourhood':
    case 'quarter':               return 'suburban'
  }

  // 6. Only administrative fields present (county/state/country) → rural
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
