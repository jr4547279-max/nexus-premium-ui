// ─────────────────────────────────────────────────────────────────────────────
// Nexus Planner Engine — Core Types
// ─────────────────────────────────────────────────────────────────────────────
// Activity-agnostic planning architecture.
//
// Discriminant pattern
// ────────────────────
// PlannerKind ('venue' | 'route') is carried on both PlannerDefinition and
// PlannerResult so the registry, engine, and UI can dispatch correctly without
// hardcoding activity IDs.
//
// PlannerStop is polymorphic:
//   Venue planners  → populate stop.venue    (waypoint is undefined)
//   Route planners  → populate stop.waypoint (venue is undefined)
//
// All changes are additive — existing venue planners are fully backward-compatible.
// Adding a new route planner (Running, Hiking, Cycling, …) requires only:
//   1. A new PlannerDefinition with kind: 'route'
//   2. One registry entry
//   3. A RoutePlan UI component
// ─────────────────────────────────────────────────────────────────────────────

export type BudgetPreference = 'low' | 'medium' | 'high'
export type WalkingPreference = 'minimal' | 'moderate' | 'active'
export type PriceLevel = 1 | 2 | 3 | 4 // £ | ££ | £££ | ££££
export type VenueCapacity = 'small' | 'medium' | 'large'
export type MatchQuality = 'perfect' | 'strong' | 'partial' | 'compromise'

// ── Route Preferences ─────────────────────────────────────────────────────────
// User-configurable preferences for route planning.
// Reusable across jogging, hiking, cycling, walking — each activity provides
// its own defaults via ActivityRouteConfig.defaultPreferLoop etc.

export type RouteTypePreference = 'loop' | 'out_and_back' | 'any'
export type SurfacePreference   = 'paths' | 'roads' | 'mixed'
export type DifficultyPreference = 'easy' | 'moderate' | 'challenging' | 'any'

export interface RoutePreferences {
  /** Target route distance in km (1–30) */
  distanceKm: number
  /** Preferred route geometry */
  routeTypePreference: RouteTypePreference
  /** Preferred surface type — inferred from OSM step names */
  surfacePreference: SurfacePreference
  /** Preferred difficulty level */
  difficulty: DifficultyPreference
}

export const DEFAULT_ROUTE_PREFERENCES: RoutePreferences = {
  distanceKm:          5,
  routeTypePreference: 'any',
  surfacePreference:   'mixed',
  difficulty:          'any',
}

/**
 * Discriminant for the planner architecture.
 *
 * 'venue' — planner selects and scores physical venues (pubs, restaurants, etc.)
 *           PlannerStop.venue is populated; PlannerStop.waypoint is undefined.
 *
 * 'route' — planner plans a path or trail (running, hiking, cycling, etc.)
 *           PlannerStop.waypoint is populated; PlannerStop.venue is undefined.
 *
 * Carried on PlannerDefinition (what the planner produces) and PlannerResult
 * (what it returns) so the UI can render the correct plan card.
 */
export type PlannerKind = 'venue' | 'route'

// ── Venue ─────────────────────────────────────────────────────────────────────
// Used by venue planners only. Route planners never fabricate PlannerVenue objects.

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

// ── Route / Waypoint ──────────────────────────────────────────────────────────
// Used by route planners (running, hiking, cycling, walking).
// Venue planners never touch these types.

/**
 * A single point of interest along a planned route.
 * The route equivalent of PlannerVenue — populated by route planners only.
 * Route planners build their PlannerStop.waypoint from this type.
 */
export interface PlannerWaypoint {
  id: string
  /** Human-readable name, e.g. "Ditchling Beacon", "Start / Finish" */
  name: string
  lat: number
  lng: number
  waypointType: 'start' | 'checkpoint' | 'summit' | 'poi' | 'end'
  /** km along the planned route from the start to this waypoint */
  distanceFromStart: number
  /** Metres above sea level */
  elevationMetres?: number
  /** Brief description, e.g. "Highest point on the South Downs route" */
  description?: string
  /** OSM surface type: 'trail', 'tarmac', 'gravel', 'path', 'compacted', etc. */
  surfaceType?: string
  /** Descriptive tags: e.g. ['scenic', 'shelter', 'water-source', 'steep'] */
  tags?: string[]
  /** true when sourced from a real-world provider (OSM etc); false/undefined = mock */
  isRealData?: boolean
}

/**
 * A scoreable route option — the route equivalent of PlannerVenue.
 *
 * RouteProvider returns RouteCandidate[]; the planner scores and selects
 * the best match, then converts its waypoints into PlannerStop.waypoint entries.
 *
 * Not yet in use — this type defines the contract for the first route planner.
 */
/**
 * How the route is geometrically classified, derived from actual geometry.
 *
 * 'loop'         — start and finish are close, route has low retracing, forms a real circuit.
 * 'out_and_back' — start and finish are close but route substantially retraces itself.
 * 'linear'       — route does not return close to the start.
 *
 * Determined purely from geometry — never inferred from provider intent.
 */
export type RouteType = 'loop' | 'out_and_back' | 'linear'

export interface RouteCandidate {
  id: string
  /** Human-readable route name, e.g. "South Downs Loop", "River Path (5 km)" */
  name: string
  waypoints: PlannerWaypoint[]
  totalDistanceKm: number
  estimatedMinutes: number
  /** Total metres of ascent over the full route */
  elevationGainMetres?: number
  /** Total metres of descent over the full route */
  elevationLossMetres?: number
  /** Short surface summary, e.g. "Mostly trail with some tarmac" */
  surfaceSummary?: string
  /** Overall difficulty classification */
  grade?: 'easy' | 'moderate' | 'hard' | 'expert'
  /**
   * Geometry-derived route type.
   * Replaces the ambiguous boolean `isLoop`.
   * Set by the route provider after measuring retracing and loop quality.
   */
  routeType: RouteType
  /** @deprecated Use routeType === 'loop'. Kept for backward compat. */
  isLoop?: boolean
  /**
   * Fraction of grid cells visited more than once (0 = no retracing, 1 = full retrace).
   * Used for sorting and classification.
   */
  retraceRatio: number
  /** Shoelace loop quality score (0 = out-and-back, 1 = perfect circle). */
  loopQuality: number
  dataSource: 'real' | 'mock'
  providerName?: string
  /**
   * Full route polyline in GeoJSON [lng, lat] order.
   * Only populated by real route providers (OSRM etc.); undefined for mock routes.
   * Used by the live run tracker to display the planned route on the map.
   * May contain thousands of coordinate pairs for long routes.
   */
  geometry?: Array<[number, number]>

  // ── Preference-aware scoring fields (populated by the planner, not the provider) ──

  /**
   * Inferred surface composition based on OSM step name heuristics.
   * roadFraction: fraction of distance on road-like surfaces.
   * pathFraction: fraction on path/trail surfaces.
   */
  surfaceProfile?: { roadFraction: number; pathFraction: number }

  /**
   * Human-readable quality label assigned by the planner.
   * Examples: "Best Match", "Best Loop", "Most Paths", "Alternative"
   * Only labels that are actually supported by the data are used.
   */
  qualityLabel?: string

  /**
   * Composite preference-aware score (higher is better).
   * Computed by the planner from distanceFit + typeBonus + surfaceBonus - retracePenalty.
   */
  compositeScore?: number
}

// ── Scoring ───────────────────────────────────────────────────────────────────
// PlannerScoreBreakdown is venue-specific.
// Route planners will introduce a separate scoring breakdown when the first
// route planner is implemented (elevation, surface, distance vs target, etc.).

export interface PlannerScoreBreakdown {
  rating: number       // 0–20
  distance: number     // 0–20
  price: number        // 0–15
  atmosphere: number   // 0–17
  openingHours: number // 0–17
  capacity: number     // 0–11
}

export interface PlannerScore {
  total: number  // 0–100 (sum of breakdown)
  breakdown: PlannerScoreBreakdown
}

// ── Candidate (pre-selection) ─────────────────────────────────────────────────
// Used by venue planners. Route planners work directly with RouteCandidate[].

export interface PlannerCandidate {
  venue: PlannerVenue
  score: PlannerScore
  included: boolean
  exclusionReason?: string
}

// ── Stop ──────────────────────────────────────────────────────────────────────
//
// PlannerStop is polymorphic — exactly one of venue or waypoint will be set:
//
//   Venue planners  → venue is populated, waypoint is undefined
//   Route planners  → waypoint is populated, venue is undefined
//
// UI components guard against the absent field before rendering:
//   PubCrawlPlan / SingleVenuePlan check for stop.venue
//   RoutePlan (future) will check for stop.waypoint

export interface PlannerStop {
  order: number

  /**
   * Venue at this stop — set by venue planners (pub-crawl, restaurant, etc.).
   * Always defined for kind:'venue' plans; undefined for kind:'route' plans.
   */
  venue?: PlannerVenue

  /**
   * Waypoint at this stop — set by route planners (running, hiking, cycling).
   * Always defined for kind:'route' plans; undefined for kind:'venue' plans.
   */
  waypoint?: PlannerWaypoint

  /** "HH:MM" 24-hour arrival time at this stop */
  arrivalTime: string
  /** "HH:MM" 24-hour departure time from this stop */
  departureTime: string
  /** Walking / travel time FROM the previous stop (0 for the first stop) */
  walkingFromPrevious: number
  /** Walking / travel distance FROM the previous stop in km (0 for the first stop) */
  distanceFromPrevious: number
  score: PlannerScore

  /**
   * Arc role label.
   * Venue crawls: 'Opener' | 'Building' | 'Peak' | 'Mid-crawl' | 'Finale'
   * Route plans:  'Start' | 'Checkpoint' | 'Summit' | 'End'
   */
  role?: string

  /**
   * Short honest reason for including this stop.
   * Venue planners: atmosphere/feature or OSM-verifiable facts.
   * Route planners: elevation, surface type, scenic value.
   */
  reason?: string
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface PlannerResult {
  /**
   * Discriminant — tells the UI which rendering path to use.
   *
   * 'venue' → ActivityPlanCard renders PubCrawlPlan or SingleVenuePlan.
   * 'route' → ActivityPlanCard renders RoutePlan (to be built in the next task).
   *
   * All existing venue planners emit kind: 'venue'.
   */
  kind: PlannerKind

  title: string
  subtitle: string
  activityId: string
  durationMinutes: number

  /**
   * Human-readable cost label: "£" | "££" | "£££" | "££££".
   * Use '' (empty string) for free activities (running, hiking, etc.).
   */
  estimatedCostLabel: string

  totalDistanceKm: number
  /** Walking / travel minutes, distinct from durationMinutes for route plans */
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
  /** Human-readable provider label shown in the UI badge */
  providerName?: string
  /** Transparent reasons for the top venue pick — "Why did Nexus choose this?" */
  scoreReasons?: string[]

  // ── Route-specific optional fields (undefined for all venue plans) ─────────
  /** Total metres of ascent over the planned route */
  elevationGainMetres?: number
  /**
   * Elevation in metres at each waypoint, same length as stops.
   * Suitable for rendering an elevation profile chart.
   */
  elevationProfile?: number[]
  /** Short surface summary, e.g. "Mostly tarmac with trail sections" */
  surfaceSummary?: string
  /** Overall route difficulty classification */
  routeGrade?: 'easy' | 'moderate' | 'hard' | 'expert'
  /**
   * Geometry-derived route classification.
   * 'loop'         → genuine circuit (low retracing, loop-like shape)
   * 'out_and_back' → retraces substantially; route returns but repeats path
   * 'linear'       → start and finish are not close
   */
  routeType?: RouteType
  /** @deprecated Use routeType === 'loop'. Kept for backward compat. */
  isLoop?: boolean
  /**
   * Full route polyline in GeoJSON [lng, lat] order.
   * Populated only for kind:'route' plans from real providers (OSRM etc.).
   * Passed to the live run tracker so it can render the planned route on the map
   * without re-requesting a route. Undefined for mock/venue plans.
   */
  routeGeometry?: Array<[number, number]>

  /**
   * All route candidates considered by the planner, ordered best-first.
   * Populated only for kind:'route' plans.
   * Used by the multi-route UI (RunRoutePlanner) to show alternatives.
   * Each candidate carries its geometry, waypoints, qualityLabel, and compositeScore.
   */
  allCandidates?: RouteCandidate[]
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

  /**
   * Reference point for distance scoring, venue discovery, and route planning.
   * `radiusMetres` carries the intelligence-derived search radius so planners
   * can instantiate the right provider without needing the full PlanningLocation
   * type. Falls back to provider defaults when absent.
   */
  groupLocation?: { lat: number; lng: number; radiusMetres?: number }

  /**
   * Human-readable location name (city or neighbourhood) for use in plan
   * titles and summaries. e.g. "Brighton", "Soho, London".
   * Optional — planners degrade gracefully when absent.
   */
  locationName?: string

  preferredDurationMinutes?: number
  desiredStops?: number
  budgetPreference?: BudgetPreference
  walkingPreference?: WalkingPreference

  // ── Route hints — used by route planners; ignored by venue planners ────────

  /**
   * Target route distance in km, e.g. 5 for a short run, 20 for a cycling ride.
   * Route planners use this when scoring RouteCandidate options.
   */
  desiredDistanceKm?: number

  /**
   * Preferred route difficulty.
   * Route planners use this for candidate selection and filtering.
   */
  desiredGrade?: 'easy' | 'moderate' | 'hard' | 'expert'

  /**
   * When true, prefer circular routes that return to the start point.
   * Route planners pass this to the RouteProvider.
   */
  preferLoop?: boolean

  /**
   * Full route preferences — overrides desiredDistanceKm / preferLoop when present.
   * Used by route planners (jogging, hiking, cycling) only.
   * Ignored by venue planners.
   */
  routePreferences?: RoutePreferences
}

// ── Requirements check ────────────────────────────────────────────────────────

export interface PlannerRequirements {
  canPlan: boolean
  missingRequirements: string[]
}

// ── Provider interfaces ───────────────────────────────────────────────────────

/**
 * Venue provider interface — used by venue planners (pub-crawl, restaurant, etc.).
 * Swap MockVenueProvider for a real Places API by implementing this interface
 * and passing it to the planner — no planner logic changes needed.
 */
export interface VenueProvider {
  getVenues(
    activityId: string,
    location?: { lat: number; lng: number },
  ): Promise<PlannerVenue[]>
}

/**
 * Route provider interface — used by route planners (running, hiking, cycling).
 * Parallel to VenueProvider. Implementations will query OSM / route APIs.
 * A mock implementation will supply deterministic demo routes for dev/fallback.
 *
 * Not yet implemented — this interface defines the contract for the next task
 * (first route planner). No network requests are made by this interface alone.
 */
export interface RouteProvider {
  getRoutes(
    activityId: string,
    location: { lat: number; lng: number },
    options?: {
      radiusMetres?: number
      maxRoutes?: number
      desiredDistanceKm?: number
      preferLoop?: boolean
    },
  ): Promise<RouteCandidate[]>
}

// ── Planner definition ────────────────────────────────────────────────────────

export interface PlannerDefinition {
  /** Unique planner id, e.g. "pub-crawl-planner" */
  id: string
  /** The activity id this planner handles, e.g. "pub-crawl" */
  activityId: string

  /**
   * Discriminant — matches the PlannerResult.kind produced by this planner.
   *
   * All existing venue planners declare 'venue'.
   * Future route planners (running, hiking, cycling) will declare 'route'.
   *
   * The registry exposes this so the UI can determine the rendering path
   * even before a plan has been generated (e.g. for CTA copy adaptation).
   */
  kind: PlannerKind

  name: string
  description: string
  plan(request: PlannerRequest): Promise<PlannerResult>
}
