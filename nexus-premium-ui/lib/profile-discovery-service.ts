import { supabase } from './supabase'

export interface PublicProfile {
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  favourite_activities: string[]
}

export async function getPublicProfile(username: string): Promise<PublicProfile | null> {
  const q = username.trim()
  if (!q) return null
  const { data, error } = await supabase.rpc('get_public_profile_by_username', { p_username: q })
  if (error) {
    console.error('[profile discovery]', error)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  return row ?? null
}

export async function searchGroupMemberCandidates(groupId: string, query: string) {
  const { data, error } = await supabase.rpc('search_group_member_candidates', {
    p_group_id: groupId,
    p_query: query.trim(),
  })
  if (error) throw error
  return data ?? []
}

export async function addGroupMemberByUsername(groupId: string, username: string) {
  const { data, error } = await supabase.rpc('add_group_member_by_username', {
    p_group_id: groupId,
    p_username: username.trim(),
  })
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}
