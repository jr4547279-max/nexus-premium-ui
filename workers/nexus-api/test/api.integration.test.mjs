import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import worker from '../src/index.ts'

function localD1(database) {
  const wrap = (sql, values = []) => ({
    bind(...nextValues) { return wrap(sql, nextValues) },
    async first(column) {
      const row = database.prepare(sql).get(...values)
      return column ? row?.[column] ?? null : row ?? null
    },
    async all() { return { results: database.prepare(sql).all(...values) } },
    async run() {
      const result = database.prepare(sql).run(...values)
      return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }
    },
  })
  return {
    prepare(sql) { return wrap(sql) },
    async batch(statements) {
      database.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        database.exec('COMMIT')
        return results
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },
  }
}

function testEnvironment() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const file of ['0001_initial.sql', '0002_social_live.sql', '0003_golden_plan_idempotency.sql', '0004_circle_timezone_overnight.sql', '0005_availability_submission_status.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  }
  const room = { idFromName: (name) => name, get: () => ({ fetch: async () => new Response(null, { status: 204 }) }) }
  const objects = new Map()
  return {
    sqlite,
    objects,
    env: {
      DB: localD1(sqlite),
      UPLOADS: {
        async put(key, body, options) { objects.set(key, { body: await new Response(body).arrayBuffer(), options }) },
        async get(key) {
          const item = objects.get(key)
          return item ? { body: item.body, httpMetadata: item.options?.httpMetadata } : null
        },
        async delete(key) { objects.delete(key) },
      },
      CIRCLE_ROOM: room,
      LIVE_EVENT_ROOM: room,
      APP_ORIGIN: 'https://app.nexus.test',
      PUBLIC_APP_URL: 'https://app.nexus.test',
      AUTH_MODE: 'development',
      ALLOW_DEV_AUTH: 'false',
      ALLOW_UPLOADS: 'false',
      EMAIL_FROM: 'Nexus <hello@nexus.test>',
      EMAIL_API_URL: 'https://mailer.nexus.test/send',
      EMAIL_API_TOKEN: 'test-only-token',
    },
  }
}

test('Circle timezone and overnight migration preserves existing availability', () => {
  const database = new DatabaseSync(':memory:')
  database.exec('PRAGMA foreign_keys = ON')
  for (const file of ['0001_initial.sql', '0002_social_live.sql', '0003_golden_plan_idempotency.sql']) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  }
  database.prepare("INSERT INTO users(id,email,email_verified_at) VALUES('u1','u1@nexus.test','2026-01-01T00:00:00Z')").run()
  database.prepare("INSERT INTO circles(id,name,created_by) VALUES('c1','Existing','u1')").run()
  database.prepare("INSERT INTO circle_members(circle_id,user_id,role) VALUES('c1','u1','owner')").run()
  database.prepare("INSERT INTO availability(id,circle_id,user_id,day_of_week,start_time,end_time) VALUES('a1','c1','u1',1,'18:00','22:00')").run()
  database.exec(readFileSync(new URL('../migrations/0004_circle_timezone_overnight.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../migrations/0005_availability_submission_status.sql', import.meta.url), 'utf8'))
  assert.equal(database.prepare("SELECT timezone FROM circles WHERE id='c1'").get().timezone, 'Europe/London')
  assert.equal(database.prepare("SELECT end_day_offset FROM availability WHERE id='a1'").get().end_day_offset, 0)
  database.prepare("INSERT INTO availability(id,circle_id,user_id,day_of_week,start_time,end_time,end_day_offset) VALUES('a2','c1','u1',1,'22:00','01:00',1)").run()
  assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0)
  database.close()
})

test('authenticated Circle planning journey uses saved availability and enforces membership', async (t) => {
  const { env, sqlite, objects } = testEnvironment()
  t.after(() => sqlite.close())
  const realFetch = globalThis.fetch
  const sentMail = []
  globalThis.fetch = async (input, init = {}) => {
    if (String(input) === env.EMAIL_API_URL) {
      sentMail.push(JSON.parse(String(init.body)))
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return realFetch(input, init)
  }
  t.after(() => { globalThis.fetch = realFetch })

  async function request(path, { method = 'GET', body, cookie } = {}) {
    const headers = new Headers({ origin: env.APP_ORIGIN })
    if (body !== undefined) headers.set('content-type', 'application/json')
    if (cookie) headers.set('cookie', cookie)
    const response = await worker.fetch(new Request(`https://api.nexus.test${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env)
    return { response, data: await response.json(), setCookie: response.headers.get('set-cookie') }
  }

  async function signIn(email) {
    const before = sentMail.length
    const requested = await request('/v1/auth/request-link', { method: 'POST', body: { email } })
    assert.equal(requested.response.status, 202)
    const magicMail = sentMail[before]
    assert.ok(magicMail, 'auth email delivered through the isolated mail stub')
    const verifyUrl = new URL(magicMail.text.match(/https:\/\/[^\s]+/)?.[0])
    const verified = await request('/v1/auth/verify', { method: 'POST', body: { token: verifyUrl.searchParams.get('token') } })
    assert.equal(verified.response.status, 200)
    assert.ok(verified.setCookie?.includes('HttpOnly'))
    return verified.setCookie.split(';', 1)[0]
  }

  const alice = await signIn('alice@nexus.test')
  const bob = await signIn('bob@nexus.test')
  const uploadBody = new FormData()
  uploadBody.set('kind', 'avatar')
  uploadBody.set('file', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'avatar.jpg', { type: 'image/jpeg' }))
  const blockedUpload = await worker.fetch(new Request('https://api.nexus.test/v1/uploads', {
    method: 'POST', headers: { origin: env.APP_ORIGIN, cookie: alice }, body: uploadBody,
  }), env)
  assert.equal(blockedUpload.status, 503)
  assert.equal((await blockedUpload.json()).error.code, 'uploads_disabled')
  assert.equal(objects.size, 0, 'staging rejects upload before writing to R2')
  const uploadBinding = env.UPLOADS
  delete env.UPLOADS
  const blockedWithoutR2 = await worker.fetch(new Request('https://api.nexus.test/v1/uploads', {
    method: 'POST', headers: { origin: env.APP_ORIGIN, cookie: alice }, body: uploadBody,
  }), env)
  assert.equal(blockedWithoutR2.status, 503)
  env.UPLOADS = uploadBinding
  const aliceProfile = await request('/v1/profile', { method: 'PATCH', cookie: alice, body: { display_name: 'Alice', username: 'alice' } })
  const bobProfile = await request('/v1/profile', { method: 'PATCH', cookie: bob, body: { display_name: 'Bob', username: 'bob' } })
  assert.equal(aliceProfile.response.status, 200)
  assert.equal(bobProfile.response.status, 200)

  const soloCircle = await request('/v1/circles', { method: 'POST', cookie: alice, body: { name: 'Personal planning', emoji: '🧡', timezone: 'America/Los_Angeles' } })
  assert.equal(soloCircle.response.status, 201)
  assert.equal(soloCircle.data.circle.timezone, 'America/Los_Angeles')
  const fetchedSoloCircle = await request(`/v1/circles/${soloCircle.data.circle.id}`, { cookie: alice })
  assert.equal(fetchedSoloCircle.data.circle.timezone, 'America/Los_Angeles', 'Circle timezone is returned to authorized members')
  const soloAvailability = await request(`/v1/circles/${soloCircle.data.circle.id}/availability`, {
    method: 'PUT', cookie: alice,
    body: { slots: [{ dayOfWeek: 2, startTime: '22:30', endTime: '01:00', endDayOffset: 1 }] },
  })
  assert.equal(soloAvailability.response.status, 200)
  const soloAvailabilityRows = await request(`/v1/circles/${soloCircle.data.circle.id}/availability`, { cookie: alice })
  assert.equal(soloAvailabilityRows.data.slots[0].end_day_offset, 1, 'overnight offset persists in D1 and reads back')
  assert.equal(sqlite.prepare('SELECT end_day_offset FROM availability WHERE circle_id=?').get(soloCircle.data.circle.id).end_day_offset, 1)
  const soloWindow = await request(`/v1/circles/${soloCircle.data.circle.id}/golden-window`, { cookie: alice })
  assert.equal(soloWindow.response.status, 200)
  assert.equal(soloWindow.data.windows[0]?.available_member_count, 1, 'single-member Circles can find a personal window')
  assert.equal(soloWindow.data.windows[0]?.total_member_count, 1)
  const invalidOvernight = await request(`/v1/circles/${soloCircle.data.circle.id}/availability`, {
    method: 'PUT', cookie: alice,
    body: { slots: [{ dayOfWeek: 2, startTime: '18:00', endTime: '20:00', endDayOffset: 1 }] },
  })
  assert.equal(invalidOvernight.response.status, 400, 'overnight ranges must actually cross midnight')
  const clearedSoloAvailability = await request(`/v1/circles/${soloCircle.data.circle.id}/availability`, { method: 'PUT', cookie: alice, body: { slots: [] } })
  assert.equal(clearedSoloAvailability.response.status, 200)
  const clearedSnapshot = await request(`/v1/circles/${soloCircle.data.circle.id}/availability`, { cookie: alice })
  assert.deepEqual(clearedSnapshot.data.slots, [])
  assert.ok(clearedSnapshot.data.submitted_user_ids.includes(sqlite.prepare('SELECT id FROM users WHERE email=?').get('alice@nexus.test').id), 'a member who saved an empty schedule remains distinct from a non-submitter')

  const created = await request('/v1/circles', { method: 'POST', cookie: alice, body: { name: 'Friday plans', emoji: '🧡' } })
  assert.equal(created.response.status, 201)
  const circleId = created.data.circle.id

  const mailCount = sentMail.length
  const invitation = await request(`/v1/circles/${circleId}/invitations`, { method: 'POST', cookie: alice, body: { email: 'bob@nexus.test' } })
  assert.equal(invitation.response.status, 201)
  const invitationMail = sentMail[mailCount]
  const inviteToken = invitationMail.text.match(/https:\/\/[^\s]+/)?.[0].split('/').at(-1)
  assert.ok(inviteToken)
  assert.equal((await request(`/v1/invitations/preview?token=${encodeURIComponent(inviteToken)}`)).response.status, 200)
  const joined = await request('/v1/invitations/accept', { method: 'POST', cookie: bob, body: { token: inviteToken } })
  assert.equal(joined.response.status, 200)

  const day = (new Date().getDay() + 2) % 7
  for (const [cookie, startTime, endTime] of [[alice, '17:00', '18:00'], [bob, '20:00', '21:00']]) {
    const saved = await request(`/v1/circles/${circleId}/availability`, {
      method: 'PUT', cookie,
      body: { slots: [{ dayOfWeek: day, startTime, endTime }] },
    })
    assert.equal(saved.response.status, 200)
  }
  const noOverlapWindow = await request(`/v1/circles/${circleId}/golden-window`, { cookie: alice })
  assert.deepEqual(noOverlapWindow.data.windows, [], 'the API does not invent a compromise time when members are not simultaneously free')

  for (const cookie of [alice, bob]) {
    const saved = await request(`/v1/circles/${circleId}/availability`, {
      method: 'PUT', cookie,
      body: { slots: [{ dayOfWeek: day, startTime: '18:00', endTime: '21:30' }] },
    })
    assert.equal(saved.response.status, 200)
  }
  const persistedAvailability = await request(`/v1/circles/${circleId}/availability`, { cookie: alice })
  assert.equal(persistedAvailability.response.status, 200)
  assert.deepEqual(new Set(persistedAvailability.data.slots.map((slot) => slot.user_id)), new Set([
    sqlite.prepare('SELECT id FROM users WHERE email=?').get('alice@nexus.test').id,
    sqlite.prepare('SELECT id FROM users WHERE email=?').get('bob@nexus.test').id,
  ]), 'availability is read back from the D1-backed store for both Circle members')
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM availability WHERE circle_id=?').get(circleId).count, 2)

  // Editing availability replaces only the caller's rows and is immediately
  // visible to the server-side calculation without changing another member.
  const aliceId = sqlite.prepare('SELECT id FROM users WHERE email=?').get('alice@nexus.test').id
  const editedAliceAvailability = await request(`/v1/circles/${circleId}/availability`, {
    method: 'PUT', cookie: alice,
    body: { slots: [{ dayOfWeek: day, startTime: '19:00', endTime: '21:30' }, { dayOfWeek: day, startTime: '22:00', endTime: '23:00' }] },
  })
  assert.equal(editedAliceAvailability.response.status, 200)
  const editedRows = await request(`/v1/circles/${circleId}/availability`, { cookie: alice })
  assert.deepEqual(editedRows.data.slots.filter((slot) => slot.user_id === aliceId).map((slot) => [slot.start_time, slot.end_time]), [
    ['19:00', '21:30'], ['22:00', '23:00'],
  ])
  assert.equal(editedRows.data.slots.filter((slot) => slot.user_id !== aliceId).length, 1, 'editing Alice does not overwrite Bob')
  const windowResult = await request(`/v1/circles/${circleId}/golden-window`, { cookie: alice })
  assert.equal(windowResult.response.status, 200)
  assert.equal(windowResult.data.source, 'member-submitted availability')
  const best = windowResult.data.windows[0]
  assert.ok(best)
  assert.equal(best.available_member_count, 2)
  assert.equal(best.total_member_count, 2)
  assert.equal(best.fairness_score, 100)

  const start = new Date()
  start.setDate(start.getDate() + best.days_until)
  const [hours, minutes] = best.start_time.split(':').map(Number)
  start.setHours(hours, minutes, 0, 0)
  const plan = await request(`/v1/circles/${circleId}/plans`, {
    method: 'POST', cookie: alice,
    body: {
      title: 'Friday together', startsAt: start.toISOString(),
      goldenWindow: true,
      window: { dayOfWeek: best.day_of_week, startTime: best.start_time, endTime: best.end_time },
      venue: { name: 'Ember House' },
    },
  })
  assert.ok([200, 201].includes(plan.response.status))
  const planId = plan.data.plan.id
  const repeatPlan = await request(`/v1/circles/${circleId}/plans`, {
    method: 'POST', cookie: bob,
    body: {
      title: 'Friday together', startsAt: start.toISOString(),
      goldenWindow: true,
      window: { dayOfWeek: best.day_of_week, startTime: best.start_time, endTime: best.end_time },
    },
  })
  assert.equal(repeatPlan.data.plan.id, planId, 'all Circle members share one plan for this Golden Window')

  const voteAlice = await request(`/v1/plans/${planId}/votes`, { method: 'POST', cookie: alice, body: { providerVenueId: 'place:ember-house', venueName: 'Ember House', venueType: 'restaurant', vote: 1 } })
  assert.equal(voteAlice.response.status, 200)
  const voteBob = await request(`/v1/plans/${planId}/votes`, { method: 'POST', cookie: bob, body: { providerVenueId: 'place:ember-house', venueName: 'Ember House', venueType: 'restaurant', vote: 1 } })
  assert.equal(voteBob.response.status, 200)
  assert.equal(voteBob.data.venue_id, voteAlice.data.venue_id, 'members vote on the same durable venue record')
  assert.equal((await request(`/v1/plans/${planId}/confirm`, { method: 'POST', cookie: alice, body: { venueId: voteAlice.data.venue_id } })).response.status, 200)
  assert.equal((await request(`/v1/plans/${planId}/rsvps`, { cookie: alice })).data.rsvps.find((entry) => entry.display_name === 'Alice')?.response, 'yes')
  assert.equal((await request(`/v1/plans/${planId}/rsvps`, { method: 'PUT', cookie: alice, body: { response: 'yes' } })).response.status, 200)
  assert.equal((await request(`/v1/plans/${planId}/rsvps`, { method: 'PUT', cookie: bob, body: { response: 'yes' } })).response.status, 200)

  const chat = await request(`/v1/circles/${circleId}/messages`, { method: 'POST', cookie: bob, body: { body: 'See you there!' } })
  assert.equal(chat.response.status, 201)
  assert.equal((await request(`/v1/circles/${circleId}/messages`, { cookie: alice })).data.messages.at(-1).body, 'See you there!')
  assert.equal((await request(`/v1/circles/${circleId}/members`, { method: 'DELETE', cookie: bob })).response.status, 200)
  const afterLeave = await request(`/v1/circles/${circleId}/availability`, { cookie: alice })
  assert.ok(afterLeave.data.slots.every((slot) => slot.user_id !== sqlite.prepare('SELECT id FROM users WHERE email=?').get('bob@nexus.test').id), 'a former member schedule is removed from Circle results')
  assert.ok(!afterLeave.data.submitted_user_ids.includes(sqlite.prepare('SELECT id FROM users WHERE email=?').get('bob@nexus.test').id), 'a former member submission status is no longer exposed')

  const charlie = await signIn('charlie@nexus.test')
  assert.equal((await request(`/v1/circles/${circleId}/availability`, { cookie: charlie })).response.status, 404, 'non-members cannot read private availability')
  assert.equal((await request(`/v1/circles/${circleId}/availability`, {
    method: 'PUT', cookie: charlie,
    body: { slots: [{ dayOfWeek: day, startTime: '18:00', endTime: '20:00' }] },
  })).response.status, 404, 'non-members cannot write availability')
  const forbidden = await request(`/v1/circles/${circleId}/messages`, { cookie: charlie })
  assert.equal(forbidden.response.status, 404, 'non-members cannot read private Circle chat')
})
