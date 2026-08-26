import type { PlannerDefinition } from './types'
import { pubCrawlPlannerV2 } from './pub-crawl-planner-v2'
import { createUniversalVenuePlanner } from './universal-venue-planner'
import { joggingPlanner } from './jogging-planner'
import { walkingPlanner } from './walking-planner'
import { hikingPlanner } from './hiking-planner'
import { cyclingPlanner } from './cycling-planner'

const PLANNER_REGISTRY: Record<string, PlannerDefinition> = {
  'pub-crawl': pubCrawlPlannerV2,

  // Real route planners — OSRM, no API key required.
  'jogging': joggingPlanner,
  'walking': walkingPlanner,
  'hiking': hikingPlanner,
  'cycling': cyclingPlanner,

  // Universal real-location planners. No demo/mock fallback in real groups.
  'swimming': createUniversalVenuePlanner({ activityId: 'swimming', activityLabel: 'Swimming', emoji: '🏊' }),
  'gym': createUniversalVenuePlanner({ activityId: 'gym', activityLabel: 'Gym', emoji: '💪' }),
  'beach': createUniversalVenuePlanner({ activityId: 'beach', activityLabel: 'Beach', emoji: '🏖️' }),
  'picnic': createUniversalVenuePlanner({ activityId: 'picnic', activityLabel: 'Picnic', emoji: '🧺' }),
  'cocktail-bar': createUniversalVenuePlanner({ activityId: 'cocktail-bar', activityLabel: 'Cocktail Bar', emoji: '🍹' }),
  'restaurant': createUniversalVenuePlanner({ activityId: 'restaurant', activityLabel: 'Restaurant', emoji: '🍽️' }),
  'brunch': createUniversalVenuePlanner({ activityId: 'brunch', activityLabel: 'Brunch', emoji: '🥞' }),
  'coffee': createUniversalVenuePlanner({ activityId: 'coffee', activityLabel: 'Coffee', emoji: '☕' }),
  'cinema': createUniversalVenuePlanner({ activityId: 'cinema', activityLabel: 'Cinema', emoji: '🎬' }),
  'bowling': createUniversalVenuePlanner({ activityId: 'bowling', activityLabel: 'Bowling', emoji: '🎳' }),
  'live-music': createUniversalVenuePlanner({ activityId: 'live-music', activityLabel: 'Live Music', emoji: '🎵' }),
  'board-games': createUniversalVenuePlanner({ activityId: 'board-games', activityLabel: 'Board Games', emoji: '🎲' }),
  'escape-room': createUniversalVenuePlanner({ activityId: 'escape-room', activityLabel: 'Escape Room', emoji: '🔐' }),
}

export function hasPlannerFor(activityId: string | null | undefined): boolean {
  return !!activityId && activityId in PLANNER_REGISTRY
}

export function getPlannerFor(activityId: string | null | undefined): PlannerDefinition | null {
  return activityId ? PLANNER_REGISTRY[activityId] ?? null : null
}

export function registeredPlannerIds(): string[] {
  return Object.keys(PLANNER_REGISTRY)
}
