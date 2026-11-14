import test from 'node:test'
import assert from 'node:assert/strict'
import { checkGoldenWindowRequirements, computeGoldenWindows } from '../../../nexus-premium-ui/lib/golden-window.ts'

test('Golden Window returns the strongest shared availability interval', () => {
  const members = [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }]
  const slots = [
    { user_id: 'one', day_of_week: 5, start_time: '18:00', end_time: '22:00' },
    { user_id: 'two', day_of_week: 5, start_time: '19:00', end_time: '21:30' },
  ]

  const [best] = computeGoldenWindows(members, slots)
  assert.ok(best)
  assert.equal(best.day_of_week, 5)
  assert.equal(best.start_time, '19:00')
  assert.equal(best.end_time, '21:30')
  assert.equal(best.available_member_count, 2)
})

test('Golden Window waits for another member to submit availability', () => {
  const members = [{ id: 'one' }, { id: 'two' }]
  const slots = [
    { user_id: 'one', day_of_week: 5, start_time: '18:00', end_time: '22:00' },
  ]
  assert.equal(computeGoldenWindows(members, slots).length, 0)
  assert.equal(checkGoldenWindowRequirements(members, slots).canCompute, false)
})

test('single-member Circle finds a personal Golden Window from its saved slot', () => {
  const members = [{ id: 'one', name: 'One' }]
  const slots = [{ user_id: 'one', day_of_week: 2, start_time: '18:30', end_time: '21:00' }]
  assert.deepEqual(checkGoldenWindowRequirements(members, slots), { canCompute: true, missingExplanation: null })
  const [best] = computeGoldenWindows(members, slots, { now: new Date('2026-11-14T12:00:00Z') })
  assert.ok(best)
  assert.equal(best.start_time, '18:30')
  assert.equal(best.end_time, '21:00')
  assert.equal(best.available_member_count, 1)
  assert.equal(best.total_member_count, 1)
  assert.equal(best.fairness_score, 100)
})

test('different weekdays do not fabricate a shared Golden Window', () => {
  const members = [{ id: 'one' }, { id: 'two' }]
  const slots = [
    { user_id: 'one', day_of_week: 1, start_time: '18:00', end_time: '22:00' },
    { user_id: 'two', day_of_week: 2, start_time: '18:00', end_time: '22:00' },
  ]
  assert.equal(checkGoldenWindowRequirements(members, slots).canCompute, true)
  assert.deepEqual(computeGoldenWindows(members, slots), [])
})

test('strict Golden Window mode never returns a synthesized same-day compromise', () => {
  const members = [{ id: 'one' }, { id: 'two' }]
  const slots = [
    { user_id: 'one', day_of_week: 4, start_time: '17:00', end_time: '18:00' },
    { user_id: 'two', day_of_week: 4, start_time: '20:00', end_time: '21:00' },
  ]
  assert.equal(computeGoldenWindows(members, slots, { allowCompromise: false }).length, 0)
  assert.equal(computeGoldenWindows(members, slots)[0]?.match_quality, 'compromise', 'legacy engine behavior remains available to other callers')
})

test('overnight availability overlaps the following weekday without inventing time', () => {
  const members = [{ id: 'overnight' }, { id: 'early' }]
  const slots = [
    { user_id: 'overnight', day_of_week: 2, start_time: '22:30', end_time: '01:00', end_day_offset: 1 },
    { user_id: 'early', day_of_week: 3, start_time: '00:15', end_time: '02:00' },
  ]
  const [best] = computeGoldenWindows(members, slots, { allowCompromise: false })
  assert.ok(best)
  assert.equal(best.day_of_week, 3)
  assert.equal(best.start_time, '00:15')
  assert.equal(best.end_time, '01:00')
  assert.equal(best.available_member_count, 2)
})

test('Circle timezone determines the current weekday for Golden Window dates', () => {
  const members = [{ id: 'one' }, { id: 'two' }]
  const slots = [
    { user_id: 'one', day_of_week: 6, start_time: '18:00', end_time: '20:00' },
    { user_id: 'two', day_of_week: 6, start_time: '18:30', end_time: '19:30' },
  ]
  const [best] = computeGoldenWindows(members, slots, {
    now: new Date('2026-11-15T00:30:00Z'), timeZone: 'America/Los_Angeles', allowCompromise: false,
  })
  assert.ok(best)
  assert.equal(best.days_until, 0, 'it is still Saturday evening in Los Angeles')
})
