import { supabase } from './supabase'
import { markGoldenWindowStale } from './golden-window-persistence'

export interface AvailabilitySlot {
  day_of_week: number   // 0 = Sun, 1 = Mon, … 6 = Sat
  start_time: string    // "HH:MM"
  end_time: string      // "HH:MM"
}

export interface GroupAvailabilityRow extends AvailabilitySlot {
  user_id: string
  display_name: string | null
  email: string | null
}

export interface SaveAvailabilityResult {
  inserted: number | null
  errorMessage: string | null
}

const REQUEST_TIMEOUT_MS = 8_000

function formatError(
  error: { code?: string | null; message: string; hint?: string | null; details?: string | null },
  status?: number,
) {
  return `[${error.code ?? status}] ${error.message}${error.hint ? ` — hint: ${error.hint}` : ''}${error.details ? ` — details: ${error.details}` : ''}`
}

async function withTimeout<T>(promise: PromiseLike<T>, fallback: T, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[availability-service] ${label} timed out after ${REQUEST_TIMEOUT_MS}ms`)
      resolve(fallback)
    }, REQUEST_TIMEOUT_MS)
  })

  try {
    return await Promise.race([Promise.resolve(promise), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function getMyAvailability(groupId: string): Promise<AvailabilitySlot[]> {
  const { data: userData } = await withTimeout(
    supabase.auth.getUser(),
    { data: { user: null }, error: null } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>,
    'auth.getUser',
  )
  const uid = userData.user?.id
  if (!uid) return []

  const { data, error } = await withTimeout(
    supabase
      .from('availability')
      .select('day_of_week, start_time, end_time')
      .eq('group_id', groupId)
      .eq('user_id', uid)
      .order('day_of_week')
      .order('start_time'),
    { data: null, error: { message: 'Availability read timed out' } as never },
    'getMyAvailability',
  )

  if (error) {
    console.error('[availability-service] getMyAvailability failed', error)
    return []
  }
  return (data ?? []) as AvailabilitySlot[]
}

export async function saveAvailability(
  groupId: string,
  slots: AvailabilitySlot[],
): Promise<SaveAvailabilityResult> {
  const result = await withTimeout(
    supabase.rpc('save_availability', { p_group_id: groupId, p_slots: slots }),
    {
      data: null,
      error: { message: `Availability save timed out after ${REQUEST_TIMEOUT_MS}ms`, code: 'TIMEOUT' },
      status: 408,
    } as never,
    'saveAvailability',
  )

  const { data, error, status } = result
  if (error) {
    const msg = formatError(error, status)
    console.error('[availability-service] saveAvailability FAILED', msg, error)
    return { inserted: null, errorMessage: msg }
  }

  markGoldenWindowStale(groupId).catch(() => undefined)
  return { inserted: (data as number) ?? 0, errorMessage: null }
}

export async function getGroupAvailability(groupId: string): Promise<GroupAvailabilityRow[]> {
  const directResult = await withTimeout(
    supabase
      .from('availability')
      .select('user_id, day_of_week, start_time, end_time')
      .eq('group_id', groupId)
      .order('user_id')
      .order('day_of_week')
      .order('start_time'),
    { data: null, error: { message: 'Group availability read timed out' } as never },
    'getGroupAvailability',
  )

  const { data: availData, error: availError } = directResult

  if (availError) {
    console.error('[availability-service] getGroupAvailability (direct) failed', availError)
    const fallback = await withTimeout(
      supabase.rpc('list_group_availability', { p_group_id: groupId }),
      { data: null, error: { message: 'Group availability fallback timed out' } as never },
      'list_group_availability',
    )
    if (fallback.error) {
      console.error('[availability-service] getGroupAvailability (RPC fallback) failed', fallback.error)
      return []
    }
    return (fallback.data ?? []) as GroupAvailabilityRow[]
  }

  const rows = (availData ?? []) as Pick<
    GroupAvailabilityRow,
    'user_id' | 'day_of_week' | 'start_time' | 'end_time'
  >[]
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const profileMap = new Map<string, { display_name: string | null; email: string | null }>()

  if (userIds.length > 0) {
    const profileResult = await withTimeout(
      supabase
        .from('profiles')
        .select('id, display_name, email')
        .in('id', userIds),
      { data: [], error: null } as never,
      'profile enrichment',
    )
    for (const p of (profileResult.data ?? [])) {
      profileMap.set(p.id, {
        display_name: (p as { display_name?: string | null }).display_name ?? null,
        email: (p as { email?: string | null }).email ?? null,
      })
    }
  }

  return rows.map((r) => ({
    user_id: r.user_id,
    day_of_week: r.day_of_week,
    start_time: r.start_time,
    end_time: r.end_time,
    display_name: profileMap.get(r.user_id)?.display_name ?? null,
    email: profileMap.get(r.user_id)?.email ?? null,
  }))
}
