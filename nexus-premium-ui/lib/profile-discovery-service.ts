import { nexusApi } from './nexus-api'
import { socialProfileFromApi, type SocialProfile } from './social-service'

export interface PublicProfile {
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  favourite_activities: string[]
}

export async function getPublicProfile(username: string): Promise<PublicProfile | null> {
  const value=username.trim().replace(/^@/,'')
  if(!value) return null
  try{
    const {profile}=await nexusApi<{profile:Record<string,unknown>}>(`/v1/users/username/${encodeURIComponent(value)}`)
    const social=socialProfileFromApi(profile)
    return {user_id:social.id,username:social.username??value,display_name:social.display_name,avatar_url:social.avatar_url,bio:social.bio,favourite_activities:social.favourite_activities}
  }catch(error){console.error('[profile discovery]',error);return null}
}

export async function searchGroupMemberCandidates(groupId:string,query:string):Promise<SocialProfile[]>{
  const q=query.trim().replace(/^@/,'')
  if(q.length<2)return []
  const {users}=await nexusApi<{users:Array<Record<string,unknown>>}>(`/v1/circles/${encodeURIComponent(groupId)}/members/candidates?q=${encodeURIComponent(q)}`)
  return users.map(socialProfileFromApi)
}

export async function addGroupMemberByUsername(groupId:string,username:string){
  const result=await nexusApi<Record<string,unknown>>(`/v1/circles/${encodeURIComponent(groupId)}/members/by-username`,{method:'POST',body:JSON.stringify({username:username.trim().replace(/^@/,'')})})
  return result
}
