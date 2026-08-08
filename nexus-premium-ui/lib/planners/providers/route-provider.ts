// ─────────────────────────────────────────────────────────────────────────────
// Route Provider — interface re-export + activity route configuration
// ─────────────────────────────────────────────────────────────────────────────
// Parallel to venue-provider.ts. Defines the RouteProvider contract and the
// OSM highway / search configuration for each route-based activity.
//
// STATUS: Architecture layer only — no network requests are made here.
//   - RouteProvider interface defines the contract for the next task.
//   - ACTIVITY_ROUTE_CONFIG defines search parameters for future providers.
//   - Actual OSM route fetching (Overpass / OSRM / etc.) belongs in a
//     separate implementation file (e.g. overpass-route-provider.ts),
//     which will be created when the first route planner is built.
// ─────────────────────────────────────────────────────────────────────────────

export type { RouteProvider, RouteCandidate, PlannerWaypoint } from '../types'

// ── Route query configuration ─────────────────────────────────────────────────
// Describes which OSM highway types and surface preferences apply to each
// route-based activity, plus sensible default distances and search radii.
// Used by future RouteProvider implementations — not a network call.

export interface ActivityRouteConfig {
  /**
   * OSM `highway` tag values to include when querying route networks.
   * Listed in preference order (most specific first).
   */
  highways: string[]

  /**
   * OSM `surface` tag values that are preferred for this activity.
   * Providers may weight candidates with matching surfaces higher.
   */
  preferSurface?: string[]

  /**
   * Default search radius from the planning location in metres.
   * Used when PlannerRequest.groupLocation.radiusMetres is unavailable.
   */
  defaultSearchRadiusMetres: number

  /**
   * Sensible default route distance in km for this activity.
   * Used when PlannerRequest.desiredDistanceKm is not set.
   */
  defaultDistanceKm: number

  /**
   * Whether this activity typically prefers loop (circular) routes.
   * Overridden by PlannerRequest.preferLoop when explicitly set.
   */
  defaultPreferLoop: boolean
}

/**
 * OSM highway types and search defaults for each route-based activity.
 *
 * These are used by RouteProvider implementations to build data queries.
 * They describe intent — no network requests are issued from this file.
 */
export const ACTIVITY_ROUTE_CONFIG: Record<string, ActivityRouteConfig> = {
  jogging: {
    highways: ['footway', 'path', 'pedestrian', 'cycleway', 'residential'],
    preferSurface: ['tarmac', 'asphalt', 'paved'],
    defaultSearchRadiusMetres: 3_000,
    defaultDistanceKm: 5,
    defaultPreferLoop: true,
  },
  hiking: {
    highways: ['footway', 'path', 'track', 'steps', 'bridleway'],
    preferSurface: ['trail', 'ground', 'grass', 'compacted'],
    defaultSearchRadiusMetres: 15_000,
    defaultDistanceKm: 12,
    defaultPreferLoop: false,
  },
  cycling: {
    highways: ['cycleway', 'path', 'track', 'residential', 'service'],
    preferSurface: ['tarmac', 'asphalt', 'paved', 'compacted'],
    defaultSearchRadiusMetres: 25_000,
    defaultDistanceKm: 20,
    defaultPreferLoop: true,
  },
  walking: {
    highways: ['footway', 'path', 'pedestrian', 'steps', 'bridleway'],
    preferSurface: ['tarmac', 'asphalt', 'paved', 'trail'],
    defaultSearchRadiusMetres: 8_000,
    defaultDistanceKm: 6,
    defaultPreferLoop: false,
  },
  beach: {
    highways: ['footway', 'path', 'pedestrian'],
    preferSurface: ['sand', 'pebbles', 'ground'],
    defaultSearchRadiusMetres: 20_000,
    defaultDistanceKm: 4,
    defaultPreferLoop: false,
  },
}

/**
 * Returns the route configuration for a given activity, or undefined when the
 * activity is not route-based (venue planners should never call this).
 */
export function getRouteConfigForActivity(
  activityId: string,
): ActivityRouteConfig | undefined {
  return ACTIVITY_ROUTE_CONFIG[activityId]
}
