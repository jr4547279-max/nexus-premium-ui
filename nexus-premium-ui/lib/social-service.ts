import { nexusApi, nexusApiOrigin } from './nexus-api'

export interface SocialProfile {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  bio: string | null
  location: string | null
  favourite_activities: string[]
  created_at: string
}
export interface SocialProfileUpdate {
  display_name?: string
  username?: string | null
  bio?: string
  avatar_url?: string | null
  favourite_activities?: string[]
}
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/
export type UsernameError = 'too_short' | 'too_long' | 'invalid_chars' | 'taken' | null

export function validateUsernameFormat(raw: string): UsernameError {
  const value = raw.replace(/^@/, '')
  if (value.length < 3) return 'too_short'
  if (value.length > 20) return 'too_long'
  return USERNAME_RE.test(value) ? null : 'invalid_chars'
}

export function usernameErrorMessage(error: UsernameError): string {
  return error === 'too_short' ? 'Username must be at least 3 characters'
    : error === 'too_long' ? 'Username must be 20 characters or fewer'
      : error === 'invalid_chars' ? 'Letters, numbers and underscores only'
        : error === 'taken' ? 'This username is already taken' : ''
}

function avatarUrl(userId: string, key: string | null | undefined): string | null {
  return key ? `${nexusApiOrigin}/v1/avatars/${encodeURIComponent(userId)}` : null
}

export function socialProfileFromApi(row: Record<string, unknown>): SocialProfile {
  const id = String(row.user_id ?? row.id ?? '')
  return {
    id,
    display_name: (row.display_name as string | null) ?? null,
    username: (row.username as string | null) ?? null,
    avatar_url: avatarUrl(id, row.avatar_url as string | null),
    bio: (row.bio as string | null) ?? null,
    location: (row.formatted_address as string | null ?? row.location as string | null) ?? null,
    favourite_activities: (row.favourite_activities as string[] | null) ?? [],
    created_at: String(row.created_at ?? ''),
  }
}

export async function checkUsernameAvailable(username: string, _currentUserId?: string): Promise<boolean> {
  const value = username.replace(/^@/, '').toLowerCase()
  try {
    const result = await nexusApi<{ available: boolean }>(`/v1/users/username-available?username=${encodeURIComponent(value)}`)
    return result.available
  } catch { return false }
}

export async function updateSocialProfile(userId: string, updates: SocialProfileUpdate): Promise<SocialProfile | null> {
  const payload: Record<string, unknown> = {}
  if ('display_name' in updates) payload.display_name = updates.display_name
  if ('bio' in updates) payload.bio = updates.bio
  if ('favourite_activities' in updates) payload.favourite_activities = updates.favourite_activities
  if ('username' in updates) payload.username = updates.username?.replace(/^@/, '').toLowerCase() ?? null
  try {
    await nexusApi('/v1/profile', { method: 'PATCH', body: JSON.stringify(payload) })
    const { profile } = await nexusApi<{ profile: Record<string, unknown> }>('/v1/profile')
    return String(profile.id) === userId ? socialProfileFromApi(profile) : null
  } catch (error) {
    console.error('[social-service] updateSocialProfile failed', error)
    return null
  }
}

export async function getPublicProfile(userId: string): Promise<SocialProfile | null> {
  try {
    const { profile } = await nexusApi<{ profile: Record<string, unknown> }>(`/v1/users/${encodeURIComponent(userId)}`)
    return socialProfileFromApi(profile)
  } catch { return null }
}

export async function searchUsers(query: string, _currentUserId?: string, limit = 20): Promise<SocialProfile[]> {
  const q = query.trim().replace(/^@/, '')
  if (q.length < 2) return []
  try {
    const { users } = await nexusApi<{ users: Array<Record<string, unknown>> }>(`/v1/users/search?q=${encodeURIComponent(q)}&limit=${Math.min(20, limit)}`)
    return users.map(socialProfileFromApi)
  } catch (error) {
    console.error('[social-service] searchUsers failed', error)
    return []
  }
}

async function cropToSquareJpeg(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => {
      const size = Math.min(image.width, image.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 400
      const context = canvas.getContext('2d')
      if (!context) { URL.revokeObjectURL(objectUrl); reject(new Error('Canvas is unavailable')); return }
      context.drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,400,400)
      URL.revokeObjectURL(objectUrl)
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image conversion failed')), 'image/jpeg', 0.88)
    }
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image could not be opened')) }
    image.src = objectUrl
  })
}

export async function uploadAvatar(userId: string, file: File): Promise<string | null> {
  try {
    const blob = await cropToSquareJpeg(file)
    if (blob.size > 2 * 1024 * 1024) throw new Error('Avatar must be no larger than 2 MB.')
    const form = new FormData()
    form.set('kind', 'avatar')
    form.set('file', blob, 'avatar.jpg')
    const { key } = await nexusApi<{ key: string }>('/v1/uploads', { method: 'POST', body: form })
    await nexusApi('/v1/profile', { method: 'PATCH', body: JSON.stringify({ avatarKey: key }) })
    return avatarUrl(userId, key)
  } catch (error) {
    console.error('[social-service] uploadAvatar failed', error)
    return null
  }
}

export async function deleteAvatar(userId: string): Promise<void> {
  try { await nexusApi(`/v1/avatars/${encodeURIComponent(userId)}`, { method: 'DELETE' }) }
  catch (error) { console.warn('[social-service] deleteAvatar failed', error) }
}
