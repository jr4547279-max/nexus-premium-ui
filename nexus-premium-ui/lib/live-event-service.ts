import { nexusApi } from './nexus-api'
import type { GoldenWindow } from './golden-window'
import type { LiveEvent,LiveEventWithDetails,EventStop,ScheduleLiveEventParams,ScheduleLiveEventResult,CancelLiveEventResult } from './live-event-types'

export function nextOccurrenceOf(win:Pick<GoldenWindow,'day_of_week'|'start_time'|'end_time'>,from:Date=new Date()):{start:Date;end:Date}{
  const [sh,sm]=win.start_time.split(':').map(Number),[eh,em]=win.end_time.split(':').map(Number)
  const candidate=new Date(from);const days=(win.day_of_week-from.getDay()+7)%7
  candidate.setDate(candidate.getDate()+days);candidate.setHours(sh??0,sm??0,0,0)
  if(candidate.getTime()-from.getTime()<60_000)candidate.setDate(candidate.getDate()+7)
  const start=new Date(candidate),end=new Date(candidate);end.setHours(eh??0,em??0,0,0);if(end<=start)end.setDate(end.getDate()+1)
  return {start,end}
}

function errorText(error:unknown){return error instanceof Error?error.message:'The live event request failed.'}
export async function scheduleLiveEvent(params:ScheduleLiveEventParams):Promise<ScheduleLiveEventResult>{
  try{
    const {event}=await nexusApi<{event:LiveEvent}>(`/v1/circles/${encodeURIComponent(params.groupId)}/live-events`,{method:'POST',body:JSON.stringify({windowStart:params.windowStart.toISOString(),windowEnd:params.windowEnd.toISOString(),goldenWindowData:params.goldenWindowData??{},title:params.title??'Group Meetup',description:params.description??null,stops:params.stops??[],invitedMemberIds:params.invitedMemberIds??[],arrivalRadiusM:params.arrivalRadiusM??50})})
    return {event,errorMessage:null}
  }catch(error){return {event:null,errorMessage:errorText(error)}}
}
export async function scheduleFromGoldenWindow(groupId:string,win:GoldenWindow,opts:{title?:string;description?:string;stops?:EventStop[];invitedMemberIds?:string[];arrivalRadiusM?:number;from?:Date}={}):Promise<ScheduleLiveEventResult>{
  const {start,end}=nextOccurrenceOf(win,opts.from)
  return scheduleLiveEvent({groupId,windowStart:start,windowEnd:end,goldenWindowData:win,title:opts.title,description:opts.description,stops:opts.stops,invitedMemberIds:opts.invitedMemberIds,arrivalRadiusM:opts.arrivalRadiusM})
}

export async function getLiveEvent(eventId:string):Promise<LiveEventWithDetails|null>{
  try{return (await nexusApi<{event:LiveEventWithDetails}>(`/v1/live-events/${encodeURIComponent(eventId)}`)).event}catch(error){console.error('[live-event-service] getLiveEvent',error);return null}
}
export async function listGroupLiveEvents(groupId:string):Promise<LiveEvent[]>{
  try{return (await nexusApi<{events:LiveEvent[]}>(`/v1/circles/${encodeURIComponent(groupId)}/live-events`)).events}catch(error){console.error('[live-event-service] listGroupLiveEvents',error);return []}
}
export async function getActiveEventForGroup(groupId:string):Promise<LiveEvent|null>{return (await listGroupLiveEvents(groupId)).find((event)=>event.status==='live')??null}
export async function getPendingEventForGroup(groupId:string):Promise<LiveEvent|null>{return (await listGroupLiveEvents(groupId)).filter((event)=>event.status==='pending').sort((a,b)=>a.window_start.localeCompare(b.window_start))[0]??null}

export async function cancelLiveEvent(eventId:string):Promise<CancelLiveEventResult>{
  try{await nexusApi(`/v1/live-events/${encodeURIComponent(eventId)}/cancel`,{method:'POST',body:'{}'});return {success:true,errorMessage:null}}
  catch(error){return {success:false,errorMessage:errorText(error)}}
}
async function transitions(){return nexusApi<{activated:number;deactivated:number}>('/v1/live-events/transitions',{method:'POST',body:'{}'})}
export async function activateDueEvents():Promise<number>{try{return (await transitions()).activated}catch{return 0}}
export async function deactivateExpiredEvents():Promise<number>{try{return (await transitions()).deactivated}catch{return 0}}
async function hostAction(eventId:string,action:string,body?:Record<string,unknown>):Promise<{event:LiveEvent|null;errorMessage:string|null}>{
  try{const {event}=await nexusApi<{event:LiveEvent}>(`/v1/live-events/${encodeURIComponent(eventId)}/${action}`,{method:'POST',body:JSON.stringify(body??{})});return {event,errorMessage:null}}
  catch(error){return {event:null,errorMessage:errorText(error)}}
}
export function skipStop(eventId:string){return hostAction(eventId,'skip-stop')}
export function delayStop(eventId:string,delayMinutes:number){return hostAction(eventId,'delay-stop',{delayMinutes})}
export function endEvent(eventId:string){return hostAction(eventId,'end')}
export async function sharePlan(eventId:string):Promise<{errorMessage:string|null}>{const result=await hostAction(eventId,'share');return {errorMessage:result.errorMessage}}
