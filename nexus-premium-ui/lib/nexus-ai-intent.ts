export type NexusIntent = {
  raw: string
  category?: string
  activityId?: string
  constraints: string[]
  location?: string
  time?: string
  budget?: string
  partySize?: number
  steps: Array<{ category: string; query?: string; constraints: string[] }>
}

/**
 * Lightweight deterministic intent normalisation. This is deliberately provider-agnostic:
 * an LLM can produce the same shape later, while the execution layer remains testable.
 */
export function normaliseNexusIntent(raw: string): NexusIntent {
  const text = raw.trim()
  const lower = text.toLowerCase()
  const steps: NexusIntent['steps'] = []

  if (/\bcoffee|cafe\b/.test(lower)) steps.push({ category: 'coffee', constraints: [] })
  if (/\bdinner|restaurant|food|eat\b/.test(lower)) steps.push({ category: 'restaurant', constraints: [] })
  if (/\bfilm|movie|cinema\b/.test(lower)) steps.push({ category: 'cinema', constraints: [] })
  if (/\bdrink|drinks|bar|pub\b/.test(lower)) steps.push({ category: 'drinks', constraints: [] })
  if (/\bgym|workout\b/.test(lower)) steps.push({ category: 'gym', constraints: [] })
  if (/\bswim|swimming\b/.test(lower)) steps.push({ category: 'swimming', constraints: [] })
  if (/\bbowling\b/.test(lower)) steps.push({ category: 'bowling', constraints: [] })

  const constraints: string[] = []
  if (/\bvegan\b/.test(lower)) constraints.push('vegan')
  if (/\bvegetarian\b/.test(lower)) constraints.push('vegetarian')
  if (/\bquiet\b/.test(lower)) constraints.push('quiet')
  if (/\boutdoor|outside\b/.test(lower)) constraints.push('outdoor_seating')
  if (/\bcheap|budget|affordable\b/.test(lower)) constraints.push('budget')

  for (const step of steps) step.constraints.push(...constraints)

  return {
    raw: text,
    constraints,
    steps,
  }
}
