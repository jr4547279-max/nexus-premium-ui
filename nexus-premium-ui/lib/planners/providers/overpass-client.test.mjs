import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOverpassQuery,
  clearOverpassCache,
  fetchOverpassElements,
  isValidSearchLocation,
  normalizeOverpassElements,
} from './overpass-client.mjs'
import { evaluateOsmOpeningHours } from './osm-opening-hours.mjs'

const location = { lat: 50.7686, lng: 0.2906 }
const tags = [{ key: 'amenity', value: 'pub' }]

test('validates WGS-84 planning coordinates and never supplies an implicit location', () => {
  assert.equal(isValidSearchLocation(location), true)
  assert.equal(isValidSearchLocation(undefined), false)
  assert.equal(isValidSearchLocation({ lat: 91, lng: 0 }), false)
  assert.equal(isValidSearchLocation({ lat: 0, lng: -181 }), false)
  assert.throws(() => buildOverpassQuery(tags, undefined, 1000), /valid search location/)
})

test('builds a bounded Overpass query for the selected activity tags', () => {
  const query = buildOverpassQuery(tags, location, 3500)
  assert.match(query, /node\["amenity"="pub"\]/)
  assert.match(query, /way\["amenity"="pub"\]/)
  assert.match(query, /relation\["amenity"="pub"\]/)
  assert.match(query, /around:3500,50\.7686,0\.2906/)
  assert.throws(() => buildOverpassQuery(tags, location, 30_000), /radius/)
})

test('normalizes real OSM records, removes duplicates and rejects invalid or distant points', () => {
  const elements = [
    { type: 'node', id: 10, lat: 50.77, lon: 0.29, tags: { name: 'The Anchor', amenity: 'pub' } },
    { type: 'node', id: 11, lat: 50.77001, lon: 0.29001, tags: { name: 'The Anchor', amenity: 'pub' } },
    { type: 'way', id: 12, center: { lat: 50.80, lon: 0.30 }, tags: { name: 'Far away' } },
    { type: 'node', id: 13, lat: 50.77, lon: 0.29, tags: { amenity: 'pub' } },
    { type: 'node', id: 14, lat: 120, lon: 0, tags: { name: 'Invalid coordinates' } },
  ]
  const venues = normalizeOverpassElements(elements, location, 1500)
  assert.equal(venues.length, 1)
  assert.equal(venues[0].name, 'The Anchor')
  assert.equal(venues[0].id, 'osm-node-10')
  assert.equal(venues[0].tags.amenity, 'pub')
  assert.equal(venues[0].openingHours, null)
})

test('uses the configured alternate endpoint after one failure and caches successful results', async () => {
  clearOverpassCache()
  const calls = []
  const fakeFetch = async (url) => {
    calls.push(url)
    if (url === 'https://first.example/api') return new Response('busy', { status: 503 })
    return Response.json({ elements: [{ type: 'node', id: 1, lat: location.lat, lon: location.lng, tags: { name: 'Real Place' } }] })
  }
  const query = buildOverpassQuery(tags, location, 1000)
  const first = await fetchOverpassElements(query, { endpoints: ['https://first.example/api', 'https://second.example/api'], fetchImpl: fakeFetch })
  const second = await fetchOverpassElements(query, { endpoints: ['https://first.example/api', 'https://second.example/api'], fetchImpl: fakeFetch })
  assert.equal(first.elements.length, 1)
  assert.equal(second.cached, true)
  assert.deepEqual(calls, ['https://first.example/api', 'https://second.example/api'])
})

test('bounds failures to the configured endpoints and returns empty only for an empty successful response', async () => {
  clearOverpassCache()
  let callCount = 0
  const query = buildOverpassQuery(tags, location, 1000)
  await assert.rejects(fetchOverpassElements(query, {
    endpoints: ['https://one.example/api', 'https://two.example/api', 'https://three.example/api'],
    fetchImpl: async () => { callCount += 1; return new Response('busy', { status: 429 }) },
  }), /HTTP 429/)
  assert.equal(callCount, 2)

  clearOverpassCache()
  const empty = await fetchOverpassElements(query, { endpoints: ['https://empty.example/api'], fetchImpl: async () => Response.json({ elements: [] }) })
  assert.deepEqual(empty.elements, [])
})

test('evaluates only simple reliable opening hours against the Golden Window weekday and start time', () => {
  assert.equal(evaluateOsmOpeningHours('24/7', 5, '22:00'), true)
  assert.equal(evaluateOsmOpeningHours('09:00-17:00', 1, '16:59'), true)
  assert.equal(evaluateOsmOpeningHours('09:00-17:00', 1, '17:30'), false)
  assert.equal(evaluateOsmOpeningHours('Mo-Fr 10:00-22:00', 1, '18:00'), true)
  assert.equal(evaluateOsmOpeningHours('Mo-Fr 10:00-22:00', 0, '18:00'), false)
  assert.equal(evaluateOsmOpeningHours('Mo 25:00-27:00,10:00-12:00', 1, '11:00'), null)
  assert.equal(evaluateOsmOpeningHours('20:00-02:00', 6, '01:00'), true)
  assert.equal(evaluateOsmOpeningHours('Mo-Fr 09:00-17:00; Sa 10:00-15:00', 6, '12:00'), null)
  assert.equal(evaluateOsmOpeningHours('not an opening-hours rule', 1, '12:00'), null)
})
