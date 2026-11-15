import type { PlannerVenue, VenueProvider } from '../types'
import { getOsmTagsForActivity } from './venue-provider'
import { hasValidProviderLocation } from '../../venue-location'
import { buildOverpassQuery, fetchOverpassElements, getOverpassEndpoints, isValidSearchLocation, normalizeOverpassElements } from './overpass-client.mjs'
import { evaluateOsmOpeningHours } from './osm-opening-hours.mjs'
import { buildVenuePhotoLookupUrl } from '../../commons-photo.mjs'

/** OSM-only adapter implementing the existing provider-neutral planner contract. */
export class OpenStreetMapVenueProvider implements VenueProvider {
  constructor(private readonly radiusMetres = 1500, private readonly endpoints?: string[]) {}

  async getVenues(activityId: string, location?: { lat: number; lng: number }, meeting?: { dayOfWeek: number; startTime: string }): Promise<PlannerVenue[]> {
    return (await this.searchVenues(activityId, location, meeting)).venues
  }

  /** Normalized results plus cache state for API consumers that need to label stale data. */
  async searchVenues(
    activityId: string,
    location?: { lat: number; lng: number },
    meeting?: { dayOfWeek: number; startTime: string },
  ): Promise<{ venues: PlannerVenue[]; cached: boolean; stale: boolean }> {
    if (!location || !isValidSearchLocation(location)) return { venues: [], cached: false, stale: false }
    const tagSets = getOsmTagsForActivity(activityId)
    if (tagSets.length === 0) return { venues: [], cached: false, stale: false }

    const radius = Math.min(20_000, Math.max(100, this.radiusMetres))
    const query = buildOverpassQuery(tagSets, location, radius)
    const endpoints = this.endpoints ?? getOverpassEndpoints(location)
    const result = await fetchOverpassElements(query, { endpoints })
    const venues = normalizeOverpassElements(result.elements, location, radius)
      .filter((venue) => hasValidProviderLocation(venue, location, radius))
      .map((venue) => {
        const hours = parseDailyOpeningHours(venue.openingHours)
        const openAtMeeting = meeting ? evaluateOsmOpeningHours(venue.openingHours, meeting.dayOfWeek, meeting.startTime) : null
        const category = venue.category ? [venue.category] : []
        const tags = ['cuisine', 'sport', 'music', 'amenity', 'leisure', 'genre', 'shop']
          .map((key) => venue.tags[key])
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
        return {
          id: venue.id,
          name: venue.name,
          lat: venue.lat,
          lng: venue.lng,
          rating: 0,
          ratingKnown: false,
          priceLevel: 2,
          priceLevelKnown: false,
          estimatedCostPerPerson: 0,
          atmosphere: [],
          features: [],
          openingTime: hours?.open ?? '00:00',
          closingTime: hours?.close ?? '23:59',
          openingHoursKnown: hours !== null,
          openAtMeeting,
          openAtMeetingKnown: openAtMeeting !== null,
          capacity: 'medium',
          tags: [...new Set([...category, ...tags])],
          distanceFromCentre: venue.distanceKm,
          mapsUrl: venue.mapUrl,
          photoLookupUrl: buildVenuePhotoLookupUrl(venue.tags),
          address: venue.address,
          website: venue.website,
          isRealData: true,
        } satisfies PlannerVenue
      })
    return { venues, cached: result.cached, stale: result.stale }
  }
}

/** Parse only plain daily ranges and explicit 24/7; complex OSM schedules remain unknown. */
function parseDailyOpeningHours(value: string | null): { open: string; close: string } | null {
  if (!value) return null
  if (value.trim() === '24/7') return { open: '00:00', close: '23:59' }
  const match = value.trim().match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/)
  if (!match) return null
  const [openHour, openMinute] = match[1]!.split(':').map(Number)
  const [closeHour, closeMinute] = match[2]!.split(':').map(Number)
  if (openHour! > 23 || closeHour! > 23 || openMinute! > 59 || closeMinute! > 59) return null
  return { open: `${String(openHour).padStart(2, '0')}:${String(openMinute).padStart(2, '0')}`, close: `${String(closeHour).padStart(2, '0')}:${String(closeMinute).padStart(2, '0')}` }
}
