/**
 * Activity Intelligence Engine — Phase 7.
 *
 * Reusable service layer (no React, no UI imports) that sits between raw
 * Google Places results + weather data and the venue cards the user sees.
 *
 * Responsibilities:
 *   1. detectActivityIntent   — contextual reasoning (not simple keyword matching)
 *   2. rankVenues             — multi-factor scoring: activity suitability, weather,
 *                               distance, travel time, rating, popularity, opening hours
 *   3. buildVenueExplanation  — natural-language explanation for every recommendation
 *   4. suggestAlternatives    — intelligent fallbacks when weather kills the primary activity
 */

import type { Venue, Vibe } from './venue-service'
import type { Weather } from './weather-service'

// ─── Activity Intent ───────────────────────────────────────────────────────────

export type ActivityCategory =
  | 'outdoor_active'   // hiking, cycling, outdoor sports
  | 'outdoor_social'   // picnic, park, beach hang
  | 'indoor_social'    // pub, bar, cocktails
  | 'dining'           // restaurant, food
  | 'cafe_coffee'      // coffee, brunch, light bites
  | 'culture'          // museum, gallery, theatre, cinema
  | 'entertainment'    // bowling, arcade, escape room
  | 'shopping'         // retail, market
  | 'general'          // undetermined

export interface ActivityIntent {
  category: ActivityCategory
  vibe: Vibe
  confidence: number       // 0–100
  signals: string[]        // human-readable reasoning chain
  weatherSensitive: boolean
  preferIndoor: boolean    // true when weather is bad + activity is flexible
}

export interface ActivityContext {
  groupName?: string | null
  memberCount?: number
  /** User-typed search or description, if available. */
  userQuery?: string | null
  /** Current weather at the Golden Window. */
  weather?: Weather | null
  /** Hour of day of the Golden Window (0–23). */
  hourOfDay?: number | null
  /** User's onboarding preferences (activity ids). */
  preferenceIds?: string[]
}

/**
 * Contextual activity detection.
 *
 * Combines multiple weak signals (group name semantics, user query NLP,
 * time-of-day priors, weather context, and preference history) into a
 * single confident intent — rather than a single keyword regex.
 */
export function detectActivityIntent(ctx: ActivityContext): ActivityIntent {
  const signals: string[] = []
  const scores: Record<ActivityCategory, number> = {
    outdoor_active: 0,
    outdoor_social: 0,
    indoor_social: 0,
    dining: 0,
    cafe_coffee: 0,
    culture: 0,
    entertainment: 0,
    shopping: 0,
    general: 0,
  }

  // ── 1. Group name analysis ───────────────────────────────────────────────
  const name = (ctx.groupName ?? '').toLowerCase()

  // Dining signals
  if (/\b(dinner|lunch|brunch|restaurant|food|eat|feast|supper)\b/.test(name)) {
    scores.dining += 3; signals.push('group name suggests a dining outing')
  }
  if (/\b(coffee|cafe|brunch|tea|bakery)\b/.test(name)) {
    scores.cafe_coffee += 3; signals.push('group name suggests a café or coffee visit')
  }
  // Drinks / social
  if (/\b(pub|bar|drinks|beer|ale|wine|cocktail|gin|spirits|brewery|taproom)\b/.test(name)) {
    scores.indoor_social += 3; signals.push('group name suggests drinks / pub social')
  }
  // Outdoor active
  if (/\b(hike|hiking|walk|trek|cycle|cycling|climb|surf|run|sport|fitness|outdoor)\b/.test(name)) {
    scores.outdoor_active += 3; signals.push('group name suggests an outdoor activity')
  }
  // Outdoor social
  if (/\b(beach|park|picnic|BBQ|garden|festival|trip|outing|adventure)\b/.test(name)) {
    scores.outdoor_social += 2; signals.push('group name suggests an outdoor social')
  }
  // Culture
  if (/\b(museum|gallery|theatre|theater|cinema|film|art|culture|exhibit|show)\b/.test(name)) {
    scores.culture += 3; signals.push('group name suggests a cultural event')
  }
  // Entertainment
  if (/\b(bowling|escape|arcade|karaoke|laser|gaming|mini-?golf|pool|snooker)\b/.test(name)) {
    scores.entertainment += 3; signals.push('group name suggests entertainment')
  }
  // Shopping
  if (/\b(market|shop|shopping|mall|retail|boutique)\b/.test(name)) {
    scores.shopping += 3; signals.push('group name suggests shopping')
  }

  // ── 2. User query (free text) ────────────────────────────────────────────
  const query = (ctx.userQuery ?? '').toLowerCase()
  if (query) {
    // More nuanced: weight bigrams and context words too
    if (/\b(eat|dinner|lunch|restaurant|food|hungry|cuisine)\b/.test(query)) {
      scores.dining += 4; signals.push('user query mentions food / eating')
    }
    if (/\b(coffee|cafe|brunch|snack|light|bite)\b/.test(query)) {
      scores.cafe_coffee += 4; signals.push('user query mentions coffee or light bites')
    }
    if (/\b(drink|pub|bar|beer|pint|wine|cocktail|night out)\b/.test(query)) {
      scores.indoor_social += 4; signals.push('user query mentions drinks or a night out')
    }
    if (/\b(hike|walk|climb|cycle|outdoor|nature|trail|fresh air)\b/.test(query)) {
      scores.outdoor_active += 4; signals.push('user query mentions outdoor / active plans')
    }
    if (/\b(beach|park|picnic|garden|open air)\b/.test(query)) {
      scores.outdoor_social += 4; signals.push('user query mentions outdoor social settings')
    }
    if (/\b(museum|gallery|film|cinema|theatre|art|culture|exhibition)\b/.test(query)) {
      scores.culture += 4; signals.push('user query mentions culture or entertainment venues')
    }
    if (/\b(bowl|escape room|arcade|karaoke|gaming|fun activity|mini.?golf)\b/.test(query)) {
      scores.entertainment += 4; signals.push('user query mentions activity venue')
    }
  }

  // ── 3. Time-of-day priors ────────────────────────────────────────────────
  const hour = ctx.hourOfDay
  if (hour != null) {
    if (hour >= 7 && hour < 11) {
      scores.cafe_coffee += 1.5; signals.push('morning slot → café/brunch likely')
    } else if (hour >= 11 && hour < 14) {
      scores.dining += 1; scores.cafe_coffee += 0.5; signals.push('midday slot → lunch bias')
    } else if (hour >= 14 && hour < 17) {
      scores.cafe_coffee += 1; scores.outdoor_social += 0.5; signals.push('afternoon slot → café or outdoor social')
    } else if (hour >= 17 && hour < 20) {
      scores.indoor_social += 1.5; scores.dining += 1; signals.push('evening slot → dinner or drinks')
    } else if (hour >= 20) {
      scores.indoor_social += 2; scores.entertainment += 0.5; signals.push('late evening → bar / night out')
    }
  }

  // ── 4. User preference history ───────────────────────────────────────────
  const prefs = ctx.preferenceIds ?? []
  if (prefs.includes('dining')) { scores.dining += 1; signals.push('user preference: dining out') }
  if (prefs.includes('drinks')) { scores.indoor_social += 1; signals.push('user preference: drinks & bars') }
  if (prefs.includes('coffee')) { scores.cafe_coffee += 1; signals.push('user preference: coffee & cafes') }
  if (prefs.includes('outdoor')) { scores.outdoor_active += 1; scores.outdoor_social += 1; signals.push('user preference: outdoor activities') }
  if (prefs.includes('entertainment')) { scores.entertainment += 1; signals.push('user preference: entertainment') }

  // ── 5. Determine winner ──────────────────────────────────────────────────
  const sorted = (Object.entries(scores) as [ActivityCategory, number][])
    .sort((a, b) => b[1] - a[1])

  const [topCategory, topScore] = sorted[0]!
  const [, secondScore] = sorted[1] ?? ['general', 0]

  // Confidence: how far ahead the winner is vs the runner-up
  const gap = topScore - secondScore
  const totalEvidence = Object.values(scores).reduce((s, v) => s + v, 0)
  const rawConfidence = totalEvidence === 0 ? 20 : Math.min(95, 40 + gap * 15)
  const confidence = Math.round(rawConfidence)

  const category = totalEvidence === 0 ? 'general' : topCategory
  if (totalEvidence === 0) signals.push('no strong signals — general recommendation')

  // ── 6. Weather override ──────────────────────────────────────────────────
  const w = ctx.weather
  const isWet = w && !w.error && (
    w.condition === 'rain' || w.condition === 'storm' || w.condition === 'snow' ||
    (w.precipitation_pct != null && w.precipitation_pct >= 50)
  )
  const weatherSensitive = category === 'outdoor_active' || category === 'outdoor_social'

  let preferIndoor = false
  if (isWet && weatherSensitive) {
    preferIndoor = true
    signals.push(`${w!.short_label} — suggesting indoor alternatives for outdoor activity`)
  }

  // ── 7. Map category → Vibe ───────────────────────────────────────────────
  const vibe = categoryToVibe(category, preferIndoor)

  return { category, vibe, confidence, signals, weatherSensitive, preferIndoor }
}

function categoryToVibe(cat: ActivityCategory, preferIndoor: boolean): Vibe {
  if (preferIndoor) return 'drinks' // warm indoor fallback for outdoor intent
  switch (cat) {
    case 'dining':         return 'food'
    case 'cafe_coffee':    return 'coffee'
    case 'indoor_social':  return 'pub'
    case 'outdoor_active':
    case 'outdoor_social': return 'activity'
    case 'culture':
    case 'entertainment':  return 'activity'
    case 'shopping':       return 'activity'
    default:               return 'drinks'
  }
}

// ─── Venue Scoring ────────────────────────────────────────────────────────────

export interface ScoredVenueResult {
  venue: Venue
  /** Final composite score (higher = better). */
  totalScore: number
  /** Broken-down factor scores for transparency. */
  factors: {
    quality: number       // rating × log10(reviews) — baseline quality
    activityFit: number   // how well category/types match the intent
    weatherFit: number    // weather × indoor/outdoor classification
    accessibility: number // open_now bonus + distance penalty
  }
  /** One natural-language explanation per significant factor. */
  explanation: string[]
  /** True when this is a weather-driven indoor alternative. */
  isWeatherAlternative: boolean
}

/**
 * Multi-factor venue ranking.
 *
 * Factor weights (tuned so a great venue never loses to a mediocre one on
 * a single dimension):
 *   quality     40 %  — core quality signal (rating × popularity)
 *   activityFit 30 %  — how well it matches the detected intent
 *   weatherFit  15 %  — indoor/outdoor suitability given the forecast
 *   accessibility 15 % — open now + distance from midpoint
 */
export function rankVenues(
  venues: Venue[],
  weather: Weather | null,
  intent: ActivityIntent,
): ScoredVenueResult[] {
  return venues
    .map((v) => scoreVenue(v, weather, intent))
    .sort((a, b) => b.totalScore - a.totalScore)
}

export function scoreVenue(
  venue: Venue,
  weather: Weather | null,
  intent: ActivityIntent,
): ScoredVenueResult {
  const explanation: string[] = []

  // ── Quality (40 %) ────────────────────────────────────────────────────────
  const rating = venue.rating ?? 0
  const reviews = venue.rating_count ?? 0
  const qualityRaw = rating > 0 ? rating * Math.log10(reviews + 10) : 0
  // Normalise roughly to 0–1 (a 5★ × 5000 reviews gives ~18.5; 4★ × 10 ≈ 4.4)
  const quality = Math.min(qualityRaw / 20, 1)

  if (rating >= 4.5 && reviews >= 100) {
    explanation.push(`Highly rated ${rating.toFixed(1)}★ across ${formatCount(reviews)} reviews`)
  } else if (rating >= 4.0) {
    explanation.push(`Well rated at ${rating.toFixed(1)}★`)
  }

  // ── Activity Fit (30 %) ───────────────────────────────────────────────────
  const activityFitRaw = computeActivityFit(venue, intent)
  const activityFit = activityFitRaw  // already 0–1

  if (activityFitRaw >= 0.7) {
    explanation.push(activityFitReason(venue, intent))
  }

  // ── Weather Fit (15 %) ────────────────────────────────────────────────────
  const { score: weatherFitRaw, reason: weatherReason, isAlt } = computeWeatherFit(venue, weather, intent)
  const weatherFit = weatherFitRaw
  if (weatherReason) explanation.push(weatherReason)

  // ── Accessibility (15 %) ─────────────────────────────────────────────────
  const openBonus = venue.open_now === true ? 0.4 : venue.open_now === false ? -0.1 : 0
  const distPenalty = venue.distance_km != null ? Math.min(venue.distance_km / 10, 0.5) : 0
  const accessibilityRaw = Math.max(0, Math.min(1, 0.5 + openBonus - distPenalty))
  const accessibility = accessibilityRaw

  if (venue.open_now === true) {
    explanation.push('Open now — ready when your group arrives')
  } else if (venue.open_now === false) {
    explanation.push('Currently closed — check opening hours')
  }
  if (venue.distance_km != null) {
    if (venue.distance_km < 0.5) {
      explanation.push(`Just ${Math.round(venue.distance_km * 1000)}m from your midpoint`)
    } else if (venue.distance_km < 1.5) {
      explanation.push(`${venue.distance_km.toFixed(1)}km from your group's midpoint`)
    }
  }

  // ── Composite ─────────────────────────────────────────────────────────────
  const totalScore =
    quality      * 0.40 +
    activityFit  * 0.30 +
    weatherFit   * 0.15 +
    accessibility * 0.15

  return {
    venue,
    totalScore,
    factors: { quality, activityFit, weatherFit, accessibility },
    explanation: explanation.slice(0, 4),
    isWeatherAlternative: isAlt,
  }
}

/** How well does this venue's category/types match the detected activity intent? */
function computeActivityFit(venue: Venue, intent: ActivityIntent): number {
  const cat = (venue.category ?? '').toLowerCase()

  // If we're looking for an indoor alternative due to bad weather, reward indoor spots
  if (intent.preferIndoor) {
    const isIndoor = /\b(bar|pub|restaurant|cafe|coffee|bistro|brewery|cocktail|club|cinema|theatre|museum|gallery|bowling|indoor)\b/i.test(cat)
    return isIndoor ? 0.85 : 0.4
  }

  switch (intent.category) {
    case 'dining':
      return /\b(restaurant|dining|bistro|brasserie|eatery|kitchen|food)\b/i.test(cat) ? 0.9
           : /\b(cafe|pub|bar)\b/i.test(cat) ? 0.5 : 0.2

    case 'cafe_coffee':
      return /\b(cafe|coffee|bakery|tea|brunch|patisserie)\b/i.test(cat) ? 0.9
           : /\b(restaurant|bistro)\b/i.test(cat) ? 0.4 : 0.2

    case 'indoor_social':
      return /\b(bar|pub|brewery|cocktail|wine|gin|taproom|lounge)\b/i.test(cat) ? 0.9
           : /\b(restaurant|cafe|club)\b/i.test(cat) ? 0.5 : 0.2

    case 'outdoor_active':
    case 'outdoor_social':
      return /\b(park|garden|beach|trail|outdoor|nature|sport|recreation|promenade|pier|seafront)\b/i.test(cat) ? 0.9
           : /\b(activity|experience|adventure)\b/i.test(cat) ? 0.7 : 0.2

    case 'culture':
      return /\b(museum|gallery|theatre|theater|cinema|heritage|art|exhibit)\b/i.test(cat) ? 0.9
           : /\b(tour|historic)\b/i.test(cat) ? 0.7 : 0.2

    case 'entertainment':
      return /\b(bowling|arcade|escape|karaoke|gaming|cinema|mini.?golf|pool|activity)\b/i.test(cat) ? 0.9
           : /\b(bar|pub)\b/i.test(cat) ? 0.4 : 0.2

    default:
      return 0.5 // neutral for general
  }
}

function activityFitReason(venue: Venue, intent: ActivityIntent): string {
  if (intent.preferIndoor) return 'Good indoor option — stays dry whatever the weather'
  switch (intent.category) {
    case 'dining':        return 'Matches your group\'s dining plans'
    case 'cafe_coffee':   return 'Great café or coffee spot for the occasion'
    case 'indoor_social': return 'Perfect for drinks with the group'
    case 'outdoor_active':return 'Outdoor venue suited to an active outing'
    case 'outdoor_social':return 'Open-air setting for a social get-together'
    case 'culture':       return 'Cultural venue that fits the group\'s plans'
    case 'entertainment': return 'Activity venue the whole group can enjoy'
    default:              return `Suits the ${venue.category ?? 'vibe'} the group is after`
  }
}

/** Weather × indoor/outdoor classification → fit score + reason. */
function computeWeatherFit(
  venue: Venue,
  weather: Weather | null,
  intent: ActivityIntent,
): { score: number; reason: string | null; isAlt: boolean } {
  if (!weather || weather.error) return { score: 0.5, reason: null, isAlt: false }

  const cat = (venue.category ?? '').toLowerCase()
  const isOutdoor = /\b(park|garden|beach|trail|outdoor|promenade|pier|seafront|riverside|playground)\b/i.test(cat)
  const isIndoor  = /\b(bar|pub|restaurant|cafe|coffee|bistro|brewery|cocktail|club|cinema|theatre|museum|gallery|bowling)\b/i.test(cat)

  const wet = weather.condition === 'rain' || weather.condition === 'storm' ||
              weather.condition === 'snow' || (weather.precipitation_pct != null && weather.precipitation_pct >= 50)
  const mild = !wet && (weather.condition === 'clear' || weather.condition === 'cloudy') &&
               (weather.temperature_c == null || weather.temperature_c >= 10)

  const precip = weather.precipitation_pct
  const temp = weather.temperature_c

  if (wet && isOutdoor) {
    const reason = precip != null
      ? `${precip}% chance of rain — outdoor spots will be affected`
      : 'Wet conditions — outdoor spots may be uncomfortable'
    return { score: 0.1, reason, isAlt: intent.weatherSensitive }
  }
  if (wet && isIndoor) {
    const reason = precip != null
      ? `${precip}% rain chance — great excuse for a cosy indoor spot`
      : 'Rainy weather — this indoor venue is ideal'
    return { score: 0.9, reason, isAlt: false }
  }
  if (mild && isOutdoor) {
    const reason = temp != null
      ? `${weather.short_label} (${Math.round(temp)}°) — nice conditions for an outdoor spot`
      : `${weather.short_label} — good conditions for outdoors`
    return { score: 0.85, reason, isAlt: false }
  }
  if (mild && isIndoor) {
    return { score: 0.6, reason: null, isAlt: false } // good weather — indoors slightly less exciting
  }

  return { score: 0.5, reason: null, isAlt: false }
}

// ─── Weather Alternatives ────────────────────────────────────────────────────

export interface AlternativesSuggestion {
  /** True when a weather-based switch is recommended. */
  shouldSuggest: boolean
  /** Short headline to show in the UI. */
  headline: string
  /** Longer explanation sentence. */
  body: string
  /** The alternative vibe to fetch. */
  alternativeVibe: Vibe
}

/**
 * Decide whether to suggest indoor alternatives given the weather and intent.
 * Returns a ready-to-display suggestion object — the UI decides whether to act on it.
 */
export function suggestWeatherAlternatives(
  weather: Weather | null,
  intent: ActivityIntent,
): AlternativesSuggestion {
  const noSuggestion: AlternativesSuggestion = {
    shouldSuggest: false,
    headline: '',
    body: '',
    alternativeVibe: 'drinks',
  }

  if (!weather || weather.error) return noSuggestion
  if (!intent.weatherSensitive && !intent.preferIndoor) return noSuggestion

  const wet = weather.condition === 'rain' || weather.condition === 'storm' ||
              weather.condition === 'snow' || (weather.precipitation_pct != null && weather.precipitation_pct >= 50)
  if (!wet) return noSuggestion

  const precip = weather.precipitation_pct
  const rainStr = precip != null ? `${precip}% chance of rain` : 'wet conditions'

  if (intent.category === 'outdoor_active') {
    return {
      shouldSuggest: true,
      headline: 'Outdoor plans, but rain is forecast',
      body: `${rainStr} around your Golden Window. We\'ve found great indoor activity venues and bars as an alternative.`,
      alternativeVibe: 'activity',
    }
  }
  if (intent.category === 'outdoor_social') {
    return {
      shouldSuggest: true,
      headline: 'Parks & outdoor spots may be wet',
      body: `${rainStr} — perfect weather for a cosy pub or café instead.`,
      alternativeVibe: 'pub',
    }
  }

  return noSuggestion
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}
