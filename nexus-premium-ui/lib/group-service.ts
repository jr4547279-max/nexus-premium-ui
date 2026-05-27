import { supabase } from './supabase'

export interface Group {
  id: string
  name: string
  emoji: string | null
  created_by: string
  created_at: string
  updated_at: string
}

/**
 * Shape returned by listMyGroups — matches what GroupCard / Dashboard expect
 * from mockGroups so the UI doesn't need any changes. Members are returned
 * as an empty list for now (no avatars stored yet); pendingCount and
 * hasGoldenWindow stay false until Phase 4 lands.
 */
export interface GroupSummary {
  id: string
  name: string
  emoji: string
  memberCount: number
  members: { name: string; avatar: string }[]
  pendingConfirmations: number
  hasGoldenWindow: boolean
}

export interface CreateGroupResult {
  group: Group | null
  errorMessage: string | null
}

export async function createGroup(
  name: string,
  emoji: string,
): Promise<CreateGroupResult> {
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) {
    return { group: null, errorMessage: 'Not signed in — auth.uid() is null' }
  }

  // Use SECURITY DEFINER RPC to avoid PostgREST RLS timing issue where
  // auth.uid() evaluates as null inside the `with check` policy during insert.
  const { data, error, status } = await supabase
    .rpc('create_group', { p_name: name.trim(), p_emoji: emoji || '👥' })

  if (error) {
    const msg = `[${error.code ?? status}] ${error.message}${error.hint ? ` — hint: ${error.hint}` : ''}${error.details ? ` — details: ${error.details}` : ''}`
    console.error('[group-service] createGroup FAILED', msg, error)
    return { group: null, errorMessage: msg }
  }

  return { group: data as Group, errorMessage: null }
}

export async function listMyGroups(): Promise<GroupSummary[]> {
  // RLS on `groups` already restricts to groups the user is a member of,
  // so we don't need an explicit join filter on group_members.
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, emoji, group_members(count)')
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
      memberCount: countRow?.count ?? 0,
      members: [],
      pendingConfirmations: 0,
      hasGoldenWindow: false,
    }
  })
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('id', groupId)
    .single()
  if (error) return null
  return data as Group
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
