import assert from 'node:assert/strict'
import test from 'node:test'
import { hasValidProviderLocation, venueDistanceKm } from './venue-location.ts'

const EASTBOURNE = { lat: 50.7686, lng: 0.2906 }

test('accepts exact provider coordinates around Eastbourne without changing them', () => {
  const providerVenue = { name: 'Eastbourne coffee venue', lat: 50.76836, lng: 0.29069 }

  assert.equal(hasValidProviderLocation(providerVenue, EASTBOURNE, 5_000), true)
  assert.equal(providerVenue.lat, 50.76836)
  assert.equal(providerVenue.lng, 0.29069)
})

test('rejects missing, malformed and invalid WGS-84 coordinates', () => {
  assert.equal(hasValidProviderLocation({ name: 'Missing' }, EASTBOURNE, 5_000), false)
  assert.equal(hasValidProviderLocation({ name: 'Malformed', lat: Number.NaN, lng: 0.29 }, EASTBOURNE, 5_000), false)
  assert.equal(hasValidProviderLocation({ name: 'Invalid latitude', lat: 91, lng: 0.29 }, EASTBOURNE, 5_000), false)
  assert.equal(hasValidProviderLocation({ name: 'Invalid longitude', lat: 50.76, lng: 181 }, EASTBOURNE, 5_000), false)
})

test('rejects swapped and out-of-area coordinates for an Eastbourne search', () => {
  assert.equal(
    hasValidProviderLocation({ name: 'Swapped', lat: 0.2906, lng: 50.7686 }, EASTBOURNE, 5_000),
    false,
  )
  assert.equal(
    hasValidProviderLocation({ name: 'Outside radius', lat: 50.8225, lng: 0.1372 }, EASTBOURNE, 5_000),
    false,
  )
})

test('computes a short distance for a valid Eastbourne coordinate', () => {
  assert.ok(venueDistanceKm(EASTBOURNE, { lat: 50.76836, lng: 0.29069 }) < 0.1)
})
