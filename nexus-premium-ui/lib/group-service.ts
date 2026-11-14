import { nexusApi } from './nexus-api'
import type { PlanningLocation } from './types/planning-location'
import type { PlanningLocationSource } from './types/planning-location'

export interface Group {
  id: string
  name: string
  emoji: string | null
  activity_id: string | null
  invite_code: string | null
  created_by: string
  created_at: string
  updated_at: string
  timezone?: string
  // ── Planning location (nullable until set) ────────────────────────────────
  planning_location_lat?:     number | null
  planning_location_lng?:     number | null
  planning_location_name?:    string | null
  planning_location_address?: string | null
  planning_location_source?:  string | null
  // ── Location Intelligence (populated after /nx/location/resolve) ──────────
  planning_radius_metres?:    number | null
  planning_area_type?:        string | null
  planning_neighborhood?:     string | null
  planning_city?:             string | null
}

export interface GroupSummary {
  id: string
  name: string
  emoji: string
  activity_id: string | null
  memberCount: number
  members: { name: string; avatar: string }[]
  pendingConfirmations: number
  hasGoldenWindow: boolean
}

export interface GroupMember {
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
  display_name: string | null
  email: string | null
}

export interface InvitePreview {
  id: string
  name: string
  emoji: string
  member_count: number
}

export interface CreateGroupResult {
  group: Group | null
  errorMessage: string | null
}

// ── Planning location helpers ─────────────────────────────────────────────────

/**
 * Extract a typed PlanningLocation from a Group row.
 * Returns null when lat/lng are absent.
 */
export function extractPlanningLocation(group: Group): PlanningLocation | null {
  const { planning_location_lat: lat, planning_location_lng: lng } = group
  if (lat == null || lng == null) return null

  const location: PlanningLocation = {
    lat,
    lng,
    name:    group.planning_location_name    ?? '',
    address: group.planning_location_address ?? '',
    source:  (group.planning_location_source as PlanningLocationSource) ?? 'saved',
  }

  // Attach intelligence fields when present
  if (group.planning_radius_metres != null)
    location.planningRadiusMetres = group.planning_radius_metres
  if (group.planning_area_type != null)
    location.areaType = group.planning_area_type as PlanningLocation['areaType']
  if (group.planning_neighborhood != null)
    location.neighborhood = group.planning_neighborhood
  if (group.planning_city != null)
    location.planningCity = group.planning_city

  return location
}

// ── Error formatter ───────────────────────────────────────────────────────────

// ── Group CRUD ────────────────────────────────────────────────────────────────

export async function createGroup(
  name: string,
  emoji: string,
  activityId?: string,
): Promise<CreateGroupResult> {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London'
    const { circle } = await nexusApi<{ circle: Group }>('/v1/circles', {
      method: 'POST', body: JSON.stringify({ name: name.trim(), emoji: emoji || '👥', activityId, timezone }),
    })
    return { group: circle, errorMessage: null }
  } catch (error) {
    return { group: null, errorMessage: error instanceof Error ? error.message : 'Could not create the Circle.' }
  }
}

export async function listMyGroups(): Promise<GroupSummary[]> {
  try {
    const { circles } = await nexusApi<{ circles: Array<Group & { member_count: number }> }>('/v1/circles')
    return circles.map((row) => {
    return {
      id: row.id,
      name: row.name,
      emoji: row.emoji ?? '👥',
      activity_id: row.activity_id ?? null,
      memberCount: row.member_count,
      members: [],
      pendingConfirmations: 0,
      hasGoldenWindow: false,
    }
    })
  } catch (error) {
    console.error('[group-service] listMyGroups failed', error)
    return []
  }
}

export async function getGroup(groupId: string): Promise<Group | null> {
  try {
    const { circle } = await nexusApi<{ circle: Group & { planning_location?: PlanningLocation | null } }>(`/v1/circles/${encodeURIComponent(groupId)}`)
    if (circle.planning_location) Object.assign(circle, {
      planning_location_lat: circle.planning_location.lat,
      planning_location_lng: circle.planning_location.lng,
      planning_location_name: circle.planning_location.name,
      planning_location_address: circle.planning_location.address,
      planning_location_source: circle.planning_location.source,
      planning_radius_metres: circle.planning_location.planningRadiusMetres,
      planning_area_type: circle.planning_location.areaType,
      planning_neighborhood: circle.planning_location.neighborhood,
      planning_city: circle.planning_location.planningCity,
    })
    return circle
  } catch (error) {
    console.error('[group-service] getGroup failed', error)
    return null
  }
}

export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  try {
    const { members } = await nexusApi<{ members: GroupMember[] }>(`/v1/circles/${encodeURIComponent(groupId)}/members`)
    return members
  } catch (error) {
    console.error('[group-service] listGroupMembers failed', error)
    return []
  }
}

export async function getGroupByInvite(code: string): Promise<InvitePreview | null> {
  try {
    const { invitation } = await nexusApi<{ invitation: { circle_id: string; name: string; member_count: number } }>(`/v1/invitations/preview?token=${encodeURIComponent(code)}`)
    return { id: invitation.circle_id, name: invitation.name, emoji: '👥', member_count: invitation.member_count }
  } catch {
    return null
  }
}

export interface JoinGroupResult {
  groupId: string | null
  errorMessage: string | null
}

export async function joinGroupByInvite(code: string): Promise<JoinGroupResult> {
  try {
    const result = await nexusApi<{ circle_id: string }>('/v1/invitations/accept', { method: 'POST', body: JSON.stringify({ token: code }) })
    return { groupId: result.circle_id, errorMessage: null }
  } catch (error) {
    return { groupId: null, errorMessage: error instanceof Error ? error.message : 'Could not accept this invitation.' }
  }
}

// ── Group deletion ────────────────────────────────────────────────────────────

/**
 * Permanently deletes a group and all associated data.
 * Only the group owner (role = 'owner' in group_members) can call this.
 *
 * Deletion is handled by the delete_group() SECURITY DEFINER RPC (migration 007).
 * All dependent rows are removed via ON DELETE CASCADE:
 *   group_members, availability, live_events, live_locations,
 *   member_presence, event_notifications.
 * Golden window data, invite code, and planning location are inline in the
 * groups row and are deleted with it. User profiles are NOT affected.
 */
export async function deleteGroup(
  groupId: string,
): Promise<{ ok: boolean; errorMessage: string | null }> {
  try {
    await nexusApi(`/v1/circles/${encodeURIComponent(groupId)}`, { method: 'DELETE' })
    return { ok: true, errorMessage: null }
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : 'Could not delete the Circle.' }
  }
}

export async function leaveGroup(groupId: string): Promise<boolean> {
  try {
    await nexusApi(`/v1/circles/${encodeURIComponent(groupId)}/members`, { method: 'DELETE' })
    return true
  } catch (error) {
    console.error('[group-service] leaveGroup failed', error)
    return false
  }
}

// ── Planning Location ─────────────────────────────────────────────────────────

/**
 * Persist a planning location for a group.
 * Requires the `group_planning_location.sql` migration to have been applied.
 */
export async function saveGroupPlanningLocation(
  groupId: string,
  location: PlanningLocation,
): Promise<boolean> {
  try {
    await nexusApi(`/v1/circles/${encodeURIComponent(groupId)}`, { method: 'PATCH', body: JSON.stringify({ planningLocation: location }) })
    return true
  } catch (error) {
    console.error('[group-service] saveGroupPlanningLocation failed', error)
    return false
  }
}

/**
 * Remove the planning location from a group.
 */
export async function clearGroupPlanningLocation(groupId: string): Promise<boolean> {
  try {
    await nexusApi(`/v1/circles/${encodeURIComponent(groupId)}`, { method: 'PATCH', body: JSON.stringify({ planningLocation: null }) })
    return true
  } catch (error) {
    console.error('[group-service] clearGroupPlanningLocation failed', error)
    return false
  }
}
