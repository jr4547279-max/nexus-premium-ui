import { nexusApi, nexusApiOrigin } from './nexus-api'

export interface ProfilePreferences {
  theme?: 'light' | 'dark' | 'system'
  language?: 'en' | 'fr' | 'es' | 'de'
  notifications?: boolean
}

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  onboarding_completed: boolean
  onboarding_answers: Record<string, string[]>
  preferences: ProfilePreferences | null
  created_at: string
  updated_at: string
  latitude: number | null
  longitude: number | null
  formatted_address: string | null
  place_id: string | null
  location_updated_at: string | null
  username: string | null
  avatar_url: string | null
  bio: string | null
  favourite_activities: string[] | null
}

export interface UserLocation {
  latitude: number
  longitude: number
  formatted_address: string
  place_id: string | null
}

type ProfileResponse = { profile: Profile }

export async function getProfile(userId?: string): Promise<Profile | null> {
  try {
    const { profile } = await nexusApi<ProfileResponse>('/v1/profile')
    if (userId && profile.id !== userId) return null
    if (profile.avatar_url?.startsWith('/v1/')) profile.avatar_url = `${nexusApiOrigin}${profile.avatar_url}`
    return profile
  } catch {
    return null
  }
}

export async function ensureProfile(_userId: string, _email: string): Promise<Profile | null> {
  return getProfile()
}

export async function updateProfile(
  _userId: string,
  updates: Partial<Pick<Profile, 'display_name' | 'onboarding_completed' | 'onboarding_answers' | 'preferences'>>,
): Promise<Profile | null> {
  try {
    await nexusApi('/v1/profile', { method: 'PATCH', body: JSON.stringify(updates) })
    return getProfile()
  } catch (error) {
    console.error('[profile-service] updateProfile failed', error)
    return null
  }
}

export async function updateUserPreferences(userId: string, preferences: ProfilePreferences): Promise<Profile | null> {
  const existing = await getProfile(userId)
  return updateProfile(userId, { preferences: { ...(existing?.preferences ?? {}), ...preferences } })
}

export async function updateUserLocation(userId: string, location: UserLocation): Promise<Profile | null> {
  try {
    await nexusApi('/v1/profile', { method: 'PATCH', body: JSON.stringify({ location }) })
    return getProfile(userId)
  } catch (error) {
    console.error('[profile-service] updateUserLocation failed', error)
    return null
  }
}

export function extractCity(address: string | null | undefined): string {
  if (!address) return ''
  const parts = address.split(',').map(p => p.trim()).filter(Boolean)
  if (!parts.length) return address
  const first = parts[0]
  if (parts.length > 1 && (/^\d/.test(first) || first.split(' ').length > 4)) return parts[1]!
  return first
}
