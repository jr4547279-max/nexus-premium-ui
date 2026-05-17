import { supabase } from './supabase'

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  onboarding_completed: boolean
  onboarding_answers: Record<string, string[]>
  created_at: string
  updated_at: string
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) return null
  return data as Profile
}

export async function ensureProfile(userId: string, email: string): Promise<Profile | null> {
  const emailPrefix = email.split('@')[0] ?? ''
  const displayName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { id: userId, email, display_name: displayName, updated_at: new Date().toISOString() },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select()
    .single()
  if (error) return null
  return data as Profile
}

export async function updateProfile(
  userId: string,
  updates: Partial<Pick<Profile, 'display_name' | 'onboarding_completed' | 'onboarding_answers'>>,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single()
  if (error) return null
  return data as Profile
}
