import { nexusApi } from './nexus-api'
import type { Venue } from './venue-service'

export interface GroupChoice { id: string; name: string; emoji: string | null }
export interface SavedVenue {
  id:string;group_id:string|null;place_id:string;venue_name:string;venue_category:string|null;venue_photo_url:string|null;map_url:string|null
  venue_lat:number|null;venue_lng:number|null;venue_address:string|null;venue_rating:number|null;created_at:string
}
function placeIdFor(venue:Venue){return venue.id||venue.maps_url||`${venue.name}|${venue.address||''}`}

export async function listVenueGroups():Promise<{groups:GroupChoice[];error:string|null}>{
  try{return {groups:(await nexusApi<{groups:GroupChoice[]}>('/v1/saved-venues')).groups,error:null}}
  catch(error){return {groups:[],error:error instanceof Error?error.message:'Could not load Circles.'}}
}
export async function listSavedVenueGroupIds(venue:Venue):Promise<string[]>{
  try{return (await nexusApi<{circle_ids:string[]}>(`/v1/saved-venues?placeId=${encodeURIComponent(placeIdFor(venue))}`)).circle_ids}
  catch{return []}
}
export async function saveVenueToGroup(groupId:string,venue:Venue):Promise<{ok:boolean;error:string|null}>{
  try{
    await nexusApi('/v1/saved-venues',{method:'POST',body:JSON.stringify({circleId:groupId,placeId:placeIdFor(venue),name:venue.name,category:venue.category,photoUrl:venue.photo_url,mapUrl:venue.maps_url,lat:venue.lat,lng:venue.lng,address:venue.address,rating:venue.rating})})
    return {ok:true,error:null}
  }catch(error){return {ok:false,error:error instanceof Error?error.message:'Could not save venue.'}}
}
export async function removeVenueFromGroupByPlace(groupId:string,venue:Venue):Promise<boolean>{
  try{await nexusApi(`/v1/saved-venues?circleId=${encodeURIComponent(groupId)}&placeId=${encodeURIComponent(placeIdFor(venue))}`,{method:'DELETE'});return true}catch{return false}
}
export async function listGroupSavedVenues(groupId:string):Promise<SavedVenue[]>{
  try{return (await nexusApi<{venues:SavedVenue[]}>(`/v1/saved-venues?circleId=${encodeURIComponent(groupId)}`)).venues}catch(error){console.error('[saved-venue-service] listGroupSavedVenues',error);return []}
}
export async function removeVenueFromGroup(id:string):Promise<boolean>{
  try{await nexusApi(`/v1/saved-venues/${encodeURIComponent(id)}`,{method:'DELETE'});return true}catch{return false}
}
