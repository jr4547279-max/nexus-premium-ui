// ─────────────────────────────────────────────────────────────────────────────
// Venue Provider — interface re-export + OSM tag registry
// ─────────────────────────────────────────────────────────────────────────────

export type { VenueProvider } from '../types'

export interface OsmTagSet {
  key: string
  value: string
}

// Activity-driven OSM mappings. Unknown activities intentionally return no tags
// so an unsupported request can never silently become a pub search.
export const ACTIVITY_OSM_TAGS: Record<string, OsmTagSet[]> = {
  'pub-crawl':    [{ key: 'amenity', value: 'pub' }, { key: 'amenity', value: 'bar' }],
  'cocktail-bar': [{ key: 'amenity', value: 'bar' }],
  'restaurant':   [{ key: 'amenity', value: 'restaurant' }],
  'brunch':       [{ key: 'amenity', value: 'cafe' }, { key: 'amenity', value: 'restaurant' }],
  'coffee':       [{ key: 'amenity', value: 'cafe' }],
  'vegan-coffee': [{ key: 'amenity', value: 'cafe' }],
  'bowling':      [{ key: 'leisure', value: 'bowling_alley' }],
  'cinema':       [{ key: 'amenity', value: 'cinema' }],
  'live-music':   [{ key: 'amenity', value: 'music_venue' }, { key: 'amenity', value: 'nightclub' }],
  'board-games':  [{ key: 'amenity', value: 'cafe' }, { key: 'leisure', value: 'amusement_arcade' }],
  'escape-room':  [{ key: 'leisure', value: 'escape_game' }],
  'gym':          [{ key: 'leisure', value: 'fitness_centre' }, { key: 'leisure', value: 'sports_centre' }],
  'swimming':     [{ key: 'leisure', value: 'swimming_pool' }, { key: 'sport', value: 'swimming' }],
  'picnic':       [{ key: 'leisure', value: 'park' }, { key: 'leisure', value: 'garden' }, { key: 'leisure', value: 'picnic_table' }],
  'beach':        [{ key: 'natural', value: 'beach' }],
  'museum':       [{ key: 'tourism', value: 'museum' }],
  'gallery':      [{ key: 'tourism', value: 'gallery' }],
  'park':         [{ key: 'leisure', value: 'park' }],
  'shopping':     [{ key: 'shop', value: 'mall' }],
  'mini-golf':    [{ key: 'leisure', value: 'miniature_golf' }],
}

/** Returns only explicitly registered tags. Never substitute an unrelated activity. */
export function getOsmTagsForActivity(activityId: string): OsmTagSet[] {
  return ACTIVITY_OSM_TAGS[activityId] ?? []
}
