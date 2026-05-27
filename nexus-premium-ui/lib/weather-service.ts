/**
 * Phase 6A: Client-side weather helper.
 *
 * Thin fetcher in front of /nx/weather. Keeps the shape of the data the rest
 * of the UI depends on (chip, venue scoring, detail sheet) stable even if we
 * later swap providers on the server.
 */

import type { Venue, Vibe } from './venue-service'

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'snow'
  | 'storm'
  | 'fog'
  | 'night'

export interface Weather {
  condition: WeatherCondition
  temperature_c: number | null
  precipitation_pct: number | null
  wind_kph: number | null
  short_label: string
  is_forecast: boolean
  target_iso: string | null
  provider: 'open-meteo'
  fallback_location: boolean
  error?: string
}

/**
 * Find the ISO date (YYYY-MM-DD) of the next occurrence of `dayOfWeek` (0 =
 * Sun … 6 = Sat) starting from today. Today counts if it matches.
 */
export function nextDateForDay(dayOfWeek: number, now: Date = new Date()): string {
  const d = new Date(now)
  const diff = (dayOfWeek - d.getDay() + 7) % 7
  d.setDate(d.getDate() + diff)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export interface FetchWeatherOpts {
  lat?: number
  lng?: number
  dayOfWeek?: number
  startTime?: string // HH:MM
}

export async function fetchWeather(opts: FetchWeatherOpts): Promise<Weather | null> {
  const qs = new URLSearchParams()
  if (opts.lat != null) qs.set('lat', String(opts.lat))
  if (opts.lng != null) qs.set('lng', String(opts.lng))
  if (opts.dayOfWeek != null && opts.startTime) {
    qs.set('day', nextDateForDay(opts.dayOfWeek))
    qs.set('time', opts.startTime)
  }
  try {
    const res = await fetch(`/nx/weather?${qs.toString()}`)
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('application/json')) return null
    const data = (await res.json()) as Weather
    return data
  } catch {
    return null
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Weather × Venue scoring.
   We keep this *very* light per spec — we do NOT rewrite Google's ordering,
   we only nudge it. The score modifier is small (max ±0.08) so a great venue
   never loses to a mediocre one because of a 30 % rain chance.
   ────────────────────────────────────────────────────────────────────────── */

const OUTDOOR_RE =
  /\b(park|garden|beach|trail|outdoor|hike|hiking|riverside|seafront|promenade|pier|playground)\b/i

const INDOOR_RE =
  /\b(bar|pub|restaurant|cafe|coffee|bistro|brewery|cocktail|club|cinema|theatre|museum|gallery|bowling)\b/i

export function classifyOutdoorness(venue: Venue): 'outdoor' | 'indoor' | 'unknown' {
  const cat = (venue.category ?? '').toLowerCase()
  if (!cat) return 'unknown'
  if (OUTDOOR_RE.test(cat)) return 'outdoor'
  if (INDOOR_RE.test(cat)) return 'indoor'
  return 'unknown'
}

/**
 * Returns a small additive bump to the venue's existing `score`.
 * Wet weather → indoor venues get a tiny boost, outdoor venues a tiny demote.
 * Dry & mild  → outdoor venues get a tiny boost.
 * Anything unknown stays neutral.
 */
export function weatherScoreBoost(weather: Weather | null, venue: Venue): number {
  // Never let a failed-fetch placeholder ('cloudy', null fields) re-rank
  // venues — that would amount to inventing weather influence.
  if (!weather || weather.error) return 0
  const kind = classifyOutdoorness(venue)
  if (kind === 'unknown') return 0

  const precip = weather.precipitation_pct ?? 0
  const wet =
    precip >= 50 ||
    weather.condition === 'rain' ||
    weather.condition === 'storm' ||
    weather.condition === 'snow'

  const dryAndMild =
    !wet &&
    (weather.condition === 'clear' || weather.condition === 'cloudy') &&
    (weather.temperature_c == null || weather.temperature_c >= 12)

  if (wet) return kind === 'indoor' ? 0.08 : -0.08
  if (dryAndMild) return kind === 'outdoor' ? 0.05 : 0
  return 0
}

/**
 * Build a single bullet for the venue detail sheet's "Why this fits your
 * group" list — but only when we actually have real weather data.
 * Returns null when no honest sentence can be made.
 */
export function buildWeatherReason(
  weather: Weather | null,
  venue: Venue,
  vibe: Vibe,
): string | null {
  if (!weather || weather.error) return null
  const kind = classifyOutdoorness(venue)
  const precip = weather.precipitation_pct
  const wet =
    (precip != null && precip >= 50) ||
    weather.condition === 'rain' ||
    weather.condition === 'storm' ||
    weather.condition === 'snow'

  if (wet && (kind === 'indoor' || vibe !== 'activity')) {
    if (precip != null) return `${precip}% chance of rain — good indoor pick.`
    return 'Wet outside — good indoor pick.'
  }
  if (!wet && kind === 'outdoor' && weather.temperature_c != null) {
    return `${weather.short_label} — nice conditions for an outdoor spot.`
  }
  if (weather.is_forecast && weather.short_label) {
    return `Forecast around your Golden Window: ${weather.short_label.toLowerCase()}.`
  }
  return null
}
