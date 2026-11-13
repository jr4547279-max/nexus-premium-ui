import { nexusApi } from './nexus-api'
import type { Venue } from './venue-service'

export interface NexusPlan {
  id: string
  circle_id: string
  created_by: string
  title: string
  starts_at: string
  ends_at: string | null
  status: 'proposed' | 'confirmed' | 'cancelled'
}

export async function createGoldenWindowPlan(
  circleId: string,
  input: {
    title: string
    startsAt: string
    endsAt: string
    window: { dayOfWeek: number; startTime: string; endTime: string }
  },
): Promise<NexusPlan> {
  const { plan } = await nexusApi<{ plan: NexusPlan }>(`/v1/circles/${encodeURIComponent(circleId)}/plans`, {
    method: 'POST',
    body: JSON.stringify({ ...input, goldenWindow: true }),
  })
  return plan
}

export async function recordVenueVote(planId: string, venue: Venue, vote: 1 | -1 | 0, existingVenueId?: string): Promise<string> {
  const { venue_id } = await nexusApi<{ ok: boolean; venue_id: string }>(`/v1/plans/${encodeURIComponent(planId)}/votes`, {
    method: 'POST',
    body: JSON.stringify({
      venueId: existingVenueId,
      providerVenueId: venue.id ?? venue.maps_url ?? `${venue.name}:${venue.address ?? ''}`,
      venueName: venue.name,
      venueType: venue.category,
      location: venue.lat != null && venue.lng != null ? { lat: venue.lat, lng: venue.lng, address: venue.address } : null,
      vote,
    }),
  })
  return venue_id
}

export async function confirmNexusPlan(planId: string, venueId: string): Promise<void> {
  await nexusApi(`/v1/plans/${encodeURIComponent(planId)}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ venueId }),
  })
}
