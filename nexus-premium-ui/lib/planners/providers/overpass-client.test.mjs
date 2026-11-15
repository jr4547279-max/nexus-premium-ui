import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOverpassQuery,
  clearOverpassCache,
  fetchOverpassElements,
  getOverpassEndpoints,
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

test('uses a Europe-only fallback only for locations inside its published coverage area', () => {
  assert.ok(getOverpassEndpoints(location).includes('https://ovp.dresel.systems/api/interpreter'))
  assert.equal(getOverpassEndpoints({ lat: 40.7128, lng: -74.006 }).includes('https://ovp.dresel.systems/api/interpreter'), false)
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
  const logs = []
  const fakeFetch = async (url) => {
    calls.push(url)
    if (url === 'https://first.example/api') return new Response('busy', { status: 503 })
    return Response.json({ elements: [{ type: 'node', id: 1, lat: location.lat, lon: location.lng, tags: { name: 'Real Place' } }] })
  }
  const query = buildOverpassQuery(tags, location, 1000)
  const first = await fetchOverpassElements(query, { endpoints: ['https://first.example/api', 'https://second.example/api'], fetchImpl: fakeFetch, logger: (record) => logs.push(record), minIntervalMs: 0 })
  const second = await fetchOverpassElements(query, { endpoints: ['https://first.example/api', 'https://second.example/api'], fetchImpl: fakeFetch, logger: (record) => logs.push(record), minIntervalMs: 0 })
  assert.equal(first.elements.length, 1)
  assert.equal(second.cached, true)
  assert.deepEqual(calls, ['https://first.example/api', 'https://second.example/api'])
  assert.deepEqual(logs.map(({ event, category, state }) => [event, category ?? state]), [
    ['nexus_overpass_attempt_failed', 'upstream_server_error'],
    ['nexus_overpass_attempt_succeeded', 'success'],
    ['nexus_overpass_cache', 'fresh'],
  ])
  assert.equal(JSON.stringify(logs).includes(query), false)
  assert.equal(JSON.stringify(logs).includes('50.7686'), false)
})

test('backs off after HTTP 429 and returns empty only for an empty successful response', async () => {
  clearOverpassCache()
  let callCount = 0
  const query = buildOverpassQuery(tags, location, 1000)
  await assert.rejects(fetchOverpassElements(query, {
    endpoints: ['https://one.example/api', 'https://two.example/api', 'https://three.example/api'],
    fetchImpl: async () => { callCount += 1; return new Response('busy', { status: 429 }) },
    minIntervalMs: 0,
  }), /rate-limited/)
  assert.equal(callCount, 1)

  clearOverpassCache()
  const empty = await fetchOverpassElements(query, { endpoints: ['https://empty.example/api'], fetchImpl: async () => Response.json({ elements: [] }), minIntervalMs: 0 })
  assert.deepEqual(empty.elements, [])
})

test('recovers from HTTP 521 on a different endpoint and logs only privacy-safe diagnostics', async () => {
  clearOverpassCache()
  const logs = []
  const calls = []
  const query = buildOverpassQuery(tags, location, 1000)
  const result = await fetchOverpassElements(query, {
    endpoints: ['https://down.example/api/interpreter', 'https://healthy.example/api/interpreter'],
    minIntervalMs: 0,
    logger: (record) => logs.push(record),
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      if (url.includes('down.example')) return new Response('origin unavailable', { status: 521 })
      return Response.json({ elements: [{ type: 'node', id: 8, lat: location.lat, lon: location.lng, tags: { name: 'Real venue' } }] })
    },
  })
  assert.equal(result.elements[0].id, 8)
  assert.deepEqual(calls.map(({ url }) => url), ['https://down.example/api/interpreter', 'https://healthy.example/api/interpreter'])
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded')
  assert.match(calls[0].init.headers['User-Agent'], /^NexusSocialPlanner\//)
  assert.equal(new URLSearchParams(calls[0].init.body).get('data'), query)
  assert.deepEqual(logs[0], {
    event: 'nexus_overpass_attempt_failed',
    endpoint: 'https://down.example/api/interpreter',
    status: 521,
    elapsedMs: logs[0].elapsedMs,
    category: 'origin_unavailable',
  })
  assert.equal(JSON.stringify(logs).includes('50.7686'), false)
  assert.equal(JSON.stringify(logs).includes(query), false)
})

test('classifies an endpoint timeout and falls back once', async () => {
  clearOverpassCache()
  const logs = []
  const query = buildOverpassQuery(tags, location, 1000)
  const result = await fetchOverpassElements(query, {
    endpoints: ['https://slow.example/api', 'https://healthy.example/api'],
    timeoutMs: 5,
    minIntervalMs: 0,
    logger: (record) => logs.push(record),
    fetchImpl: async (url, init) => {
      if (url.includes('slow.example')) {
        return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
      }
      return Response.json({ elements: [] })
    },
  })
  assert.deepEqual(result.elements, [])
  assert.equal(logs[0].category, 'timeout')
  assert.equal(logs[0].status, null)
})

test('rejects malformed JSON and invalid response shapes before accepting fallback data', async () => {
  clearOverpassCache()
  const logs = []
  const endpoints = ['https://html.example/api', 'https://shape.example/api', 'https://healthy.example/api']
  const query = buildOverpassQuery(tags, location, 1000)
  const result = await fetchOverpassElements(query, {
    endpoints,
    minIntervalMs: 0,
    logger: (record) => logs.push(record),
    fetchImpl: async (url) => {
      if (url.includes('html.example')) return new Response('<html>proxy error</html>')
      if (url.includes('shape.example')) return Response.json({ data: [] })
      return Response.json({ elements: [{ type: 'node', id: 9, lat: location.lat, lon: location.lng, tags: { name: 'Valid result' } }] })
    },
  })
  assert.equal(result.elements[0].id, 9)
  assert.deepEqual(logs.map((record) => record.category), ['invalid_response', 'invalid_response', 'success'])
})

test('surfaces a helpful total provider failure rather than returning a false empty result', async () => {
  clearOverpassCache()
  const logs = []
  const query = buildOverpassQuery(tags, location, 1000)
  let calls = 0
  await assert.rejects(fetchOverpassElements(query, {
    endpoints: ['https://one.example/api', 'https://two.example/api'],
    minIntervalMs: 0,
    logger: (record) => logs.push(record),
    fetchImpl: async () => {
      calls += 1
      if (calls === 1) return new Response('bad gateway', { status: 521 })
      throw new TypeError('network failure with private request context')
    },
  }), (error) => {
    assert.match(error.message, /temporarily unavailable/)
    assert.equal(error.name, 'OverpassProviderError')
    assert.equal(error.category, 'network_error')
    return true
  })
  assert.equal(calls, 2)
  assert.equal(logs.length, 2)
  assert.equal(JSON.stringify(logs).includes('private request context'), false)
})

test('honours HTTP 406 policy backoff instead of immediately fanning out', async () => {
  clearOverpassCache()
  const logs = []
  const query = buildOverpassQuery(tags, location, 1000)
  let calls = 0
  await assert.rejects(fetchOverpassElements(query, {
    endpoints: ['https://policy.example/api', 'https://fallback.example/api'],
    minIntervalMs: 0,
    logger: (record) => logs.push(record),
    fetchImpl: async () => {
      calls += 1
      return new Response('not acceptable', { status: 406 })
    },
  }), (error) => {
    assert.equal(error.status, 406)
    assert.equal(error.retryAfterSeconds, 30)
    return true
  })
  assert.equal(calls, 1)
  assert.equal(logs[0].category, 'rate_limited_or_policy_rejected')
})

test('returns valid cached results as stale during a temporary provider outage', async () => {
  clearOverpassCache()
  const query = buildOverpassQuery(tags, location, 1000)
  const seeded = await fetchOverpassElements(query, {
    endpoints: ['https://healthy.example/api'],
    minIntervalMs: 0,
    cacheTtlMs: 0,
    staleTtlMs: 60_000,
    fetchImpl: async () => Response.json({ elements: [{ type: 'node', id: 10, lat: location.lat, lon: location.lng, tags: { name: 'Previously verified place' } }] }),
  })
  assert.equal(seeded.cached, false)
  const stale = await fetchOverpassElements(query, {
    endpoints: ['https://down.example/api'],
    minIntervalMs: 0,
    fetchImpl: async () => new Response('offline', { status: 521 }),
  })
  assert.equal(stale.cached, true)
  assert.equal(stale.stale, true)
  assert.equal(stale.elements[0].id, 10)
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
