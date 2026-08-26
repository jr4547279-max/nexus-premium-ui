import { supabase } from './supabase'
import type { SocialProfile } from './social-service'

export type FriendStatus = 'self' | 'friends' | 'request_sent' | 'request_received' | 'none'

export async function getFriendStatus(otherUserId: string): Promise<FriendStatus> {
  const { data, error } = await supabase.rpc('get_friend_status', { p_other_user_id: otherUserId })
  if (error) {
    console.error('[friend-service] getFriendStatus:', error.message)
    return 'none'
  }
  return (data as FriendStatus) ?? 'none'
}

export async function sendFriendRequest(addresseeId: string): Promise<string> {
  const { data, error } = await supabase.rpc('send_friend_request', { p_addressee_id: addresseeId })
  if (error) {
    console.error('[friend-service] sendFriendRequest:', error.message)
    return 'error'
  }
  return String(data ?? 'error')
}

export async function acceptFriendRequest(requesterId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('accept_friend_request', { p_requester_id: requesterId })
  if (error) {
    console.error('[friend-service] acceptFriendRequest:', error.message)
    return false
  }
  return Boolean(data)
}

export async function declineFriendRequest(requesterId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('decline_friend_request', { p_requester_id: requesterId })
  if (error) {
    console.error('[friend-service] declineFriendRequest:', error.message)
    return false
  }
  return Boolean(data)
}

export async function cancelFriendRequest(addresseeId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancel_friend_request', { p_addressee_id: addresseeId })
  if (error) {
    console.error('[friend-service] cancelFriendRequest:', error.message)
    return false
  }
  return Boolean(data)
}

export async function removeFriend(otherUserId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('remove_friend', { p_other_user_id: otherUserId })
  if (error) {
    console.error('[friend-service] removeFriend:', error.message)
    return false
  }
  return Boolean(data)
}

function toSocialProfile(row: Record<string, unknown>): SocialProfile {
  return {
    id: String(row.user_id ?? row.id ?? ''),
    display_name: (row.display_name as string | null) ?? null,
    username: (row.username as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    location: (row.formatted_address as string | null) ?? null,
    favourite_activities: (row.favourite_activities as string[] | null) ?? [],
    created_at: String(row.created_at ?? ''),
  }
}

export async function getMyFriends(): Promise<SocialProfile[]> {
  const { data, error } = await supabase.rpc('get_my_friends')
  if (error) {
    console.error('[friend-service] getMyFriends:', error.message)
    return []
  }
  return (data ?? []).map((row: Record<string, unknown>) => toSocialProfile(row))
}

export async function getIncomingFriendRequests(): Promise<SocialProfile[]> {
  const { data, error } = await supabase.rpc('get_incoming_friend_requests')
  if (error) {
    console.error('[friend-service] getIncomingFriendRequests:', error.message)
    return []
  }
  return (data ?? []).map((row: Record<string, unknown>) => toSocialProfile(row))
}
