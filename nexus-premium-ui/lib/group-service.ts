import { supabase } from './supabase'

export interface Group {
  id: string
  name: string
  emoji: string | null
  invite_code: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface GroupSummary {
  id: string
  name: string
  emoji: string
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

function formatError(error: { code?: string | null; message: string; hint?: string | null; details?: string | null }, status?: number) {
  return `[${error.code ?? status}] ${error.message}${error.hint ? ` — hint: ${error.hint}` : ''}${error.details ? ` — details: ${error.details}` : ''}`
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

  const { data, error, status } = await supabase
    .rpc('create_group', { p_name: name.trim(), p_emoji: emoji || '👥' })

  if (error) {
    const msg = formatError(error, status)
    console.error('[group-service] createGroup FAILED', msg, error)
    return { group: null, errorMessage: msg }
  }

  return { group: data as Group, errorMessage: null }
}

export async function listMyGroups(): Promise<GroupSummary[]> {
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
