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
