import {
  PersonStanding,
  Mountain,
  Bike,
  Waves,
  Sun,
  Beer,
  Gamepad2,
  Coffee,
  UtensilsCrossed,
  Film,
  Target,
  Music,
  Utensils,
  Wine,
  Dumbbell,
  Flame,
  TreePine,
} from 'lucide-react'

import { COLOR_PALETTES } from './types'
import type { ActivityCategory, ActivityDefinition, ActivityId } from './types'

// ─── Registry ─────────────────────────────────────────────────────────────────
// To add a new activity: append one object to this array.
// No other code needs to change.

export const ACTIVITY_REGISTRY: readonly ActivityDefinition[] = Object.freeze([
  // ── Outdoor & Active ────────────────────────────────────────────────────────
  {
    id: 'jogging',
    label: 'Jogging',
    emoji: '🏃',
    Icon: PersonStanding,
    color: COLOR_PALETTES.emerald,
    category: 'outdoor_active',
    tags: ['run', 'running', 'jog', 'sprint', 'exercise', 'fitness', 'cardio'],
    plannerCapabilities: ['routes', 'weather'],
  },
  {
    id: 'walking',
    label: 'Walking',
    emoji: '🚶',
    Icon: PersonStanding,
    color: COLOR_PALETTES.teal,
    category: 'outdoor_active',
    tags: ['walk', 'stroll', 'hike', 'ramble', 'explore', 'outdoor', 'leisurely'],
    plannerCapabilities: ['routes', 'weather'],
  },
  {
    id: 'hiking',
    label: 'Hiking',
    emoji: '🥾',
    Icon: Mountain,
    color: COLOR_PALETTES.green,
    category: 'outdoor_active',
    tags: ['hike', 'trail', 'walk', 'trek', 'hills', 'nature', 'outdoor'],
    plannerCapabilities: ['routes', 'weather'],
  },
  {
    id: 'cycling',
    label: 'Cycling',
    emoji: '🚴',
    Icon: Bike,
    color: COLOR_PALETTES.lime,
    category: 'outdoor_active',
    tags: ['bike', 'bicycle', 'cycle', 'ride', 'mtb', 'road bike'],
    plannerCapabilities: ['routes', 'weather', 'travel'],
  },
  {
    id: 'swimming',
    label: 'Swimming',
    emoji: '🏊',
    Icon: Waves,
    color: COLOR_PALETTES.sky,
    category: 'outdoor_active',
    tags: ['swim', 'pool', 'lido', 'lake', 'sea', 'open water', 'aqua'],
    plannerCapabilities: ['venues', 'weather'],
  },
  {
    id: 'gym',
    label: 'Gym',
    emoji: '💪',
    Icon: Dumbbell,
    color: COLOR_PALETTES.orange,
    category: 'outdoor_active',
    tags: ['gym', 'weights', 'fitness', 'workout', 'lift', 'crossfit', 'training'],
    plannerCapabilities: ['venues', 'costs'],
  },
  // ── Outdoor Social ───────────────────────────────────────────────────────────
  {
    id: 'beach',
    label: 'Beach',
    emoji: '🏖️',
    Icon: Sun,
    color: COLOR_PALETTES.amber,
    category: 'outdoor_social',
    tags: ['beach', 'sea', 'coast', 'sand', 'sun', 'sunbathing', 'seaside'],
    plannerCapabilities: ['routes', 'weather', 'travel'],
  },
  {
    id: 'picnic',
    label: 'Picnic',
    emoji: '🧺',
    Icon: TreePine,
    color: COLOR_PALETTES.teal,
    category: 'outdoor_social',
    tags: ['picnic', 'park', 'garden', 'grass', 'outdoor eating', 'blanket'],
    plannerCapabilities: ['venues', 'weather'],
  },
  // ── Social ───────────────────────────────────────────────────────────────────
  {
    id: 'pub-crawl',
    label: 'Pub Crawl',
    emoji: '🍺',
    Icon: Beer,
    color: COLOR_PALETTES.orange,
    category: 'indoor_social',
    tags: ['pub', 'bar', 'drinks', 'beer', 'crawl', 'nightout', 'pints'],
    plannerCapabilities: ['venues', 'routes', 'costs'],
  },
  {
    id: 'cocktail-bar',
    label: 'Cocktail Bar',
    emoji: '🍹',
    Icon: Wine,
    color: COLOR_PALETTES.rose,
    category: 'indoor_social',
    tags: ['cocktail', 'bar', 'drinks', 'wine', 'spirits', 'nightout', 'mixology'],
    plannerCapabilities: ['venues', 'costs'],
  },
  {
    id: 'board-games',
    label: 'Board Games',
    emoji: '🎲',
    Icon: Gamepad2,
    color: COLOR_PALETTES.violet,
    category: 'indoor_social',
    tags: ['board games', 'games', 'game night', 'tabletop', 'cards', 'trivia'],
    plannerCapabilities: ['venues', 'costs'],
  },
  // ── Dining ───────────────────────────────────────────────────────────────────
  {
    id: 'restaurant',
    label: 'Restaurant',
    emoji: '🍽️',
    Icon: UtensilsCrossed,
    color: COLOR_PALETTES.red,
    category: 'dining',
    tags: ['restaurant', 'dinner', 'lunch', 'food', 'eat', 'meal', 'cuisine'],
    plannerCapabilities: ['venues', 'costs'],
  },
  {
    id: 'brunch',
    label: 'Brunch',
    emoji: '🥞',
    Icon: Utensils,
    color: COLOR_PALETTES.yellow,
    category: 'dining',
    tags: ['brunch', 'breakfast', 'morning', 'eggs', 'avocado', 'weekend'],
    plannerCapabilities: ['venues', 'costs'],
  },
  // ── Coffee ───────────────────────────────────────────────────────────────────
  {
    id: 'coffee',
    label: 'Coffee',
    emoji: '☕',
    Icon: Coffee,
    color: COLOR_PALETTES.amber,
    category: 'cafe_coffee',
    tags: ['coffee', 'cafe', 'tea', 'latte', 'espresso', 'catch-up', 'chat'],
    plannerCapabilities: ['venues', 'costs'],
  },
  // ── Entertainment ────────────────────────────────────────────────────────────
  {
    id: 'cinema',
    label: 'Cinema',
    emoji: '🎬',
    Icon: Film,
    color: COLOR_PALETTES.indigo,
    category: 'entertainment',
    tags: ['cinema', 'film', 'movie', 'theater', 'imax', 'screening'],
    plannerCapabilities: ['venues', 'costs', 'travel'],
  },
  {
    id: 'bowling',
    label: 'Bowling',
    emoji: '🎳',
    Icon: Target,
    color: COLOR_PALETTES.pink,
    category: 'entertainment',
    tags: ['bowling', 'lanes', 'strikes', 'ten-pin', 'leisure'],
    plannerCapabilities: ['venues', 'costs'],
  },
  {
    id: 'live-music',
    label: 'Live Music',
    emoji: '🎵',
    Icon: Music,
    color: COLOR_PALETTES.purple,
    category: 'entertainment',
    tags: ['music', 'gig', 'concert', 'live', 'band', 'festival', 'venue'],
    plannerCapabilities: ['venues', 'costs', 'travel'],
  },
  // ── Culture ──────────────────────────────────────────────────────────────────
  {
    id: 'escape-room',
    label: 'Escape Room',
    emoji: '🔐',
    Icon: Flame,
    color: COLOR_PALETTES.orange,
    category: 'culture',
    tags: ['escape room', 'puzzle', 'teamwork', 'mystery', 'fun'],
    plannerCapabilities: ['venues', 'costs'],
  },
]) as ActivityDefinition[]

// ─── Helper functions ─────────────────────────────────────────────────────────
// All helpers are pure functions over the frozen array.
// Adding a registry entry automatically extends every helper.

/** Look up an activity by its ID. */
export function getActivityById(id: ActivityId): ActivityDefinition | undefined {
  return ACTIVITY_REGISTRY.find((a) => a.id === id)
}

/** Return all activities in a specific category. */
export function getByCategory(category: ActivityCategory): ActivityDefinition[] {
  return ACTIVITY_REGISTRY.filter((a) => a.category === category)
}

/**
 * Search activities by label and tags.
 * Returns results sorted by relevance (label match before tag match).
 */
export function searchActivities(query: string): ActivityDefinition[] {
  const q = query.toLowerCase().trim()
  if (!q) return [...ACTIVITY_REGISTRY]

  const labelMatches: ActivityDefinition[] = []
  const tagMatches: ActivityDefinition[] = []

  for (const activity of ACTIVITY_REGISTRY) {
    if (activity.label.toLowerCase().includes(q)) {
      labelMatches.push(activity)
    } else if (activity.tags.some((t) => t.includes(q))) {
      tagMatches.push(activity)
    }
  }

  return [...labelMatches, ...tagMatches]
}

/** Return the activities whose IDs appear in the given list, preserving order. */
export function getActivitiesById(ids: ActivityId[]): ActivityDefinition[] {
  return ids
    .map((id) => getActivityById(id))
    .filter((a): a is ActivityDefinition => a !== undefined)
}
