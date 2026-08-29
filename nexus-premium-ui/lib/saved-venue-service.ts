import { supabase } from './supabase'
import type { Venue } from './venue-service'

export interface GroupChoice {
  id: string
  name: string
  emoji: string | null
}

export interface SavedVenue {
  id: string
  group_id: string | null
  place_id: string
  venue_name: string
  venue_category: string | null
  venue_photo_url: string | null
  map_url: string | null
  venue_lat: number | null
  venue_lng: number | null
  venue_address: string | null
  venue_rating: number | null
  created_at: string
}

function placeIdFor(venue: Venue): string {
  return venue.id || venue.maps_url || `${venue.name}|${venue.address || ''}`
}

/** Return groups the signed-in member belongs to, ordered newest first. */
export async function listVenueGroups(): Promise<{ groups: GroupChoice[]; error: string | null }> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, emoji')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[saved-venue-service] listVenueGroups failed', error)
    return { groups: [], error: error.message }
  }

  return { groups: (data ?? []) as GroupChoice[], error: null }
}

/** Return the group IDs where this venue is already saved for the signed-in user. */
export async function listSavedVenueGroupIds(venue: Venue): Promise<string[]> {
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return []

  const placeId = placeIdFor(venue)
  const { data, error } = await supabase
    .from('saved_venues')
    .select('group_id')
    .eq('user_id', userId)
    .eq('place_id', placeId)

  if (error) {
    console.error('[saved-venue-service] listSavedVenueGroupIds failed', error)
    return []
  }

  return (data ?? [])
    .map((row) => row.group_id)
    .filter((id): id is string => typeof id === 'string')
}

/** Save a real venue to a specific group, retaining enough location data for route planning. */
export async function saveVenueToGroup(
  groupId: string,
  venue: Venue,
): Promise<{ ok: boolean; error: string | null }> {
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { ok: false, error: 'You need to be signed in to save a venue.' }

  const placeId = placeIdFor(venue)
  const { error } = await supabase
    .from('saved_venues')
    .upsert(
      {
        user_id: userId,
        group_id: groupId,
        place_id: placeId,
        venue_name: venue.name,
        venue_category: venue.category,
        venue_photo_url: venue.photo_url,
        map_url: venue.maps_url,
        venue_lat: venue.lat ?? null,
        venue_lng: venue.lng ?? null,
        venue_address: venue.address ?? null,
        venue_rating: venue.rating ?? null,
      },
      { onConflict: 'user_id,group_id,place_id' },
    )

  if (error) {
    console.error('[saved-venue-service] saveVenueToGroup failed', error)
    return { ok: false, error: error.message }
  }

  return { ok: true, error: null }
}

/** Remove a saved venue using the same user/group/place identity used by the upsert. */
export async function removeVenueFromGroupByPlace(groupId: string, venue: Venue): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return false

  const placeId = placeIdFor(venue)
  const { error } = await supabase
    .from('saved_venues')
    .delete()
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .eq('place_id', placeId)

  if (error) {
    console.error('[saved-venue-service] removeVenueFromGroupByPlace failed', error)
    return false
  }
  return true
}

export async function listGroupSavedVenues(groupId: string): Promise<SavedVenue[]> {
  const { data, error } = await supabase
    .from('saved_venues')
    .select('id, group_id, place_id, venue_name, venue_category, venue_photo_url, map_url, venue_lat, venue_lng, venue_address, venue_rating, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[saved-venue-service] listGroupSavedVenues failed', error)
    return []
  }

  return (data ?? []) as SavedVenue[]
}

export async function removeVenueFromGroup(id: string): Promise<boolean> {
  const { error } = await supabase.from('saved_venues').delete().eq('id', id)
  if (error) {
    console.error('[saved-venue-service] removeVenueFromGroup failed', error)
    return false
  }
  return true
}
