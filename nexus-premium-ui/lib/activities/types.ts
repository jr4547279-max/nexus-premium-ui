import type { LucideIcon } from 'lucide-react'

// ─── Categories ───────────────────────────────────────────────────────────────

export type ActivityCategory =
  | 'outdoor_active'
  | 'outdoor_social'
  | 'indoor_social'
  | 'dining'
  | 'cafe_coffee'
  | 'culture'
  | 'entertainment'

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  outdoor_active: 'Outdoor & Active',
  outdoor_social: 'Outdoor Social',
  indoor_social: 'Social',
  dining: 'Dining',
  cafe_coffee: 'Coffee',
  culture: 'Culture',
  entertainment: 'Entertainment',
}

export const ALL_CATEGORIES: ActivityCategory[] = [
  'outdoor_active',
  'outdoor_social',
  'indoor_social',
  'dining',
  'cafe_coffee',
  'culture',
  'entertainment',
]

// ─── Planner capabilities ─────────────────────────────────────────────────────
// Flags indicating which future planner modules an activity supports.

export type PlannerCapability = 'venues' | 'routes' | 'weather' | 'costs' | 'travel'

export const CAPABILITY_LABELS: Record<PlannerCapability, string> = {
  venues: 'Venues',
  routes: 'Routes',
  weather: 'Weather',
  costs: 'Costs',
  travel: 'Travel',
}

// ─── Color palette ────────────────────────────────────────────────────────────
// All tailwind classes written statically so the compiler can purge correctly.

export type ColorKey =
  | 'emerald'
  | 'green'
  | 'lime'
  | 'sky'
  | 'blue'
  | 'amber'
  | 'orange'
  | 'violet'
  | 'rose'
  | 'indigo'
  | 'pink'
  | 'purple'
  | 'yellow'
  | 'teal'
  | 'red'

export interface ActivityColor {
  bg: string   // e.g. 'bg-emerald-500/15'
  text: string // e.g. 'text-emerald-600 dark:text-emerald-400'
  dot: string  // e.g. 'bg-emerald-500'
}

export const COLOR_PALETTES: Record<ColorKey, ActivityColor> = {
  emerald: { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  green:   { bg: 'bg-green-500/15',   text: 'text-green-600 dark:text-green-400',     dot: 'bg-green-500' },
  lime:    { bg: 'bg-lime-500/15',    text: 'text-lime-600 dark:text-lime-400',        dot: 'bg-lime-500' },
  sky:     { bg: 'bg-sky-500/15',     text: 'text-sky-600 dark:text-sky-400',          dot: 'bg-sky-500' },
  blue:    { bg: 'bg-blue-500/15',    text: 'text-blue-600 dark:text-blue-400',        dot: 'bg-blue-500' },
  amber:   { bg: 'bg-amber-500/15',   text: 'text-amber-600 dark:text-amber-400',      dot: 'bg-amber-500' },
  orange:  { bg: 'bg-orange-500/15',  text: 'text-orange-600 dark:text-orange-400',    dot: 'bg-orange-500' },
  violet:  { bg: 'bg-violet-500/15',  text: 'text-violet-600 dark:text-violet-400',    dot: 'bg-violet-500' },
  rose:    { bg: 'bg-rose-500/15',    text: 'text-rose-600 dark:text-rose-400',        dot: 'bg-rose-500' },
  indigo:  { bg: 'bg-indigo-500/15',  text: 'text-indigo-600 dark:text-indigo-400',    dot: 'bg-indigo-500' },
  pink:    { bg: 'bg-pink-500/15',    text: 'text-pink-600 dark:text-pink-400',        dot: 'bg-pink-500' },
  purple:  { bg: 'bg-purple-500/15',  text: 'text-purple-600 dark:text-purple-400',    dot: 'bg-purple-500' },
  yellow:  { bg: 'bg-yellow-500/15',  text: 'text-yellow-600 dark:text-yellow-400',    dot: 'bg-yellow-500' },
  teal:    { bg: 'bg-teal-500/15',    text: 'text-teal-600 dark:text-teal-400',        dot: 'bg-teal-500' },
  red:     { bg: 'bg-red-500/15',     text: 'text-red-600 dark:text-red-400',          dot: 'bg-red-500' },
}

// ─── Activity definitions ─────────────────────────────────────────────────────

export type ActivityId = string

export interface ActivityDefinition {
  id: ActivityId
  label: string
  emoji: string
  Icon: LucideIcon
  color: ActivityColor
  category: ActivityCategory
  tags: string[]
  plannerCapabilities: PlannerCapability[]
}

export interface CustomActivityDefinition {
  id: 'custom'
  label: string
  emoji: string
  isCustom: true
}

export type AnyActivity = ActivityDefinition | CustomActivityDefinition

export function isCustomActivity(a: AnyActivity): a is CustomActivityDefinition {
  return (a as CustomActivityDefinition).isCustom === true
}

// ─── User preferences ─────────────────────────────────────────────────────────

export interface UserActivityPrefs {
  recents: ActivityId[]       // newest-first, max 5
  favourites: ActivityId[]    // unordered set stored as array
}
