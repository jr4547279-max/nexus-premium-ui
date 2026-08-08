// ─────────────────────────────────────────────────────────────────────────────
// Mock Venue Provider — deterministic demo data for all supported activities
// ─────────────────────────────────────────────────────────────────────────────
// Used when:
//   • No group location is set (OSM provider needs a location)
//   • OSM returns fewer than MIN_OSM_RESULTS venues
//   • Developer test mode
//
// All venues are fictional but geographically plausible (UK city centre).

import type { PlannerVenue, VenueProvider } from '../types'

// ── Shared coordinates ────────────────────────────────────────────────────────
// Venues are clustered around a fictional UK city centre (51.509, -0.134).

// ── Pubs (for pub-crawl) ──────────────────────────────────────────────────────
// Preserved from the original mock-venue-provider.ts

const MOCK_PUBS: PlannerVenue[] = [
  { id: 'pub-001', name: 'The Anchor & Hope', lat: 51.5121, lng: -0.1356, rating: 4.3, priceLevel: 2, openingTime: '11:00', closingTime: '23:00', atmosphere: ['lively', 'traditional', 'welcoming'], tags: ['real-ale', 'quiz-night', 'sports-tv'], estimatedCostPerPerson: 8, capacity: 'large', features: ['outdoor-seating', 'darts', 'pool-table'], distanceFromCentre: 0.31, isRealData: false },
  { id: 'pub-002', name: 'The Golden Fleece', lat: 51.5098, lng: -0.1334, rating: 4.6, priceLevel: 2, openingTime: '12:00', closingTime: '23:30', atmosphere: ['cosy', 'classic', 'welcoming'], tags: ['craft-beer', 'food-menu', 'fireplace'], estimatedCostPerPerson: 9, capacity: 'medium', features: ['beer-garden', 'sunday-roast', 'quiz-night'], distanceFromCentre: 0.18, isRealData: false },
  { id: 'pub-003', name: 'The Half Moon', lat: 51.5083, lng: -0.1312, rating: 4.1, priceLevel: 1, openingTime: '11:00', closingTime: '23:00', atmosphere: ['lively', 'classic', 'social'], tags: ['live-sport', 'real-ale', 'karaoke'], estimatedCostPerPerson: 6, capacity: 'large', features: ['pool-table', 'sports-tv', 'darts'], distanceFromCentre: 0.44, isRealData: false },
  { id: 'pub-004', name: 'The Old Bell', lat: 51.5112, lng: -0.1289, rating: 4.5, priceLevel: 2, openingTime: '11:00', closingTime: '00:00', atmosphere: ['eclectic', 'modern', 'vibrant'], tags: ['craft-beer', 'gin-menu', 'live-music'], estimatedCostPerPerson: 10, capacity: 'medium', features: ['cocktail-bar', 'live-music', 'beer-garden'], distanceFromCentre: 0.27, isRealData: false },
  { id: 'pub-005', name: 'The Red Lion', lat: 51.5067, lng: -0.1378, rating: 3.9, priceLevel: 1, openingTime: '10:30', closingTime: '23:00', atmosphere: ['traditional', 'local', 'welcoming'], tags: ['real-ale', 'sports', 'pool'], estimatedCostPerPerson: 5, capacity: 'large', features: ['pool-table', 'jukebox', 'outdoor-seating'], distanceFromCentre: 0.56, isRealData: false },
  { id: 'pub-006', name: 'The Crown & Anchor', lat: 51.5134, lng: -0.1301, rating: 4.4, priceLevel: 2, openingTime: '12:00', closingTime: '23:30', atmosphere: ['social', 'lively', 'modern'], tags: ['craft-beer', 'food', 'events'], estimatedCostPerPerson: 9, capacity: 'medium', features: ['kitchen', 'beer-garden', 'events'], distanceFromCentre: 0.39, isRealData: false },
  { id: 'pub-007', name: 'The Plough & Stars', lat: 51.5089, lng: -0.1267, rating: 4.2, priceLevel: 2, openingTime: '11:30', closingTime: '23:00', atmosphere: ['lively', 'vibrant', 'eclectic'], tags: ['live-music', 'craft-beer', 'cocktails'], estimatedCostPerPerson: 9, capacity: 'small', features: ['stage', 'vinyl-records', 'craft-beer'], distanceFromCentre: 0.61, isRealData: false },
  { id: 'pub-008', name: 'The Swan & Cygnet', lat: 51.5148, lng: -0.1323, rating: 4.7, priceLevel: 3, openingTime: '12:00', closingTime: '23:00', atmosphere: ['upscale', 'cosy', 'romantic'], tags: ['wine-bar', 'cocktails', 'food'], estimatedCostPerPerson: 14, capacity: 'small', features: ['wine-list', 'charcuterie', 'private-booths'], distanceFromCentre: 0.21, isRealData: false },
  { id: 'pub-009', name: 'The Duke of Wellington', lat: 51.5075, lng: -0.1345, rating: 4.0, priceLevel: 2, openingTime: '11:00', closingTime: '22:30', atmosphere: ['traditional', 'classic', 'quiet'], tags: ['real-ale', 'history', 'log-fire'], estimatedCostPerPerson: 7, capacity: 'medium', features: ['log-fire', 'garden', 'real-ales'], distanceFromCentre: 0.48, isRealData: false },
  { id: 'pub-010', name: 'The Fox & Hound', lat: 51.5108, lng: -0.1278, rating: 4.3, priceLevel: 2, openingTime: '12:00', closingTime: '23:30', atmosphere: ['welcoming', 'social', 'lively'], tags: ['craft-beer', 'events', 'beer-garden'], estimatedCostPerPerson: 8, capacity: 'large', features: ['beer-garden', 'quiz-nights', 'events'], distanceFromCentre: 0.33, isRealData: false },
  { id: 'pub-011', name: 'The Tap Room', lat: 51.5091, lng: -0.1312, rating: 4.8, priceLevel: 2, openingTime: '14:00', closingTime: '23:00', atmosphere: ['eclectic', 'vibrant', 'social'], tags: ['craft-beer', 'taproom', 'brewery'], estimatedCostPerPerson: 9, capacity: 'small', features: ['rotating-taps', 'cask-ales', 'growlers'], distanceFromCentre: 0.25, isRealData: false },
  { id: 'pub-012', name: 'The Compass Rose', lat: 51.5124, lng: -0.1289, rating: 4.1, priceLevel: 1, openingTime: '11:00', closingTime: '23:00', atmosphere: ['lively', 'casual', 'local'], tags: ['sport', 'pool', 'jukebox'], estimatedCostPerPerson: 5, capacity: 'large', features: ['pool-tables', 'sports-tv', 'jukebox'], distanceFromCentre: 0.52, isRealData: false },
  { id: 'pub-013', name: 'The Barrel & Board', lat: 51.5062, lng: -0.1356, rating: 4.5, priceLevel: 2, openingTime: '12:00', closingTime: '23:30', atmosphere: ['cosy', 'vibrant', 'modern'], tags: ['craft-beer', 'board-games', 'food'], estimatedCostPerPerson: 10, capacity: 'medium', features: ['board-game-library', 'kitchen', 'craft-beer'], distanceFromCentre: 0.67, isRealData: false },
  { id: 'pub-014', name: 'The Inkwell', lat: 51.5139, lng: -0.1267, rating: 4.6, priceLevel: 2, openingTime: '15:00', closingTime: '01:00', atmosphere: ['eclectic', 'alternative', 'vibrant'], tags: ['craft-beer', 'punk', 'events'], estimatedCostPerPerson: 8, capacity: 'medium', features: ['record-nights', 'events', 'photo-booth'], distanceFromCentre: 0.44, isRealData: false },
  { id: 'pub-015', name: 'The River Arms', lat: 51.5079, lng: -0.1298, rating: 4.2, priceLevel: 2, openingTime: '11:00', closingTime: '23:00', atmosphere: ['welcoming', 'social', 'classic'], tags: ['food', 'real-ale', 'garden'], estimatedCostPerPerson: 8, capacity: 'large', features: ['riverside-view', 'garden', 'kitchen'], distanceFromCentre: 0.37, isRealData: false },
  { id: 'pub-016', name: 'The Signal Box', lat: 51.5115, lng: -0.1334, rating: 4.4, priceLevel: 2, openingTime: '12:00', closingTime: '00:00', atmosphere: ['modern', 'vibrant', 'lively'], tags: ['cocktails', 'craft-beer', 'events'], estimatedCostPerPerson: 11, capacity: 'medium', features: ['rooftop', 'cocktail-menu', 'dj-nights'], distanceFromCentre: 0.28, isRealData: false },
]

// ── Restaurants ───────────────────────────────────────────────────────────────

const MOCK_RESTAURANTS: PlannerVenue[] = [
  { id: 'rest-001', name: 'Maison Claude', lat: 51.5098, lng: -0.1334, rating: 4.6, priceLevel: 3, openingTime: '12:00', closingTime: '22:30', atmosphere: ['romantic', 'upscale', 'traditional'], tags: ['french', 'wine', 'bistro'], estimatedCostPerPerson: 35, capacity: 'medium', features: ['wine-list', 'private-dining', 'tasting-menu'], distanceFromCentre: 0.32, isRealData: false },
  { id: 'rest-002', name: 'The Garden Table', lat: 51.5112, lng: -0.1298, rating: 4.4, priceLevel: 2, openingTime: '11:30', closingTime: '22:00', atmosphere: ['casual', 'modern', 'friendly'], tags: ['british', 'seasonal', 'farm-to-table'], estimatedCostPerPerson: 22, capacity: 'large', features: ['outdoor-seating', 'vegetarian-friendly'], distanceFromCentre: 0.28, isRealData: false },
  { id: 'rest-003', name: 'Sakura Kitchen', lat: 51.5085, lng: -0.1312, rating: 4.7, priceLevel: 2, openingTime: '12:00', closingTime: '22:00', atmosphere: ['modern', 'cosy', 'intimate'], tags: ['japanese', 'sushi', 'ramen'], estimatedCostPerPerson: 25, capacity: 'small', features: ['sake-menu', 'vegetarian-options'], distanceFromCentre: 0.44, isRealData: false },
  { id: 'rest-004', name: 'El Rincon', lat: 51.5121, lng: -0.1289, rating: 4.5, priceLevel: 2, openingTime: '13:00', closingTime: '23:00', atmosphere: ['vibrant', 'social', 'lively'], tags: ['tapas', 'spanish', 'cocktails'], estimatedCostPerPerson: 28, capacity: 'medium', features: ['tapas-bar', 'sangria', 'events'], distanceFromCentre: 0.21, isRealData: false },
  { id: 'rest-005', name: 'The Brass Fox', lat: 51.5068, lng: -0.1356, rating: 4.3, priceLevel: 1, openingTime: '11:00', closingTime: '21:30', atmosphere: ['traditional', 'family', 'welcoming'], tags: ['british', 'carvery', 'pub-food'], estimatedCostPerPerson: 14, capacity: 'large', features: ['family-friendly', 'sunday-roast', 'dog-friendly'], distanceFromCentre: 0.55, isRealData: false },
  { id: 'rest-006', name: 'Citrus & Thyme', lat: 51.5104, lng: -0.1278, rating: 4.8, priceLevel: 3, openingTime: '17:30', closingTime: '22:00', atmosphere: ['upscale', 'romantic', 'intimate'], tags: ['mediterranean', 'fine-dining', 'cocktails'], estimatedCostPerPerson: 45, capacity: 'small', features: ['tasting-menu', 'sommelier', 'private-dining'], distanceFromCentre: 0.38, isRealData: false },
]

// ── Cafes (coffee) ────────────────────────────────────────────────────────────

const MOCK_CAFES: PlannerVenue[] = [
  { id: 'cafe-001', name: 'Common Ground Coffee', lat: 51.5106, lng: -0.1318, rating: 4.7, priceLevel: 2, openingTime: '07:30', closingTime: '18:00', atmosphere: ['artisan', 'cosy', 'modern'], tags: ['specialty-coffee', 'single-origin', 'pastries'], estimatedCostPerPerson: 6, capacity: 'medium', features: ['wifi', 'pour-over', 'outdoor-seating'], distanceFromCentre: 0.26, isRealData: false },
  { id: 'cafe-002', name: 'The Reading Room', lat: 51.5089, lng: -0.1345, rating: 4.5, priceLevel: 1, openingTime: '08:00', closingTime: '17:30', atmosphere: ['quiet', 'relaxed', 'cosy'], tags: ['coffee', 'tea', 'wifi'], estimatedCostPerPerson: 5, capacity: 'small', features: ['board-games', 'wifi', 'quiet-area'], distanceFromCentre: 0.41, isRealData: false },
  { id: 'cafe-003', name: 'Botanica', lat: 51.5117, lng: -0.1302, rating: 4.6, priceLevel: 2, openingTime: '08:30', closingTime: '17:00', atmosphere: ['bright', 'friendly', 'modern'], tags: ['brunch', 'coffee', 'vegan'], estimatedCostPerPerson: 8, capacity: 'medium', features: ['vegan-menu', 'outdoor-seating', 'wifi'], distanceFromCentre: 0.33, isRealData: false },
  { id: 'cafe-004', name: 'Roast & Press', lat: 51.5074, lng: -0.1278, rating: 4.4, priceLevel: 2, openingTime: '07:00', closingTime: '16:30', atmosphere: ['artisan', 'relaxed', 'welcoming'], tags: ['espresso', 'filter', 'sourdough'], estimatedCostPerPerson: 7, capacity: 'small', features: ['specialty-roasts', 'homemade-cakes'], distanceFromCentre: 0.58, isRealData: false },
  { id: 'cafe-005', name: 'Sunrise Social', lat: 51.5095, lng: -0.1267, rating: 4.3, priceLevel: 1, openingTime: '09:00', closingTime: '18:00', atmosphere: ['cosy', 'friendly', 'casual'], tags: ['coffee', 'tea', 'community'], estimatedCostPerPerson: 4, capacity: 'large', features: ['community-events', 'wifi', 'dog-friendly'], distanceFromCentre: 0.71, isRealData: false },
]

// ── Bowling ───────────────────────────────────────────────────────────────────

const MOCK_BOWLING: PlannerVenue[] = [
  { id: 'bowl-001', name: 'Strike City Lanes', lat: 51.5145, lng: -0.1289, rating: 4.4, priceLevel: 2, openingTime: '10:00', closingTime: '23:00', atmosphere: ['fun', 'lively', 'social'], tags: ['bowling', 'bar', 'arcade'], estimatedCostPerPerson: 18, capacity: 'large', features: ['bar', 'arcade', 'private-lanes', 'cosmic-bowling'], distanceFromCentre: 0.62, isRealData: false },
  { id: 'bowl-002', name: 'The Bowl & Barrel', lat: 51.5072, lng: -0.1234, rating: 4.2, priceLevel: 2, openingTime: '12:00', closingTime: '22:30', atmosphere: ['casual', 'family', 'modern'], tags: ['bowling', 'food', 'sports'], estimatedCostPerPerson: 16, capacity: 'large', features: ['food-menu', 'sports-bar', 'shoe-hire'], distanceFromCentre: 0.89, isRealData: false },
  { id: 'bowl-003', name: 'Pins & Pints', lat: 51.5131, lng: -0.1378, rating: 4.5, priceLevel: 2, openingTime: '11:00', closingTime: '23:30', atmosphere: ['fun', 'social', 'lively'], tags: ['bowling', 'craft-beer', 'events'], estimatedCostPerPerson: 20, capacity: 'medium', features: ['craft-beer', 'diner-menu', 'league-nights'], distanceFromCentre: 0.74, isRealData: false },
]

// ── Cinemas ───────────────────────────────────────────────────────────────────

const MOCK_CINEMAS: PlannerVenue[] = [
  { id: 'cin-001', name: 'The Regal Picturehouse', lat: 51.5118, lng: -0.1312, rating: 4.6, priceLevel: 2, openingTime: '10:00', closingTime: '23:30', atmosphere: ['comfortable', 'classic', 'premium'], tags: ['cinema', 'indie-films', 'bar'], estimatedCostPerPerson: 13, capacity: 'large', features: ['licensed-bar', 'recliner-seats', 'indie-programme'], distanceFromCentre: 0.34, isRealData: false },
  { id: 'cin-002', name: 'NOVA Multiplex', lat: 51.5082, lng: -0.1267, rating: 4.3, priceLevel: 2, openingTime: '09:00', closingTime: '00:00', atmosphere: ['modern', 'social', 'casual'], tags: ['cinema', 'blockbusters', 'imax', 'food'], estimatedCostPerPerson: 15, capacity: 'large', features: ['imax', 'food-order', 'recliner-seats', 'late-night'], distanceFromCentre: 0.71, isRealData: false },
  { id: 'cin-003', name: 'The Electric Screen', lat: 51.5097, lng: -0.1357, rating: 4.8, priceLevel: 3, openingTime: '12:00', closingTime: '23:00', atmosphere: ['intimate', 'premium', 'classic'], tags: ['cinema', 'boutique', 'events', 'bar'], estimatedCostPerPerson: 17, capacity: 'small', features: ['sofas', 'table-service', 'curated-films', 'events'], distanceFromCentre: 0.48, isRealData: false },
]

// ── Live music ────────────────────────────────────────────────────────────────

const MOCK_LIVE_MUSIC: PlannerVenue[] = [
  { id: 'music-001', name: 'The Blue Note', lat: 51.5109, lng: -0.1324, rating: 4.7, priceLevel: 2, openingTime: '19:00', closingTime: '02:00', atmosphere: ['intimate', 'vibrant', 'electric'], tags: ['jazz', 'live-music', 'cocktails'], estimatedCostPerPerson: 12, capacity: 'medium', features: ['live-jazz', 'cocktails', 'intimate-stage'], distanceFromCentre: 0.29, isRealData: false },
  { id: 'music-002', name: 'The Underground Stage', lat: 51.5093, lng: -0.1298, rating: 4.5, priceLevel: 2, openingTime: '20:00', closingTime: '03:00', atmosphere: ['alternative', 'eclectic', 'lively'], tags: ['live-music', 'indie', 'rock', 'events'], estimatedCostPerPerson: 10, capacity: 'large', features: ['live-bands', 'bar', 'late-night'], distanceFromCentre: 0.45, isRealData: false },
  { id: 'music-003', name: 'Acoustic & Oak', lat: 51.5126, lng: -0.1341, rating: 4.4, priceLevel: 1, openingTime: '18:00', closingTime: '00:00', atmosphere: ['relaxed', 'intimate', 'cosy'], tags: ['acoustic', 'folk', 'singer-songwriter'], estimatedCostPerPerson: 7, capacity: 'small', features: ['acoustic-nights', 'open-mic', 'real-ale'], distanceFromCentre: 0.52, isRealData: false },
  { id: 'music-004', name: 'The Grand Pavilion', lat: 51.5078, lng: -0.1289, rating: 4.8, priceLevel: 3, openingTime: '19:30', closingTime: '02:30', atmosphere: ['vibrant', 'electric', 'social'], tags: ['live-music', 'dj', 'events', 'cocktails'], estimatedCostPerPerson: 16, capacity: 'large', features: ['headline-acts', 'cocktail-bar', 'vip-area'], distanceFromCentre: 0.68, isRealData: false },
]

// ── Cocktail bars ─────────────────────────────────────────────────────────────

const MOCK_COCKTAIL_BARS: PlannerVenue[] = [
  { id: 'cock-001', name: 'The Alchemist Lounge', lat: 51.5101, lng: -0.1332, rating: 4.7, priceLevel: 3, openingTime: '17:00', closingTime: '02:00', atmosphere: ['trendy', 'upscale', 'social'], tags: ['cocktails', 'mixology', 'bar'], estimatedCostPerPerson: 18, capacity: 'medium', features: ['table-service', 'bespoke-cocktails', 'private-hire'], distanceFromCentre: 0.24, isRealData: false },
  { id: 'cock-002', name: 'Spiritus', lat: 51.5088, lng: -0.1289, rating: 4.5, priceLevel: 3, openingTime: '18:00', closingTime: '01:00', atmosphere: ['vibrant', 'modern', 'lively'], tags: ['cocktails', 'spirits', 'wine'], estimatedCostPerPerson: 16, capacity: 'small', features: ['botanical-cocktails', 'wine-list'], distanceFromCentre: 0.36, isRealData: false },
  { id: 'cock-003', name: 'The Copper Still', lat: 51.5115, lng: -0.1312, rating: 4.6, priceLevel: 2, openingTime: '16:00', closingTime: '00:00', atmosphere: ['cosy', 'intimate', 'social'], tags: ['gin', 'whisky', 'cocktails'], estimatedCostPerPerson: 14, capacity: 'small', features: ['whisky-menu', 'gin-flights', 'cheese-boards'], distanceFromCentre: 0.41, isRealData: false },
  { id: 'cock-004', name: 'Neon Garden', lat: 51.5071, lng: -0.1345, rating: 4.4, priceLevel: 2, openingTime: '19:00', closingTime: '02:00', atmosphere: ['vibrant', 'eclectic', 'lively'], tags: ['cocktails', 'neon', 'music', 'events'], estimatedCostPerPerson: 15, capacity: 'large', features: ['dj', 'garden', 'events-space'], distanceFromCentre: 0.59, isRealData: false },
]

// ── Lookup map ────────────────────────────────────────────────────────────────

const VENUE_MAP: Record<string, PlannerVenue[]> = {
  'pub-crawl':    MOCK_PUBS,
  'cocktail-bar': MOCK_COCKTAIL_BARS,
  'restaurant':   MOCK_RESTAURANTS,
  'brunch':       MOCK_CAFES,
  'coffee':       MOCK_CAFES,
  'bowling':      MOCK_BOWLING,
  'cinema':       MOCK_CINEMAS,
  'live-music':   MOCK_LIVE_MUSIC,
  // Fallbacks for activities without dedicated mock data
  'board-games':  MOCK_PUBS,
  'escape-room':  MOCK_BOWLING,
  'gym':          MOCK_BOWLING,
}

// ── Provider class ────────────────────────────────────────────────────────────

export class MockVenueProvider implements VenueProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getVenues(activityId: string, _location?: { lat: number; lng: number }): Promise<PlannerVenue[]> {
    const venues = VENUE_MAP[activityId] ?? MOCK_PUBS
    // Shuffle deterministically using activityId as seed
    const seed = activityId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    return [...venues].sort((a, b) => {
      const ha = ((seed * a.id.charCodeAt(0)) % 7) - 3
      const hb = ((seed * b.id.charCodeAt(0)) % 7) - 3
      return ha - hb
    })
  }
}
