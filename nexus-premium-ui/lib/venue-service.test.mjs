import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDirectionsUrl, computeMidpoint, fetchVenues } from './venue-service.ts'

test('an absent Circle location stays absent instead of becoming a default town', () => {
  assert.deepEqual(computeMidpoint([]), { lat: null, lng: null, fallback: true })
  assert.deepEqual(computeMidpoint([{ lat: 91, lng: 0 }]), { lat: null, lng: null, fallback: true })
  assert.deepEqual(computeMidpoint([{ lat: 51.5, lng: -0.1 }, { lat: 53.5, lng: -2.2 }]), {
    lat: 52.5, lng: -1.1500000000000001, fallback: false,
  })
})

test('venue mapping is consumed as a normalized response and empty real results stay empty', async () => {
  const originalFetch = globalThis.fetch
  let requested = ''
  globalThis.fetch = async (url) => {
    requested = String(url)
    return Response.json({ venues: [], vibe: 'food', provider: 'OpenStreetMap', cached: false })
  }
  try {
    const result = await fetchVenues({ vibe: 'food', activityId: 'restaurant', lat: 51.5, lng: -0.1 })
    assert.deepEqual(result.venues, [])
    assert.equal(result.provider, 'OpenStreetMap')
    assert.match(requested, /activity=restaurant/)
    assert.match(requested, /lat=51.5/)
  } finally { globalThis.fetch = originalFetch }
})

test('provider failures return an explicit error without substituting sample venues', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('upstream unavailable') }
  try {
    const result = await fetchVenues({ vibe: 'pub', lat: 51.5, lng: -0.1 })
    assert.deepEqual(result.venues, [])
    assert.match(result.error, /upstream unavailable/)
  } finally { globalThis.fetch = originalFetch }
})

test('invalid or missing locations are rejected before the provider is called', async () => {
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = async () => { called = true; return Response.json({ venues: [] }) }
  try {
    const missing = await fetchVenues({ vibe: 'activity' })
    const invalid = await fetchVenues({ vibe: 'activity', lat: 91, lng: 0 })
    assert.equal(called, false)
    assert.deepEqual(missing.venues, [])
    assert.match(invalid.error, /location/i)
  } finally { globalThis.fetch = originalFetch }
})

test('directions links require valid venue coordinates', () => {
  assert.equal(buildDirectionsUrl({ lat: null, lng: null }), null)
  assert.match(buildDirectionsUrl({ lat: 50.77, lng: 0.29 }), /destination=50\.77%2C0\.29/)
})
