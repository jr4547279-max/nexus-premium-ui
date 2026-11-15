import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDirectionsUrl, buildVenueSearchUrl, computeMidpoint, fetchVenues, VENUE_CACHE_CONTROL, venueIsSelected, venueResponseCacheControl, venueSelectionKey } from './venue-service.ts'

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

test('venue edge-cache URLs round location and separate category, radius and Golden Window', () => {
  const base = { vibe: 'food', activityId: 'restaurant', lat: 50.76861, lng: 0.29061, radius: 3500, limit: 8, meetingDay: 5, meetingTime: '18:00' }
  const nearby = { ...base, lat: 50.76864, lng: 0.29063 }
  assert.equal(buildVenueSearchUrl(base), buildVenueSearchUrl(nearby))
  assert.notEqual(buildVenueSearchUrl(base), buildVenueSearchUrl({ ...base, activityId: 'coffee' }))
  assert.notEqual(buildVenueSearchUrl(base), buildVenueSearchUrl({ ...base, radius: 5000 }))
  assert.notEqual(buildVenueSearchUrl(base), buildVenueSearchUrl({ ...base, meetingTime: '19:00' }))
  assert.match(buildVenueSearchUrl(base), /lat=50\.769/)
  assert.match(VENUE_CACHE_CONTROL, /max-age=300/)
  assert.match(VENUE_CACHE_CONTROL, /stale-while-revalidate=86400/)
  assert.match(VENUE_CACHE_CONTROL, /stale-if-error=86400/)
  assert.equal(venueResponseCacheControl(false), VENUE_CACHE_CONTROL)
  assert.equal(venueResponseCacheControl(true), 'no-store')
})

test('venue-card and map-pin selection share the same stable venue key', () => {
  const venue = { id: 'osm-node-15', name: 'The Anchor', lat: 50.77, lng: 0.29 }
  const selection = venueSelectionKey(venue)
  assert.equal(venueIsSelected(venue, selection), true)
  assert.equal(venueIsSelected({ ...venue, name: 'Renamed display label' }, selection), true)
  assert.equal(venueIsSelected({ ...venue, id: 'osm-node-16' }, selection), false)
  assert.equal(venueIsSelected(venue, null), false)
})
