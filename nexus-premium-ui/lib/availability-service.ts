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

export class AvailabilityServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AvailabilityServiceError'
  }
}

type AvailabilityResponse = { slots: GroupAvailabilityRow[] }

export async function getMyAvailability(circleId: string): Promise<AvailabilitySlot[]> {
  const [{ slots }, { user }] = await Promise.all([
    nexusApi<AvailabilityResponse>(`/v1/circles/${encodeURIComponent(circleId)}/availability`),
    nexusApi<{ user: { id: string } }>('/v1/auth/me'),
  ])
  if (!user?.id || !Array.isArray(slots)) throw new AvailabilityServiceError('Could not load your saved availability. Please try again.')
  return slots.filter((slot) => slot.user_id === user.id).map(({ day_of_week, start_time, end_time }) => ({ day_of_week, start_time, end_time }))
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
  const { slots } = await nexusApi<AvailabilityResponse>(`/v1/circles/${encodeURIComponent(circleId)}/availability`)
  if (!Array.isArray(slots)) throw new AvailabilityServiceError('Could not load Circle availability. Please try again.')
  return slots
}
