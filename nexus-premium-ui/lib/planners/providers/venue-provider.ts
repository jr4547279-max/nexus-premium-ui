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

export const ACTIVITY_OSM_TAGS: Record<string, OsmTagSet[]> = {
  'pub-crawl':    [{ key: 'amenity', value: 'pub' }, { key: 'amenity', value: 'bar' }],
  'cocktail-bar': [{ key: 'amenity', value: 'bar' }, { key: 'amenity', value: 'pub' }],
  'restaurant':   [{ key: 'amenity', value: 'restaurant' }],
  'brunch':       [{ key: 'amenity', value: 'cafe' }, { key: 'amenity', value: 'restaurant' }],
  'coffee':       [{ key: 'amenity', value: 'cafe' }],
  'bowling':      [{ key: 'leisure', value: 'bowling_alley' }],
  'cinema':       [{ key: 'amenity', value: 'cinema' }],
  'live-music':   [{ key: 'amenity', value: 'nightclub' }, { key: 'amenity', value: 'music_venue' }],
  'board-games':  [{ key: 'amenity', value: 'pub' }, { key: 'leisure', value: 'amusement_arcade' }],
  'escape-room':  [{ key: 'leisure', value: 'escape_game' }],
  'gym':          [{ key: 'leisure', value: 'fitness_centre' }, { key: 'leisure', value: 'sports_centre' }],
  'swimming':     [{ key: 'leisure', value: 'swimming_pool' }, { key: 'leisure', value: 'water_park' }, { key: 'sport', value: 'swimming' }],
  'beach':        [{ key: 'natural', value: 'beach' }],
  'picnic':       [{ key: 'tourism', value: 'picnic_site' }, { key: 'leisure', value: 'park' }, { key: 'leisure', value: 'garden' }],
}

/** Returns the OSM tag sets for a given activity, or a pub fallback. */
export function getOsmTagsForActivity(activityId: string): OsmTagSet[] {
  return ACTIVITY_OSM_TAGS[activityId] ?? [{ key: 'amenity', value: 'pub' }]
}
