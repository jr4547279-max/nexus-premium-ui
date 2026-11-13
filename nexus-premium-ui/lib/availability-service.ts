import { nexusApi } from './nexus-api'

export interface AvailabilitySlot {
  day_of_week: number
  start_time: string
  end_time: string
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

type AvailabilityResponse = { slots: GroupAvailabilityRow[] }

export async function getMyAvailability(circleId: string): Promise<AvailabilitySlot[]> {
  try {
    const [{ slots }, { user }] = await Promise.all([
      nexusApi<AvailabilityResponse>(`/v1/circles/${encodeURIComponent(circleId)}/availability`),
      nexusApi<{ user: { id: string } }>('/v1/auth/me'),
    ])
    return slots.filter((slot) => slot.user_id === user.id).map(({ day_of_week, start_time, end_time }) => ({ day_of_week, start_time, end_time }))
  } catch (error) {
    console.error('[availability-service] getMyAvailability failed', error)
    return []
  }
}

export async function saveAvailability(circleId: string, slots: AvailabilitySlot[]): Promise<SaveAvailabilityResult> {
  try {
    const result = await nexusApi<{ count: number }>(`/v1/circles/${encodeURIComponent(circleId)}/availability`, {
      method: 'PUT',
      body: JSON.stringify({ slots: slots.map((slot) => ({ dayOfWeek: slot.day_of_week, startTime: slot.start_time, endTime: slot.end_time })) }),
    })
    return { inserted: result.count, errorMessage: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save availability.'
    console.error('[availability-service] saveAvailability failed', error)
    return { inserted: null, errorMessage: message }
  }
}

export async function getGroupAvailability(circleId: string): Promise<GroupAvailabilityRow[]> {
  try {
    const { slots } = await nexusApi<AvailabilityResponse>(`/v1/circles/${encodeURIComponent(circleId)}/availability`)
    return slots
  } catch (error) {
    console.error('[availability-service] getGroupAvailability failed', error)
    return []
  }
}
