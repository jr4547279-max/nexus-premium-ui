// ─────────────────────────────────────────────────────────────────────────────
// Planning Location — where Nexus should search for venues
// ─────────────────────────────────────────────────────────────────────────────
// Represents the geographic centre for a group's activity planning.
// Kept separate from profile location (which is per-user).

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
  createdAt?: string
  updatedAt?: string
}
