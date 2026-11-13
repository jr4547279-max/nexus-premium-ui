import { nexusApi } from './nexus-api'
import { socialProfileFromApi, type SocialProfile } from './social-service'

export type FriendStatus = 'self' | 'friends' | 'request_sent' | 'request_received' | 'none'
const path = (id: string) => `/v1/friends/${encodeURIComponent(id)}`

export async function getFriendStatus(otherUserId: string): Promise<FriendStatus> {
  try { return (await nexusApi<{status:FriendStatus}>(`${path(otherUserId)}/status`)).status }
  catch { return 'none' }
}
export async function sendFriendRequest(addresseeId: string): Promise<string> {
  try { return (await nexusApi<{status:string}>('/v1/friends/requests',{method:'POST',body:JSON.stringify({userId:addresseeId})})).status }
  catch(error){ console.error('[friend-service] sendFriendRequest',error); return 'error' }
}
export async function acceptFriendRequest(requesterId: string): Promise<boolean> {
  try { await nexusApi(`${path(requesterId)}/accept`,{method:'POST',body:'{}'}); return true } catch { return false }
}
export async function declineFriendRequest(requesterId: string): Promise<boolean> {
  try { await nexusApi(`${path(requesterId)}/decline`,{method:'POST',body:'{}'}); return true } catch { return false }
}
export async function cancelFriendRequest(addresseeId: string): Promise<boolean> {
  try { await nexusApi(`${path(addresseeId)}/cancel`,{method:'POST',body:'{}'}); return true } catch { return false }
}
export async function removeFriend(otherUserId: string): Promise<boolean> {
  try { return (await nexusApi<{ok:boolean}>(path(otherUserId),{method:'DELETE'})).ok } catch { return false }
}

export async function getMyFriends(): Promise<SocialProfile[]> {
  try { return (await nexusApi<{friends:Array<Record<string,unknown>>}>('/v1/friends')).friends.map(socialProfileFromApi) } catch(error){ console.error('[friend-service] getMyFriends',error); return [] }
}
export async function getIncomingFriendRequests(): Promise<SocialProfile[]> {
  try { return (await nexusApi<{requests:Array<Record<string,unknown>>}>('/v1/friends/requests')).requests.map(socialProfileFromApi) } catch(error){ console.error('[friend-service] getIncomingFriendRequests',error); return [] }
}
