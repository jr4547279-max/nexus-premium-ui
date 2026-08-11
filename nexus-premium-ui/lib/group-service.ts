import { supabase } from './supabase'
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

function formatError(error: { code?: string | null; message: string; hint?: string | null; details?: string | null }, status?: number) {
  return `[${error.code ?? status}] ${error.message}${error.hint ? ` — hint: ${error.hint}` : ''}${error.details ? ` — details: ${error.details}` : ''}`
}

// ── Group CRUD ────────────────────────────────────────────────────────────────

export async function createGroup(
  name: string,
  emoji: string,
  activityId?: string,
): Promise<CreateGroupResult> {
  // ── Step 1: create the group via stored procedure ──────────────────────────
  // The RPC uses auth.uid() internally — no need to call getUser() here.
  console.log('[createGroup] Step 1 — calling create_group RPC', { name, emoji, activityId })
  const { data, error: rpcError, status } = await supabase
    .rpc('create_group', { p_name: name.trim(), p_emoji: emoji || '👥' })

  if (rpcError) {
    const msg = formatError(rpcError, status)
    console.error('[createGroup] Step 1 FAILED — RPC error', msg, rpcError)
    return { group: null, errorMessage: msg }
  }

  console.log('[createGroup] Step 1 OK — RPC returned', data)

  if (!data) {
    console.error('[createGroup] Step 1 FAILED — RPC returned null/empty data')
    return { group: null, errorMessage: 'Group creation returned no data. Please try again.' }
  }

  const group = data as Group

  if (!group.id) {
    console.error('[createGroup] Step 1 FAILED — returned group has no id', group)
    return { group: null, errorMessage: 'Group created but missing an ID. Please try again.' }
  }

  // ── Step 2: persist the activity (if one was chosen) ──────────────────────
  if (activityId) {
    console.log('[createGroup] Step 2 — updating activity_id', { groupId: group.id, activityId })
    const { error: updateError, status: updateStatus } = await supabase
      .from('groups')
      .update({ activity_id: activityId })
      .eq('id', group.id)

    if (updateError) {
      // Surface this as a real error — the group was created but activity was lost.
      const msg = formatError(updateError, updateStatus)
      console.error('[createGroup] Step 2 FAILED — activity_id UPDATE error', msg, updateError)
      return { group, errorMessage: `Group created but activity could not be saved: ${msg}` }
    }

    console.log('[createGroup] Step 2 OK — activity_id persisted')
    group.activity_id = activityId
  }

  console.log('[createGroup] Complete —', group)
  return { group, errorMessage: null }
}

export async function listMyGroups(): Promise<GroupSummary[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, emoji, activity_id, golden_window_data, group_members(count)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[group-service] listMyGroups failed', error)
    return []
  }

  return (data ?? []).map((row) => {
    const countRow = (row.group_members as { count: number }[] | null)?.[0]
    return {
      id: row.id,
      name: row.name,
      emoji: row.emoji ?? '👥',
      activity_id: (row.activity_id as string | null) ?? null,
      memberCount: countRow?.count ?? 0,
      members: [],
      pendingConfirmations: 0,
      hasGoldenWindow: !!(row.golden_window_data as unknown),
    }
  })
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('id', groupId)
    .single()
  if (error) {
    console.error('[group-service] getGroup failed', error)
    return null
  }
  return data as Group
}

export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .rpc('list_group_members', { p_group_id: groupId })
  if (error) {
    console.error('[group-service] listGroupMembers failed', error)
    return []
  }
  return (data ?? []) as GroupMember[]
}

export async function getGroupByInvite(code: string): Promise<InvitePreview | null> {
  const { data, error } = await supabase
    .rpc('get_group_by_invite', { p_code: code })
  if (error) {
    console.error('[group-service] getGroupByInvite failed', error)
    return null
  }
  const rows = data as InvitePreview[] | null
  return rows && rows.length > 0 ? rows[0] : null
}

export interface JoinGroupResult {
  groupId: string | null
  errorMessage: string | null
}

export async function joinGroupByInvite(code: string): Promise<JoinGroupResult> {
  const { data, error, status } = await supabase
    .rpc('join_group_by_invite', { p_code: code })
  if (error) {
    const msg = formatError(error, status)
    console.error('[group-service] joinGroupByInvite FAILED', msg, error)
    return { groupId: null, errorMessage: msg }
  }
  return { groupId: data as string, errorMessage: null }
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
  const { error, status } = await supabase.rpc('delete_group', {
    p_group_id: groupId,
  })

  if (error) {
    const msg = formatError(error, status)
    console.error('[group-service] deleteGroup failed', msg, error)
    return { ok: false, errorMessage: msg }
  }

  return { ok: true, errorMessage: null }
}

export async function leaveGroup(groupId: string): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) return false

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', uid)

  if (error) {
    console.error('[group-service] leaveGroup failed', error)
    return false
  }
  return true
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
  const { error } = await supabase
    .from('groups')
    .update({
      planning_location_lat:     location.lat,
      planning_location_lng:     location.lng,
      planning_location_name:    location.name,
      planning_location_address: location.address,
      planning_location_source:  location.source,
      // Intelligence fields — null when not yet resolved
      planning_radius_metres:    location.planningRadiusMetres  ?? null,
      planning_area_type:        location.areaType              ?? null,
      planning_neighborhood:     location.neighborhood          ?? null,
      planning_city:             location.planningCity          ?? null,
    })
    .eq('id', groupId)

  if (error) {
    console.error('[group-service] saveGroupPlanningLocation failed', error)
    return false
  }
  return true
}

/**
 * Remove the planning location from a group.
 */
export async function clearGroupPlanningLocation(groupId: string): Promise<boolean> {
  const { error } = await supabase
    .from('groups')
    .update({
      planning_location_lat:     null,
      planning_location_lng:     null,
      planning_location_name:    null,
      planning_location_address: null,
      planning_location_source:  null,
      // Clear intelligence fields too
      planning_radius_metres:    null,
      planning_area_type:        null,
      planning_neighborhood:     null,
      planning_city:             null,
    })
    .eq('id', groupId)

  if (error) {
    console.error('[group-service] clearGroupPlanningLocation failed', error)
    return false
  }
  return true
}
