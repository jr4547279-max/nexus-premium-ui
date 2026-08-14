// ─────────────────────────────────────────────────────────────────────────────
// Planner Registry
// ─────────────────────────────────────────────────────────────────────────────
// Maps activity IDs to their planner implementations.
// To add a new activity: import the planner and append one entry below.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlannerDefinition } from './types'
import { pubCrawlPlanner } from './pub-crawl-planner'
import { createSingleVenuePlanner } from './single-venue-planner'
import { joggingPlanner } from './jogging-planner'
import { walkingPlanner } from './walking-planner'
import { hikingPlanner } from './hiking-planner'
import { cyclingPlanner } from './cycling-planner'

// ── Registry ──────────────────────────────────────────────────────────────────

const PLANNER_REGISTRY: Record<string, PlannerDefinition> = {
  // Multi-stop pub crawl — dedicated planner with route optimisation
  'pub-crawl': pubCrawlPlanner,

  // Route planners — OSRM routing, real routes, no API key
  'jogging': joggingPlanner,
  'walking': walkingPlanner,
  'hiking':  hikingPlanner,   // foot profile, 12–15 km default, trail surfaces
  'cycling': cyclingPlanner,  // bike profile, 20 km default, loop preferred

  // Single-venue planners — uses OSM for real venues, mock as fallback
  'cocktail-bar':  createSingleVenuePlanner({ activityId: 'cocktail-bar',  activityEmoji: '🍹', activityLabel: 'Cocktail Bar' }),
  'restaurant':    createSingleVenuePlanner({ activityId: 'restaurant',    activityEmoji: '🍽️', activityLabel: 'Restaurant' }),
  'brunch':        createSingleVenuePlanner({ activityId: 'brunch',        activityEmoji: '🥞', activityLabel: 'Brunch' }),
  'coffee':        createSingleVenuePlanner({ activityId: 'coffee',        activityEmoji: '☕', activityLabel: 'Coffee' }),
  'cinema':        createSingleVenuePlanner({ activityId: 'cinema',        activityEmoji: '🎬', activityLabel: 'Cinema' }),
  'bowling':       createSingleVenuePlanner({ activityId: 'bowling',       activityEmoji: '🎳', activityLabel: 'Bowling' }),
  'live-music':    createSingleVenuePlanner({ activityId: 'live-music',    activityEmoji: '🎵', activityLabel: 'Live Music' }),
  'board-games':   createSingleVenuePlanner({ activityId: 'board-games',   activityEmoji: '🎲', activityLabel: 'Board Games' }),
  'escape-room':   createSingleVenuePlanner({ activityId: 'escape-room',   activityEmoji: '🔐', activityLabel: 'Escape Room' }),
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if a planner exists for the given activity. */
export function hasPlannerFor(activityId: string | null | undefined): boolean {
  if (!activityId) return false
  return activityId in PLANNER_REGISTRY
}

/** Returns the planner definition for an activity, or null if none exists. */
export function getPlannerFor(
  activityId: string | null | undefined,
): PlannerDefinition | null {
  if (!activityId) return null
  return PLANNER_REGISTRY[activityId] ?? null
}

/** Returns all registered planner activity IDs. */
export function registeredPlannerIds(): string[] {
  return Object.keys(PLANNER_REGISTRY)
}
