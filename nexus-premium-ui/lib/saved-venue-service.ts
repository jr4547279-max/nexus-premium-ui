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

/** Save a real venue to a specific group. */
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
      },
      { onConflict: 'user_id,group_id,place_id' },
    )

  if (error) {
    console.error('[saved-venue-service] saveVenueToGroup failed', error)
    return { ok: false, error: error.message }
  }

  return { ok: true, error: null }
}

export async function listGroupSavedVenues(groupId: string): Promise<SavedVenue[]> {
  const { data, error } = await supabase
    .from('saved_venues')
    .select('id, group_id, place_id, venue_name, venue_category, venue_photo_url, map_url, created_at')
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
