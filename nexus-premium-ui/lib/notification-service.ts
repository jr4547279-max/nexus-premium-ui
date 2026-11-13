import { nexusApi } from './nexus-api'
import type { EventNotification, NotificationType } from './live-event-types'

export async function createNotification(
  eventId:string,
  type:NotificationType,
  payload:Record<string,unknown>={},
  _actorUserId?:string|null,
  targetUserId?:string|null,
):Promise<{notification:EventNotification|null;errorMessage:string|null}>{
  try{
    const {notification}=await nexusApi<{notification:EventNotification}>(`/v1/live-events/${encodeURIComponent(eventId)}/notifications`,{method:'POST',body:JSON.stringify({type,payload,targetUserId:targetUserId??null})})
    return {notification,errorMessage:null}
  }catch(error){
    const message=error instanceof Error?error.message:'Could not create notification.'
    console.error('[notification-service] createNotification failed',message)
    return {notification:null,errorMessage:message}
  }
}

export async function getEventNotifications(eventId:string,limit=50):Promise<EventNotification[]>{
  try{
    const {notifications}=await nexusApi<{notifications:Array<EventNotification & {payload_json?:string}>}>(`/v1/live-events/${encodeURIComponent(eventId)}/notifications?limit=${Math.min(50,limit)}`)
    return notifications.map((row)=>({...row,payload:row.payload??(row.payload_json?JSON.parse(row.payload_json):{})}))
  }catch(error){console.error('[notification-service] getEventNotifications failed',error);return []}
}

export async function notifyMemberArrived(eventId:string,userId:string,displayName:string,stopIndex:number,stopName:string):Promise<void>{
  await createNotification(eventId,'member_arrived',{display_name:displayName,stop_index:stopIndex,stop_name:stopName},userId)
}
export async function notifyMemberLate(eventId:string,userId:string,displayName:string,etaMinutes?:number):Promise<void>{
  await createNotification(eventId,'member_late',{display_name:displayName,eta_minutes:etaMinutes??null},userId)
}
export async function notifyNextStopSoon(eventId:string,minutesUntil:number,stopIndex:number,stopName:string):Promise<void>{
  await createNotification(eventId,'next_stop_soon',{minutes_until:minutesUntil,stop_index:stopIndex,stop_name:stopName})
}
export async function notifyMemberLeft(eventId:string,userId:string,displayName:string):Promise<void>{
  await createNotification(eventId,'member_left',{display_name:displayName},userId)
}

export function notificationLabel(n:EventNotification):string{
  const p=n.payload
  switch(n.type){
    case 'event_started':return `Event started: ${p.title??''}`
    case 'event_ended':return `Event ended: ${p.title??''}`
    case 'member_arrived':return `${p.display_name??'Someone'} arrived at ${p.stop_name??'the stop'}`
    case 'member_late':return `${p.display_name??'Someone'} is running late${p.eta_minutes?` (~${p.eta_minutes} min)`:''}`
    case 'member_left':return `${p.display_name??'Someone'} left the event`
    case 'next_stop_soon':return `Moving to ${p.stop_name??'next stop'} in ${p.minutes_until??'?'} min`
    case 'stop_skipped':return `Stop skipped — now at ${p.stop_name??`stop ${p.stop_index}`}`
    case 'stop_delayed':return `Stop delayed by ${p.delay_minutes??'?'} min`
    case 'plan_shared':return `Plan shared: ${p.title??''}`
    default:return n.type
  }
}
