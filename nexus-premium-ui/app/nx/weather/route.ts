import { NextResponse } from 'next/server'

/**
 * Phase 6A: Weather proxy.
 *
 * Server-side proxy in front of Open-Meteo's free forecast API. Open-Meteo
 * does not require an API key, so this route works out-of-the-box — we still
 * proxy through the server so:
 *   1. The browser sees a single same-origin endpoint (no CORS surprises).
 *   2. Caching can be centralised here (30 min TTL).
 *   3. Provider can be swapped (e.g. to OpenWeather) without touching the
 *      client by only editing this file.
 *
 * Query params:
 *   lat        — search latitude  (default: Eastbourne midpoint)
 *   lng        — search longitude (default: Eastbourne midpoint)
 *   day        — ISO date (YYYY-MM-DD) of the Golden Window day
 *   time       — start time HH:MM in 24h local — used to pick the hourly
 *                forecast slot closest to the Golden Window
 *
 * Response shape (always JSON; never throws to the client):
 *   {
 *     condition:        'clear' | 'cloudy' | 'rain' | 'snow' | 'storm' | 'fog' | 'night',
 *     temperature_c:    number | null,
 *     precipitation_pct:number | null,   // 0–100
 *     wind_kph:         number | null,
 *     short_label:      string,          // e.g. "Clear evening"
 *     is_forecast:      boolean,         // true = matched target hour; false = current snapshot
 *     target_iso:       string | null,   // the exact hour we picked, ISO
 *     provider:         'open-meteo',
 *     fallback_location:boolean,         // true if lat/lng were missing → Eastbourne
 *     error?:           string,
 *   }
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mirror of the Places fallback so weather and venues share a centre point.
const FALLBACK_LAT = 50.7686
const FALLBACK_LNG = 0.2906

interface CacheEntry {
  expiresAt: number
  payload: unknown
}
const CACHE = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30 * 60 * 1000

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'snow'
  | 'storm'
  | 'fog'
  | 'night'

interface WeatherPayload {
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

export async function GET(req: Request) {
  const url = new URL(req.url)
  const latRaw = url.searchParams.get('lat')
  const lngRaw = url.searchParams.get('lng')
  const day = url.searchParams.get('day')   // YYYY-MM-DD
  const time = url.searchParams.get('time') // HH:MM

  const latValid = latRaw != null && Number.isFinite(Number(latRaw))
  const lngValid = lngRaw != null && Number.isFinite(Number(lngRaw))
  const lat = latValid ? Number(latRaw) : FALLBACK_LAT
  const lng = lngValid ? Number(lngRaw) : FALLBACK_LNG
  // Truthful: any time we substituted the fallback (missing OR invalid input).
  const fallbackLocation = !latValid || !lngValid

  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}|${day ?? ''}|${time ?? ''}`
  const cached = CACHE.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload, { headers: { 'x-weather-cache': 'hit' } })
  }

  try {
    // Open-Meteo: hourly forecast for the next 7 days. No API key needed.
    const api = new URL('https://api.open-meteo.com/v1/forecast')
    api.searchParams.set('latitude', String(lat))
    api.searchParams.set('longitude', String(lng))
    api.searchParams.set(
      'hourly',
      'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,is_day',
    )
    api.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m,is_day')
    api.searchParams.set('timezone', 'auto')
    api.searchParams.set('forecast_days', '7')
    api.searchParams.set('wind_speed_unit', 'kmh')

    const res = await fetch(api.toString(), { cache: 'no-store' })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return jsonError(`Open-Meteo error ${res.status}: ${text.slice(0, 160)}`, fallbackLocation)
    }
    const data = (await res.json()) as OpenMeteoResponse

    const payload = buildPayload(data, day, time, fallbackLocation)

    CACHE.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload })
    return NextResponse.json(payload, { headers: { 'x-weather-cache': 'miss' } })
  } catch (e) {
    return jsonError(
      `Weather fetch failed: ${(e as Error).message ?? 'unknown'}`,
      fallbackLocation,
    )
  }
}

function jsonError(message: string, fallbackLocation: boolean) {
  const payload: WeatherPayload = {
    condition: 'cloudy',
    temperature_c: null,
    precipitation_pct: null,
    wind_kph: null,
    short_label: 'Weather unavailable',
    is_forecast: false,
    target_iso: null,
    provider: 'open-meteo',
    fallback_location: fallbackLocation,
    error: message,
  }
  return NextResponse.json(payload, { status: 200 })
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number
    weather_code?: number
    wind_speed_10m?: number
    is_day?: number
  }
  hourly?: {
    time: string[]
    temperature_2m: number[]
    precipitation_probability: number[]
    weather_code: number[]
    wind_speed_10m: number[]
    is_day: number[]
  }
}

function buildPayload(
  data: OpenMeteoResponse,
  day: string | null,
  time: string | null,
  fallbackLocation: boolean,
): WeatherPayload {
  // Try to pick the hourly slot closest to the Golden Window start.
  let idx = -1
  let targetIso: string | null = null
  if (day && time && data.hourly?.time?.length) {
    const targetStr = `${day}T${time.padStart(5, '0')}` // e.g. 2026-05-30T19:00
    const targetMs = Date.parse(targetStr)
    if (Number.isFinite(targetMs)) {
      let bestDelta = Infinity
      for (let i = 0; i < data.hourly.time.length; i++) {
        const t = Date.parse(data.hourly.time[i])
        if (!Number.isFinite(t)) continue
        const delta = Math.abs(t - targetMs)
        if (delta < bestDelta) {
          bestDelta = delta
          idx = i
        }
      }
      // Only treat as a real forecast match if within 2 hours.
      if (idx >= 0 && bestDelta <= 2 * 60 * 60 * 1000) {
        targetIso = data.hourly.time[idx]
      } else {
        idx = -1
      }
    }
  }

  if (idx >= 0 && data.hourly) {
    const wmo = data.hourly.weather_code[idx]
    const isDay = data.hourly.is_day[idx] === 1
    const condition = mapWmo(wmo, isDay)
    const precip = clampPct(data.hourly.precipitation_probability[idx])
    const temp = num(data.hourly.temperature_2m[idx])
    const wind = num(data.hourly.wind_speed_10m[idx])
    return {
      condition,
      temperature_c: temp,
      precipitation_pct: precip,
      wind_kph: wind,
      short_label: buildLabel(condition, precip, temp, isDay, true),
      is_forecast: true,
      target_iso: targetIso,
      provider: 'open-meteo',
      fallback_location: fallbackLocation,
    }
  }

  // Fall back to current conditions.
  if (data.current) {
    const wmo = data.current.weather_code ?? 0
    const isDay = (data.current.is_day ?? 1) === 1
    const condition = mapWmo(wmo, isDay)
    const temp = num(data.current.temperature_2m)
    const wind = num(data.current.wind_speed_10m)
    return {
      condition,
      temperature_c: temp,
      precipitation_pct: null,
      wind_kph: wind,
      short_label: buildLabel(condition, null, temp, isDay, false),
      is_forecast: false,
      target_iso: null,
      provider: 'open-meteo',
      fallback_location: fallbackLocation,
    }
  }

  return {
    condition: 'cloudy',
    temperature_c: null,
    precipitation_pct: null,
    wind_kph: null,
    short_label: 'Weather unavailable',
    is_forecast: false,
    target_iso: null,
    provider: 'open-meteo',
    fallback_location: fallbackLocation,
    error: 'Open-Meteo returned no usable data',
  }
}

function num(v: number | undefined): number | null {
  return v != null && Number.isFinite(v) ? Math.round(v * 10) / 10 : null
}

function clampPct(v: number | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return Math.max(0, Math.min(100, Math.round(v)))
}

// WMO weather codes — https://open-meteo.com/en/docs (under Weather variables)
function mapWmo(code: number, isDay: boolean): WeatherCondition {
  if (code === 0) return isDay ? 'clear' : 'night'
  if (code <= 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloudy'
}

function buildLabel(
  condition: WeatherCondition,
  precip: number | null,
  temp: number | null,
  isDay: boolean,
  isForecast: boolean,
): string {
  const tempStr = temp != null ? `${Math.round(temp)}°` : ''
  const partOfDay = isForecast
    ? (isDay ? 'day' : 'evening')
    : 'now'

  if (condition === 'storm') return `Thunderstorms${tempStr ? `, ${tempStr}` : ''}`
  if (condition === 'snow') return `Snow${tempStr ? `, ${tempStr}` : ''}`
  if (condition === 'fog') return `Foggy${tempStr ? `, ${tempStr}` : ''}`
  if (condition === 'rain') {
    if (precip != null && precip >= 60) return `Rain likely${tempStr ? `, ${tempStr}` : ''}`
    return `Showers possible${tempStr ? `, ${tempStr}` : ''}`
  }
  if (condition === 'cloudy') {
    if (precip != null && precip >= 40) return `Cloudy, showers possible${tempStr ? ` · ${tempStr}` : ''}`
    return `Cloudy ${partOfDay}${tempStr ? ` · ${tempStr}` : ''}`
  }
  if (condition === 'night') return `Clear night${tempStr ? ` · ${tempStr}` : ''}`
  return `Clear ${partOfDay}${tempStr ? ` · ${tempStr}` : ''}`
}
