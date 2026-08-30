// ─────────────────────────────────────────────────────────────────────────────
// Venue Provider — interface re-export + OSM tag registry
// ─────────────────────────────────────────────────────────────────────────────

export type { VenueProvider } from '../types'

export interface OsmTagSet {
  key: string
  value: string
}

// ── OSM amenity/leisure tags that map to each activity ───────────────────────
// Used by OpenStreetMapVenueProvider to build Overpass queries.
// Keep this registry activity-driven: unknown activities must never silently
// become pubs.

export const ACTIVITY_OSM_TAGS: Record<string, OsmTagSet[]> = {
  'pub-crawl':    [{ key: 'amenity', value: 'pub' }, { key: 'amenity', value: 'bar' }],
  'cocktail-bar': [{ key: 'amenity', value: 'bar' }],
  'restaurant':   [{ key: 'amenity', value: 'restaurant' }],
  'brunch':       [{ key: 'amenity', value: 'cafe' }, { key: 'amenity', value: 'restaurant' }],
  'coffee':       [{ key: 'amenity', value: 'cafe' }],
  'bowling':      [{ key: 'leisure', value: 'bowling_alley' }],
  'cinema':       [{ key: 'amenity', value: 'cinema' }],
  'live-music':   [{ key: 'amenity', value: 'nightclub' }, { key: 'amenity', value: 'music_venue' }],
  // Board-game venues are often cafes or dedicated gaming spaces. Never use
  // pub as a fallback: a pub can host games, but it is not a board-game venue.
  'board-games':  [{ key: 'amenity', value: 'cafe' }, { key: 'leisure', value: 'amusement_arcade' }],
  'escape-room':  [{ key: 'leisure', value: 'escape_game' }],
  'gym':          [{ key: 'leisure', value: 'fitness_centre' }, { key: 'leisure', value: 'sports_centre' }],
  'swimming':     [{ key: 'leisure', value: 'swimming_pool' }, { key: 'sport', value: 'swimming' }],
  'picnic':       [{ key: 'leisure', value: 'park' }, { key: 'leisure', value: 'garden' }, { key: 'leisure', value: 'picnic_table' }],
  'beach':        [{ key: 'natural', value: 'beach' }],
}

/** Returns only explicitly registered tags. Never substitute an unrelated activity. */
export function getOsmTagsForActivity(activityId: string): OsmTagSet[] {
  return ACTIVITY_OSM_TAGS[activityId] ?? []
}
