// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY: Test Scenarios
// ─────────────────────────────────────────────────────────────────────────────
// This module is used exclusively for developer testing. It provides
// pre-configured multi-member scenarios that feed directly into the real
// Golden Window engine and Planner Engine without touching Supabase.
//
// To remove this in production: delete lib/dev/ and all imports of it.
// ─────────────────────────────────────────────────────────────────────────────

import type { GoldenWindowMember, GoldenWindowAvailabilityRow } from '@/lib/golden-window'

// Day-of-week constants (matches JS Date.getDay())
const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6, SUN = 0

export interface DevMember {
  id: string
  name: string
  /** Optional display info only — not used by the engine */
  emoji?: string
  location?: { lat: number; lng: number }
}

export interface DevScenario {
  id: string
  title: string
  description: string
  /** Expected result hint for the developer */
  expectedResult: string
  activityId: string
  members: DevMember[]
  availability: GoldenWindowAvailabilityRow[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — Strong Overlap (2 members, clear shared windows)
// ─────────────────────────────────────────────────────────────────────────────

const SCENARIO_1: DevScenario = {
  id: 'dev-s1',
  title: '2 Members · Strong Overlap',
  description: 'Alice and Bob both free Monday evening and Friday night — clear shared windows.',
  expectedResult: 'Expect STRONG or PERFECT match on Monday or Friday.',
  activityId: 'pub-crawl',
  members: [
    { id: 'dev-u1-alice', name: 'Alice', emoji: '👩' },
    { id: 'dev-u1-bob',   name: 'Bob',   emoji: '👨' },
  ],
  availability: [
    // Alice
    { user_id: 'dev-u1-alice', day_of_week: MON, start_time: '18:00', end_time: '22:00' },
    { user_id: 'dev-u1-alice', day_of_week: FRI, start_time: '19:00', end_time: '23:00' },
    // Bob
    { user_id: 'dev-u1-bob', day_of_week: MON, start_time: '17:30', end_time: '21:30' },
    { user_id: 'dev-u1-bob', day_of_week: FRI, start_time: '18:00', end_time: '22:00' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — Partial Overlap (2 members, short window)
// ─────────────────────────────────────────────────────────────────────────────

const SCENARIO_2: DevScenario = {
  id: 'dev-s2',
  title: '2 Members · Short Overlap',
  description: 'Charlie and Diana share only a 90-minute window on Saturday afternoon.',
  expectedResult: 'Expect PARTIAL match (~90 min window, Saturday).',
  activityId: 'pub-crawl',
  members: [
    { id: 'dev-u2-charlie', name: 'Charlie', emoji: '🧑' },
    { id: 'dev-u2-diana',   name: 'Diana',   emoji: '👩' },
  ],
  availability: [
    // Charlie — early Saturday, early Sunday
    { user_id: 'dev-u2-charlie', day_of_week: SAT, start_time: '14:00', end_time: '16:30' },
    { user_id: 'dev-u2-charlie', day_of_week: SUN, start_time: '11:00', end_time: '14:00' },
    // Diana — later Saturday, afternoon Sunday (no Sunday overlap with Charlie)
    { user_id: 'dev-u2-diana', day_of_week: SAT, start_time: '15:00', end_time: '19:00' },
    { user_id: 'dev-u2-diana', day_of_week: SUN, start_time: '15:00', end_time: '18:00' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — Compromise (3 members, no direct overlap)
// ─────────────────────────────────────────────────────────────────────────────

const SCENARIO_3: DevScenario = {
  id: 'dev-s3',
  title: '3 Members · No Perfect Overlap',
  description:
    'Evan, Fiona, and Grace each have availability on different days — no day works for all three.',
  expectedResult: 'Expect BEST OPTION / compromise result.',
  activityId: 'pub-crawl',
  members: [
    { id: 'dev-u3-evan',  name: 'Evan',  emoji: '👨' },
    { id: 'dev-u3-fiona', name: 'Fiona', emoji: '👩' },
    { id: 'dev-u3-grace', name: 'Grace', emoji: '🧑' },
  ],
  availability: [
    // Evan — Mon early, Wed late
    { user_id: 'dev-u3-evan', day_of_week: MON, start_time: '18:00', end_time: '20:00' },
    { user_id: 'dev-u3-evan', day_of_week: WED, start_time: '19:00', end_time: '22:00' },
    // Fiona — Tue evening, Thu evening
    { user_id: 'dev-u3-fiona', day_of_week: TUE, start_time: '19:00', end_time: '22:00' },
    { user_id: 'dev-u3-fiona', day_of_week: THU, start_time: '18:00', end_time: '21:00' },
    // Grace — Mon late (after Evan), Fri afternoon
    { user_id: 'dev-u3-grace', day_of_week: MON, start_time: '20:30', end_time: '23:00' },
    { user_id: 'dev-u3-grace', day_of_week: FRI, start_time: '17:00', end_time: '20:00' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 — Realistic Partial (4 members, Friday partial)
// ─────────────────────────────────────────────────────────────────────────────

const SCENARIO_4: DevScenario = {
  id: 'dev-s4',
  title: '4 Members · Realistic Golden Window',
  description:
    'Harry, Isla, and Jack overlap Friday evening. Kate is only free Thursday/Sunday — 3 of 4 available.',
  expectedResult: 'Expect PARTIAL match on Friday (3/4 members, ~2-hour window).',
  activityId: 'pub-crawl',
  members: [
    { id: 'dev-u4-harry', name: 'Harry', emoji: '👨' },
    { id: 'dev-u4-isla',  name: 'Isla',  emoji: '👩' },
    { id: 'dev-u4-jack',  name: 'Jack',  emoji: '🧑' },
    { id: 'dev-u4-kate',  name: 'Kate',  emoji: '👩' },
  ],
  availability: [
    // Harry — Fri late, Sat afternoon
    { user_id: 'dev-u4-harry', day_of_week: FRI, start_time: '20:00', end_time: '23:00' },
    { user_id: 'dev-u4-harry', day_of_week: SAT, start_time: '16:00', end_time: '20:00' },
    // Isla — Fri evening, Sat afternoon
    { user_id: 'dev-u4-isla', day_of_week: FRI, start_time: '18:00', end_time: '22:00' },
    { user_id: 'dev-u4-isla', day_of_week: SAT, start_time: '17:00', end_time: '21:00' },
    // Jack — Fri evening, Sat evening
    { user_id: 'dev-u4-jack', day_of_week: FRI, start_time: '19:00', end_time: '22:00' },
    { user_id: 'dev-u4-jack', day_of_week: SAT, start_time: '18:00', end_time: '22:00' },
    // Kate — different days entirely (creates partial/compromise dynamic)
    { user_id: 'dev-u4-kate', day_of_week: THU, start_time: '19:00', end_time: '22:00' },
    { user_id: 'dev-u4-kate', day_of_week: SUN, start_time: '15:00', end_time: '18:00' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

export const DEV_SCENARIOS: DevScenario[] = [
  SCENARIO_1,
  SCENARIO_2,
  SCENARIO_3,
  SCENARIO_4,
]

/** Converts DevScenario members to the GoldenWindowMember shape the engine expects. */
export function toGwMembers(scenario: DevScenario): GoldenWindowMember[] {
  return scenario.members.map(m => ({ id: m.id, name: m.name }))
}
