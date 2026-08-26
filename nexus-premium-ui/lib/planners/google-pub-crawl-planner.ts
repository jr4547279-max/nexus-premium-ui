import type { PlannerDefinition, PlannerResult, PlannerScore, PlannerVenue } from './types'

type PlacesVenue = {
  name?: string
  rating?: number | null
  rating_count?: number | null
  address?: string | null
  maps_url?: string | null
  price_level?: string | null
  distance_km?: number | null
  lat?: number | null
  lng?: number | null
  photo_url?: string | null
  open_now?: boolean | null
  description?: string | null
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

function addMinutes(value: string, minutes: number): string {
  const total = timeToMinutes(value) + minutes
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function format12h(value: string): string {
  const [h, m] = value.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
}

function priceLevel(value?: string | null): 1 | 2 | 3 | 4 {
  switch (value) {
    case 'PRICE_LEVEL_INEXPENSIVE': return 1
    case 'PRICE_LEVEL_MODERATE': return 2
    case 'PRICE_LEVEL_EXPENSIVE': return 3
    case 'PRICE_LEVEL_VERY_EXPENSIVE': return 4
    default: return 2
  }
}

function scoreVenue(venue: PlannerVenue, openNow: boolean | null): PlannerScore {
  const rating = Math.round((venue.rating / 5) * 20)
  const distance = Math.max(0, Math.round(20 - venue.distanceFromCentre * 5))
  const price = venue.priceLevel === 2 ? 15 : venue.priceLevel === 1 || venue.priceLevel === 3 ? 10 : 5
  const atmosphere = 12
  const openingHours = openNow === true ? 17 : openNow === false ? 5 : 10
  const capacity = 9
  const breakdown = { rating, distance, price, atmosphere, openingHours, capacity }
  return { total: Object.values(breakdown).reduce((sum, value) => sum + value, 0), breakdown }
}

function role(index: number, total: number): string {
  if (index === 0) return 'Opener'
  if (index === total - 1) return 'Finale'
  if (total === 3) return 'Mid-crawl'
  return index <= Math.ceil((total - 1) / 2) ? 'Building' : 'Peak'
}

function distanceKm(a: PlannerVenue, b: PlannerVenue): number {
  const R = 6371
  const rad = (n: number) => n * Math.PI / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

async function fetchRealPubs(lat: number, lng: number, radius: number): Promise<PlacesVenue[]> {
  const params = new URLSearchParams({
    vibe: 'pub',
    lat: String(lat),
    lng: String(lng),
    radius: String(Math.min(Math.max(radius, 1000), 10000)),
    limit: '12',
  })

  const response = await fetch(`/nx/places?${params.toString()}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Google Places proxy returned ${response.status}`)
  const payload = await response.json() as { venues?: PlacesVenue[]; error?: string }
  if (payload.error && (!payload.venues || payload.venues.length === 0)) {
    throw new Error(payload.error)
  }
  return payload.venues ?? []
}

async function fetchOsmFallback(lat: number, lng: number, radius: number): Promise<PlacesVenue[]> {
  const params = new URLSearchParams({
    vibe: 'pub',
    lat: String(lat),
    lng: String(lng),
    radius: String(Math.min(Math.max(radius, 1000), 10000)),
    limit: '12',
  })

  const response = await fetch(`/nx/places/osm?${params.toString()}`, { cache: 'no-store' })
  if (!response.ok) return []
  const payload = await response.json() as { venues?: PlacesVenue[] }
  return payload.venues ?? []
}

function mapVenue(place: PlacesVenue, index: number): { venue: PlannerVenue; openNow: boolean | null } | null {
  if (!place.name || place.lat == null || place.lng == null) return null
  const rating = place.rating ?? 0
  const venue: PlannerVenue & { photoUrl?: string | null; ratingCount?: number | null; description?: string | null } = {
    id: `google-pub-${index}-${place.lat}-${place.lng}`,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    rating,
    ratingKnown: rating > 0,
    priceLevel: priceLevel(place.price_level),
    priceLevelKnown: !!place.price_level,
    openingTime: '00:00',
    closingTime: '23:59',
    openingHoursKnown: place.open_now != null,
    atmosphere: ['social', 'welcoming'],
    tags: ['pub'],
    estimatedCostPerPerson: 0,
    capacity: 'medium',
    features: [],
    distanceFromCentre: place.distance_km ?? 0,
    mapsUrl: place.maps_url ?? null,
    address: place.address ?? null,
    website: null,
    isRealData: true,
    photoUrl: place.photo_url ?? null,
    ratingCount: place.rating_count ?? null,
    description: place.description ?? null,
  }
  return { venue, openNow: place.open_now ?? null }
}

export const googlePubCrawlPlanner: PlannerDefinition = {
  id: 'pub-crawl-planner',
  activityId: 'pub-crawl',
  kind: 'venue',
  name: 'Pub Crawl Planner',
  description: 'Plans a pub crawl using real Google Places venues around the Golden Window.',

  async plan(request): Promise<PlannerResult> {
    const { goldenWindow, groupLocation, locationName, desiredStops = 4, budgetPreference = 'medium' } = request
    if (!goldenWindow) throw new Error('No Golden Window has been created yet. Find a Golden Window before planning this pub crawl.')
    if (!groupLocation) throw new Error('Set a planning location first so Nexus can find real pubs near your group.')

    const radii = [...new Set([
      groupLocation.radiusMetres ?? 2000,
      3500,
      5000,
      8000,
    ])].map((r) => Math.min(Math.max(r, 1000), 10000))

    let places: PlacesVenue[] = []
    let source = 'Google Places'
    for (const radius of radii) {
      try {
        places = await fetchRealPubs(groupLocation.lat, groupLocation.lng, radius)
        if (places.length >= Math.max(2, desiredStops)) break
        if (places.length >= 2) break
      } catch {
        places = []
      }
    }

    if (places.length < 2) {
      source = 'OpenStreetMap'
      for (const radius of radii) {
        places = await fetchOsmFallback(groupLocation.lat, groupLocation.lng, radius)
        if (places.length >= Math.max(2, desiredStops) || places.length >= 2) break
      }
    }

    const mapped = places
      .map(mapVenue)
      .filter((item): item is { venue: PlannerVenue; openNow: boolean | null } => item !== null)

    if (mapped.length < 2) {
      throw new Error('Nexus could not find enough real pubs at this location right now. Try moving the planning location or choosing a different area.')
    }

    mapped.sort((a, b) => scoreVenue(b.venue, b.openNow).total - scoreVenue(a.venue, a.openNow).total)
    const selected = mapped.slice(0, Math.min(Math.max(2, desiredStops), mapped.length))

    const ordered: typeof selected = []
    const remaining = [...selected]
    ordered.push(remaining.shift()!)
    while (remaining.length) {
      const last = ordered[ordered.length - 1].venue
      let bestIndex = 0
      let bestDistance = Infinity
      remaining.forEach((candidate, index) => {
        const d = distanceKm(last, candidate.venue)
        if (d < bestDistance) { bestDistance = d; bestIndex = index }
      })
      ordered.push(remaining.splice(bestIndex, 1)[0])
    }

    let currentTime = goldenWindow.start_time
    const stops = ordered.map((item, index) => {
      const previous = index > 0 ? ordered[index - 1].venue : null
      const walking = previous ? Math.max(1, Math.round(distanceKm(previous, item.venue) / 0.083)) : 0
      if (index > 0) currentTime = addMinutes(currentTime, walking)
      const arrivalTime = currentTime
      const departureTime = addMinutes(arrivalTime, 42)
      currentTime = departureTime
      const score = scoreVenue(item.venue, item.openNow)
      return {
        order: index + 1,
        venue: item.venue,
        arrivalTime,
        departureTime,
        walkingFromPrevious: walking,
        distanceFromPrevious: previous ? Math.round(distanceKm(previous, item.venue) * 100) / 100 : 0,
        score,
        role: role(index, ordered.length),
        reason: index === 0 ? 'Close to your start point · real pub' : 'On your route · real pub',
      }
    })

    const totalWalkingMinutes = stops.reduce((sum, stop) => sum + stop.walkingFromPrevious, 0)
    const totalDistanceKm = Math.round(stops.reduce((sum, stop) => sum + stop.distanceFromPrevious, 0) * 10) / 10
    const durationMinutes = stops.length * 42 + totalWalkingMinutes
    const overallScore = Math.round(stops.reduce((sum, stop) => sum + stop.score.total, 0) / stops.length)
    const matchQuality = (goldenWindow.match_quality ?? 'partial') as 'perfect' | 'strong' | 'partial' | 'compromise'
    const groupMatchPercent = goldenWindow.available_member_count != null && goldenWindow.total_member_count
      ? Math.round(goldenWindow.available_member_count / goldenWindow.total_member_count * 100)
      : undefined

    return {
      kind: 'venue',
      title: locationName ? `🍺 ${locationName} Pub Crawl` : '🍺 Nexus Pub Crawl',
      subtitle: `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][goldenWindow.day_of_week] ?? 'Saturday'} · ${format12h(goldenWindow.start_time)}`,
      activityId: 'pub-crawl',
      durationMinutes,
      estimatedCostLabel: budgetPreference === 'low' ? '£' : budgetPreference === 'high' ? '£££' : '££',
      totalDistanceKm,
      walkingMinutes: totalWalkingMinutes,
      stops,
      overallScore,
      explanation: `Nexus selected ${stops.length} real ${source} pubs, scored for proximity, rating, budget and the Golden Window, then ordered to minimise backtracking across ${totalDistanceKm} km.`,
      warnings: source === 'OpenStreetMap' ? ['Google Places was unavailable, so Nexus used real OpenStreetMap pub data instead.'] : [],
      generatedAt: new Date().toISOString(),
      goldenWindowQuality: matchQuality,
      groupMatchPercent,
      dataSource: 'real',
      providerName: source,
    }
  },
}
