import { supabase } from './supabase'

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  onboarding_completed: boolean
  onboarding_answers: Record<string, string[]>
  created_at: string
  updated_at: string
  // Location — added by supabase/migration.sql
  latitude:             number | null
  longitude:            number | null
  formatted_address:    string | null
  place_id:             string | null
  location_updated_at:  string | null
  // Social identity — added by supabase/social_migration.sql
  username:             string | null
  avatar_url:           string | null
  bio:                  string | null
  favourite_activities: string[] | null
}

export interface UserLocation {
  latitude:          number
  longitude:         number
  formatted_address: string
  place_id:          string | null
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) return null
  return data as Profile
}

export async function ensureProfile(userId: string, email: string): Promise<Profile | null> {
  const emailPrefix = email.split('@')[0] ?? ''
  const displayName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { id: userId, email, display_name: displayName, updated_at: new Date().toISOString() },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select()
    .single()
  if (error) return null
  return data as Profile
}

export async function updateProfile(
  userId: string,
  updates: Partial<Pick<Profile, 'display_name' | 'onboarding_completed' | 'onboarding_answers'>>,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single()
  if (error) return null
  return data as Profile
}

export async function updateUserLocation(
  userId: string,
  location: UserLocation,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      latitude:            location.latitude,
      longitude:           location.longitude,
      formatted_address:   location.formatted_address,
      place_id:            location.place_id,
      location_updated_at: new Date().toISOString(),
      updated_at:          new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single()
  if (error) {
    console.error('[profile-service] updateUserLocation failed', error)
    return null
  }
  return data as Profile
}

/**
 * Extract the city / town name from a full formatted address.
 * Used everywhere location is displayed publicly.
 *
 * "London, United Kingdom"        → "London"
 * "12 High St, Brighton, UK"      → "Brighton"
 * "51.5052, -0.0752"              → "51.5052, -0.0752"
 */
export function extractCity(address: string | null | undefined): string {
  if (!address) return ''
  const parts = address.split(',').map(p => p.trim()).filter(Boolean)
  if (!parts.length) return address
  const first = parts[0]
  // If first segment looks like a street (starts with digit or is unusually long), use second
  if (parts.length > 1 && (/^\d/.test(first) || first.split(' ').length > 4)) {
    return parts[1]
  }
  return first
}
