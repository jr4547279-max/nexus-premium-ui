// ─────────────────────────────────────────────────────────────────────────────
// Planning Location — where Nexus should search for venues
// ─────────────────────────────────────────────────────────────────────────────
// Represents the geographic centre for a group's activity planning.
// Kept separate from profile location (which is per-user).

import type { AreaType } from '../location-intelligence/types'

export type PlanningLocationSource = 'gps' | 'search' | 'map' | 'saved' | 'system'

export interface PlanningLocation {
  lat: number
  lng: number
  /** Human-readable place name, e.g. "Brighton Station" */
  name: string
  /** Full address string, e.g. "Station Road, Brighton, BN1 5RD" */
  address: string
  /** How this location was set */
  source: PlanningLocationSource

  // ── Location Intelligence fields (populated after resolve) ────────────────
  /** Urban density classification: 'urban-core' | 'suburban' | 'town' | 'rural' */
  areaType?: AreaType
  /** Recommended venue-search radius in metres, derived from areaType */
  planningRadiusMetres?: number
  /** Fine-grained area name: suburb, neighbourhood, or quarter */
  neighborhood?: string
  /** Settlement name: city or town */
  planningCity?: string

  createdAt?: string
  updatedAt?: string
}
