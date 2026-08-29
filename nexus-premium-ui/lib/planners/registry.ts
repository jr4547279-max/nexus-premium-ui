// ─────────────────────────────────────────────────────────────────────────────
// Planner Registry
// ─────────────────────────────────────────────────────────────────────────────
// Every activity in ACTIVITY_REGISTRY must have a planner so Golden Window can
// continue all the way through to a real-world recommendation.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlannerDefinition } from './types'
import { googlePubCrawlPlanner } from './google-pub-crawl-planner'
import { createSingleVenuePlanner } from './single-venue-planner'
import { joggingPlanner } from './jogging-planner'
import { walkingPlanner } from './walking-planner'
import { hikingPlanner } from './hiking-planner'
import { cyclingPlanner } from './cycling-planner'

const PLANNER_REGISTRY: Record<string, PlannerDefinition> = {
  // Multi-stop pub crawl — Google Places first, real OSM fallback.
  'pub-crawl': googlePubCrawlPlanner,

  // Route planners — OSRM routing, real routes, no API key.
  'jogging': joggingPlanner,
  'walking': walkingPlanner,
  'hiking': hikingPlanner,
  'cycling': cyclingPlanner,

  // Single-venue planners — all use the activity-specific OSM tag registry.
  'swimming':     createSingleVenuePlanner({ activityId: 'swimming',     activityEmoji: '🏊', activityLabel: 'Swimming' }),
  'gym':          createSingleVenuePlanner({ activityId: 'gym',          activityEmoji: '💪', activityLabel: 'Gym' }),
  'beach':        createSingleVenuePlanner({ activityId: 'beach',        activityEmoji: '🏖️', activityLabel: 'Beach' }),
  'picnic':       createSingleVenuePlanner({ activityId: 'picnic',       activityEmoji: '🧺', activityLabel: 'Picnic' }),
  'cocktail-bar': createSingleVenuePlanner({ activityId: 'cocktail-bar', activityEmoji: '🍹', activityLabel: 'Cocktail Bar' }),
  'restaurant':   createSingleVenuePlanner({ activityId: 'restaurant',   activityEmoji: '🍽️', activityLabel: 'Restaurant' }),
  'brunch':       createSingleVenuePlanner({ activityId: 'brunch',       activityEmoji: '🥞', activityLabel: 'Brunch' }),
  'coffee':       createSingleVenuePlanner({ activityId: 'coffee',        activityEmoji: '☕', activityLabel: 'Coffee' }),
  'cinema':       createSingleVenuePlanner({ activityId: 'cinema',        activityEmoji: '🎬', activityLabel: 'Cinema' }),
  'bowling':      createSingleVenuePlanner({ activityId: 'bowling',       activityEmoji: '🎳', activityLabel: 'Bowling' }),
  'live-music':   createSingleVenuePlanner({ activityId: 'live-music',    activityEmoji: '🎵', activityLabel: 'Live Music' }),
  'board-games':  createSingleVenuePlanner({ activityId: 'board-games',   activityEmoji: '🎲', activityLabel: 'Board Games' }),
  'escape-room':  createSingleVenuePlanner({ activityId: 'escape-room',   activityEmoji: '🔐', activityLabel: 'Escape Room' }),
}

export function hasPlannerFor(activityId: string | null | undefined): boolean {
  if (!activityId) return false
  return activityId in PLANNER_REGISTRY
}

export function getPlannerFor(activityId: string | null | undefined): PlannerDefinition | null {
  if (!activityId) return null
  return PLANNER_REGISTRY[activityId] ?? null
}

export function registeredPlannerIds(): string[] {
  return Object.keys(PLANNER_REGISTRY)
}
