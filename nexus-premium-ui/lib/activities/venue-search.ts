export interface ActivityVenueSearch {
  query: string
  googleType?: string
  osmTags: Array<{ key: string; value: string }>
  /** Optional post-filter for provider results that need semantic narrowing. */
  requiredTags?: string[]
}

const tags = (pairs: Array<[string, string]>) => pairs.map(([key, value]) => ({ key, value }))

/**
 * Single source of truth for activity -> real-world venue discovery.
 * Unknown activities intentionally return undefined; callers must not invent
 * an unrelated fallback category.
 */
export const ACTIVITY_VENUE_SEARCH: Record<string, ActivityVenueSearch> = {
  cinema: { query: 'cinemas', googleType: 'movie_theater', osmTags: tags([['amenity', 'cinema']]) },
  restaurant: { query: 'restaurants', googleType: 'restaurant', osmTags: tags([['amenity', 'restaurant']]) },
  brunch: { query: 'brunch restaurants', osmTags: tags([['amenity', 'restaurant'], ['amenity', 'cafe']]) },
  'vegan-coffee': { query: 'vegan coffee shops', googleType: 'cafe', osmTags: tags([['amenity', 'cafe']]), requiredTags: ['vegan'] },
  coffee: { query: 'cafes and coffee shops', googleType: 'cafe', osmTags: tags([['amenity', 'cafe']]) },
  'pub-crawl': { query: 'pubs', googleType: 'pub', osmTags: tags([['amenity', 'pub'], ['amenity', 'bar']]) },
  'cocktail-bar': { query: 'cocktail bars', googleType: 'bar', osmTags: tags([['amenity', 'bar']]) },
  bowling: { query: 'bowling alleys', googleType: 'bowling_alley', osmTags: tags([['leisure', 'bowling_alley']]) },
  gym: { query: 'gyms and fitness centres', googleType: 'gym', osmTags: tags([['leisure', 'fitness_centre'], ['leisure', 'sports_centre']]) },
  swimming: { query: 'swimming pools', googleType: 'swimming_pool', osmTags: tags([['leisure', 'swimming_pool'], ['sport', 'swimming']]) },
  museum: { query: 'museums', googleType: 'museum', osmTags: tags([['tourism', 'museum']]) },
  gallery: { query: 'art galleries', googleType: 'art_gallery', osmTags: tags([['tourism', 'gallery']]) },
  park: { query: 'parks', googleType: 'park', osmTags: tags([['leisure', 'park']]) },
  shopping: { query: 'shopping centres and shops', googleType: 'shopping_mall', osmTags: tags([['shop', 'mall']]) },
  'mini-golf': { query: 'mini golf courses', osmTags: tags([['leisure', 'miniature_golf']]) },
  'escape-room': { query: 'escape rooms', osmTags: tags([['leisure', 'escape_game']]) },
  'board-games': { query: 'board game cafes', osmTags: tags([['amenity', 'cafe'], ['leisure', 'amusement_arcade']]) },
  'live-music': { query: 'live music venues', osmTags: tags([['amenity', 'music_venue'], ['amenity', 'nightclub']]) },
  picnic: { query: 'picnic areas and parks', osmTags: tags([['leisure', 'park'], ['leisure', 'picnic_table'], ['leisure', 'garden']]) },
  beach: { query: 'beaches', googleType: 'beach', osmTags: tags([['natural', 'beach']]) },
}

export function getActivityVenueSearch(activityId: string): ActivityVenueSearch | undefined {
  return ACTIVITY_VENUE_SEARCH[activityId.trim().toLowerCase()]
}

export function isSupportedVenueActivity(activityId: string): boolean {
  return Boolean(getActivityVenueSearch(activityId))
}
