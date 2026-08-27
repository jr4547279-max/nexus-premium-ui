// ─────────────────────────────────────────────────────────────────────────────
// Planner Registry
// ─────────────────────────────────────────────────────────────────────────────
// Maps activity IDs to their planner implementations.
// To add a new activity: import the planner and append one entry below.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlannerDefinition } from './types'
import { googlePubCrawlPlanner } from './google-pub-crawl-planner'
import { createSingleVenuePlanner } from './single-venue-planner'
import { joggingPlanner } from './jogging-planner'
import { walkingPlanner } from './walking-planner'
import { hikingPlanner } from './hiking-planner'
import { cyclingPlanner } from './cycling-planner'

// ── Registry ──────────────────────────────────────────────────────────────────

const PLANNER_REGISTRY: Record<string, PlannerDefinition> = {
  // Multi-stop pub crawl — Google Places first, real OSM fallback.
  'pub-crawl': googlePubCrawlPlanner,

  // Route planners — OSRM routing, real routes, no API key.
  'jogging': joggingPlanner,
  'walking': walkingPlanner,
  'hiking': hikingPlanner,
  'cycling': cyclingPlanner,

  // Venue/location planners — real OpenStreetMap results only.
  'swimming':     createSingleVenuePlanner({ activityId: 'swimming',     activityEmoji: '🏊', activityLabel: 'Swimming' }),
  'gym':          createSingleVenuePlanner({ activityId: 'gym',          activityEmoji: '💪', activityLabel: 'Gym' }),
  'beach':        createSingleVenuePlanner({ activityId: 'beach',        activityEmoji: '🏖️', activityLabel: 'Beach' }),
  'picnic':       createSingleVenuePlanner({ activityId: 'picnic',       activityEmoji: '🧺', activityLabel: 'Picnic' }),
  'cocktail-bar': createSingleVenuePlanner({ activityId: 'cocktail-bar', activityEmoji: '🍹', activityLabel: 'Cocktail Bar' }),
  'restaurant':   createSingleVenuePlanner({ activityId: 'restaurant',   activityEmoji: '🍽️', activityLabel: 'Restaurant' }),
  'brunch':       createSingleVenuePlanner({ activityId: 'brunch',       activityEmoji: '🥞', activityLabel: 'Brunch' }),
  'coffee':       createSingleVenuePlanner({ activityId: 'coffee',       activityEmoji: '☕', activityLabel: 'Coffee' }),
  'cinema':       createSingleVenuePlanner({ activityId: 'cinema',       activityEmoji: '🎬', activityLabel: 'Cinema' }),
  'bowling':      createSingleVenuePlanner({ activityId: 'bowling',      activityEmoji: '🎳', activityLabel: 'Bowling' }),
  'live-music':   createSingleVenuePlanner({ activityId: 'live-music',   activityEmoji: '🎵', activityLabel: 'Live Music' }),
  'board-games':  createSingleVenuePlanner({ activityId: 'board-games',  activityEmoji: '🎲', activityLabel: 'Board Games' }),
  'escape-room':  createSingleVenuePlanner({ activityId: 'escape-room',  activityEmoji: '🔐', activityLabel: 'Escape Room' }),
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function hasPlannerFor(activityId: string | null | undefined): boolean {
  if (!activityId) return false
  return activityId in PLANNER_REGISTRY
}

export function getPlannerFor(
  activityId: string | null | undefined,
): PlannerDefinition | null {
  if (!activityId) return null
  return PLANNER_REGISTRY[activityId] ?? null
}

export function registeredPlannerIds(): string[] {
  return Object.keys(PLANNER_REGISTRY)
}
