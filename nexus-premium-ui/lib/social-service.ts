// ─────────────────────────────────────────────────────────────────────────────
// Nexus Social Service
// ─────────────────────────────────────────────────────────────────────────────
// Handles: username validation, social profile CRUD, avatar upload, user search.
// All writes are scoped to the authenticated user via Supabase RLS.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'

// ── Public profile shape (readable by any authenticated user) ─────────────────

export interface SocialProfile {
  id:                   string
  display_name:         string | null
  username:             string | null
  avatar_url:           string | null
  bio:                  string | null
  location:             string | null   // formatted_address from profiles
  favourite_activities: string[]
  created_at:           string
}

export interface SocialProfileUpdate {
  display_name?:         string
  username?:             string | null
  bio?:                  string
  avatar_url?:           string | null
  favourite_activities?: string[]
}

// ── Username rules ─────────────────────────────────────────────────────────────

/** 3–20 characters: letters, digits, underscores only. */
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

export type UsernameError =
  | 'too_short'
  | 'too_long'
  | 'invalid_chars'
  | 'taken'
  | null

/**
 * Synchronous format check. Returns an error code or null if format is valid.
 */
export function validateUsernameFormat(raw: string): UsernameError {
  const s = raw.replace(/^@/, '')    // strip leading @ if present
  if (s.length < 3)  return 'too_short'
  if (s.length > 20) return 'too_long'
  if (!USERNAME_RE.test(s)) return 'invalid_chars'
  return null
}

export function usernameErrorMessage(err: UsernameError): string {
  switch (err) {
    case 'too_short':     return 'Username must be at least 3 characters'
    case 'too_long':      return 'Username must be 20 characters or fewer'
    case 'invalid_chars': return 'Letters, numbers and underscores only'
    case 'taken':         return 'This username is already taken'
    default:              return ''
  }
}

/**
 * Check DB uniqueness. Returns true when the username is available.
 * Pass `currentUserId` so a user can "keep" their existing username without error.
 */
export async function checkUsernameAvailable(
  username:       string,
  currentUserId?: string,
): Promise<boolean> {
  const clean = username.replace(/^@/, '').toLowerCase()
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', clean)
    .limit(1)

  if (error) return true   // fail-open: don't block the user on a DB error
  if (!data?.length) return true
  // Available if the only match is the current user themselves
  return currentUserId ? data[0].id === currentUserId : false
}

// ── Social profile CRUD ────────────────────────────────────────────────────────

/**
 * Update social identity fields on the caller's own profile row.
 * Strips the leading @ from username before writing.
 */
export async function updateSocialProfile(
  userId:  string,
  updates: SocialProfileUpdate,
): Promise<SocialProfile | null> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if ('display_name'         in updates) payload.display_name         = updates.display_name
  if ('bio'                  in updates) payload.bio                  = updates.bio
  if ('avatar_url'           in updates) payload.avatar_url           = updates.avatar_url
  if ('favourite_activities' in updates) payload.favourite_activities = updates.favourite_activities
  if ('username' in updates) {
    payload.username = updates.username
      ? updates.username.replace(/^@/, '').toLowerCase()
      : null
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('id, display_name, username, avatar_url, bio, formatted_address, favourite_activities, created_at')
    .single()

  if (error) {
    console.error('[social-service] updateSocialProfile:', error.message)
    return null
  }
  return toSocialProfile(data)
}

/**
 * Fetch the public profile of any user by their ID.
 */
export async function getPublicProfile(userId: string): Promise<SocialProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url, bio, formatted_address, favourite_activities, created_at')
    .eq('id', userId)
    .single()
  if (error || !data) return null
  return toSocialProfile(data)
}

/**
 * Full-text search across display_name and username.
 * Returns up to `limit` results, excluding the caller's own row.
 */
export async function searchUsers(
  query:          string,
  currentUserId?: string,
  limit           = 20,
): Promise<SocialProfile[]> {
  const q = query.trim().replace(/^@/, '')
  if (!q) return []

  // Search username and display_name with ilike for case-insensitive partial match
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url, bio, formatted_address, favourite_activities, created_at')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .neq('id', currentUserId ?? '00000000-0000-0000-0000-000000000000')
    .limit(limit)

  if (error) {
    console.error('[social-service] searchUsers:', error.message)
    return []
  }
  return (data ?? []).map(toSocialProfile)
}

// ── Avatar upload ──────────────────────────────────────────────────────────────

const AVATAR_BUCKET = 'avatars'

/**
 * Crop a File to a square JPEG blob using the browser Canvas API.
 * Output is 400×400 px at 90% quality — compact enough for avatar use.
 */
async function cropToSquareJpeg(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img  = new Image()
    const burl = URL.createObjectURL(file)
    img.onload = () => {
      const size   = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width  = 400
      canvas.height = 400
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas context unavailable')); return }
      ctx.drawImage(
        img,
        (img.width  - size) / 2,  // source x offset (centres crop)
        (img.height - size) / 2,  // source y offset
        size, size,                // source crop size (square)
        0, 0, 400, 400,            // dest full canvas
      )
      URL.revokeObjectURL(burl)
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('toBlob failed')),
        'image/jpeg',
        0.9,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(burl); reject(new Error('Image load failed')) }
    img.src = burl
  })
}

/**
 * Upload a new avatar for the given user.
 * - Crops to 400×400 square JPEG client-side.
 * - Upserts to `avatars/{userId}/avatar.jpg` (overwrites previous).
 * - Returns the public URL, or null on error.
 *
 * Requires the `avatars` bucket to be public in Supabase Storage.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string | null> {
  let blob: Blob
  try {
    blob = await cropToSquareJpeg(file)
  } catch (err) {
    console.error('[social-service] cropToSquareJpeg:', err)
    return null
  }

  const path = `${userId}/avatar.jpg`
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert:      true,
    })

  if (error) {
    console.error('[social-service] uploadAvatar storage:', error.message)
    return null
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  // Append a cache-busting timestamp so the browser loads the new image
  return `${data.publicUrl}?t=${Date.now()}`
}

/**
 * Delete the user's avatar from storage.
 * Non-fatal: logs but does not throw on error.
 */
export async function deleteAvatar(userId: string): Promise<void> {
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .remove([`${userId}/avatar.jpg`])
  if (error) console.warn('[social-service] deleteAvatar:', error.message)
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function toSocialProfile(row: Record<string, unknown>): SocialProfile {
  return {
    id:                   String(row.id ?? ''),
    display_name:         (row.display_name as string | null) ?? null,
    username:             (row.username as string | null) ?? null,
    avatar_url:           (row.avatar_url as string | null) ?? null,
    bio:                  (row.bio as string | null) ?? null,
    location:             (row.formatted_address as string | null) ?? null,
    favourite_activities: (row.favourite_activities as string[] | null) ?? [],
    created_at:           String(row.created_at ?? ''),
  }
}
