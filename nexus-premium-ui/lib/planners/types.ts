// ─────────────────────────────────────────────────────────────────────────────
// Nexus Planner Engine — Core Types
// ─────────────────────────────────────────────────────────────────────────────
// These types define a generic planning architecture. New planners (Running,
// Restaurant, Hiking, etc.) slot in without touching the engine or existing
// planners. Only the registry needs a new entry.
// ─────────────────────────────────────────────────────────────────────────────

export type BudgetPreference = 'low' | 'medium' | 'high'
export type WalkingPreference = 'minimal' | 'moderate' | 'active'
export type PriceLevel = 1 | 2 | 3 | 4 // £ | ££ | £££ | ££££
export type VenueCapacity = 'small' | 'medium' | 'large'
export type MatchQuality = 'perfect' | 'strong' | 'partial' | 'compromise'

// ── Venue ─────────────────────────────────────────────────────────────────────

export interface PlannerVenue {
  id: string
  name: string
  lat: number
  lng: number
  rating: number           // 0–5; 0 = unknown (check ratingKnown)
  priceLevel: PriceLevel
  openingTime: string      // "HH:MM" 24-hour
  closingTime: string      // "HH:MM" 24-hour (may be "02:00" i.e. next-day early)
  atmosphere: string[]     // e.g. ['lively', 'cosy', 'classic']
  tags: string[]           // e.g. ['real-ale', 'beer-garden', 'sports']
  estimatedCostPerPerson: number  // £ per round / visit; 0 = unknown
  capacity: VenueCapacity
  features: string[]       // e.g. ['outdoor-seating', 'live-music', 'pool-table']
  distanceFromCentre: number  // km from the group's reference point

  // ── Provider transparency (all optional, backward-compatible) ─────────────
  /** "Open in Maps" deep-link (OpenStreetMap or similar) */
  mapsUrl?: string | null
  /** Human-readable address or district */
  address?: string | null
  /** Venue website URL */
  website?: string | null
  /** true when sourced from a real-world provider (OSM etc); false/undefined = mock */
  isRealData?: boolean
  /** false = rating was unavailable; 0 is a neutral placeholder, do not display */
  ratingKnown?: boolean
  /** false = price level is a default; do not display as authoritative */
  priceLevelKnown?: boolean
  /** false = opening hours were not available or could not be parsed */
  openingHoursKnown?: boolean
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export interface PlannerScoreBreakdown {
  rating: number      // 0–20
  distance: number    // 0–20
  price: number       // 0–15
  atmosphere: number  // 0–17
  openingHours: number // 0–17
  capacity: number    // 0–11
}

export interface PlannerScore {
  total: number  // 0–100 (sum of breakdown)
  breakdown: PlannerScoreBreakdown
}

// ── Candidate (pre-selection) ─────────────────────────────────────────────────

export interface PlannerCandidate {
  venue: PlannerVenue
  score: PlannerScore
  included: boolean
  exclusionReason?: string
}

// ── Route ─────────────────────────────────────────────────────────────────────

export interface PlannerStop {
  order: number
  venue: PlannerVenue
  /** "HH:MM" 24-hour arrival time at this stop */
  arrivalTime: string
  /** "HH:MM" 24-hour departure time from this stop */
  departureTime: string
  /** Walking time FROM the previous stop (0 for the first stop) */
  walkingFromPrevious: number
  /** Walking distance FROM the previous stop in km (0 for the first stop) */
  distanceFromPrevious: number
  score: PlannerScore
}

export interface PlannerRoute {
  stops: PlannerStop[]
  totalDistanceKm: number
  totalWalkingMinutes: number
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface PlannerResult {
  title: string
  subtitle: string
  activityId: string
  durationMinutes: number
  /** Human-readable cost label: "£" | "££" | "£££" | "££££" */
  estimatedCostLabel: string
  totalDistanceKm: number
  walkingMinutes: number
  stops: PlannerStop[]
  overallScore: number         // 0–100
  explanation: string
  warnings: string[]
  generatedAt: string          // ISO timestamp
  /** Match quality of the Golden Window used (if any) */
  goldenWindowQuality?: MatchQuality
  /** Percentage of group available during the selected window */
  groupMatchPercent?: number
  // ── Provider metadata ─────────────────────────────────────────────────────
  /** 'real' = live OSM/API data; 'mock' = deterministic demo data */
  dataSource?: 'real' | 'mock'
  /** Human-readable provider label shown in the UI */
  providerName?: string
  /** Transparent reasons for the top venue pick — "Why did Nexus choose this?" */
  scoreReasons?: string[]
}

// ── Request ───────────────────────────────────────────────────────────────────

/** Minimal Golden Window shape that the planner needs (avoids circular import) */
export interface GoldenWindowLike {
  day_of_week: number
  start_time: string       // "HH:MM"
  end_time: string         // "HH:MM"
  duration_minutes: number
  match_quality?: string
  confidence_score?: number
  available_member_count?: number
  total_member_count?: number
}

export interface PlannerRequest {
  groupId: string
  activityId: string
  goldenWindow?: GoldenWindowLike
  /** Reference point for distance scoring */
  groupLocation?: { lat: number; lng: number }
  preferredDurationMinutes?: number
  desiredStops?: number
  budgetPreference?: BudgetPreference
  walkingPreference?: WalkingPreference
}

// ── Requirements check ────────────────────────────────────────────────────────

export interface PlannerRequirements {
  canPlan: boolean
  missingRequirements: string[]
}

// ── Provider interface ────────────────────────────────────────────────────────
// Replace MockVenueProvider with a real Places API provider without touching
// any planner logic — just swap the provider in the planner constructor.

export interface VenueProvider {
  getVenues(
    activityId: string,
    location?: { lat: number; lng: number },
  ): Promise<PlannerVenue[]>
}

// ── Planner definition ────────────────────────────────────────────────────────

export interface PlannerDefinition {
  /** Unique planner id, e.g. "pub-crawl-planner" */
  id: string
  /** The activity id this planner handles, e.g. "pub-crawl" */
  activityId: string
  name: string
  description: string
  plan(request: PlannerRequest): Promise<PlannerResult>
}
