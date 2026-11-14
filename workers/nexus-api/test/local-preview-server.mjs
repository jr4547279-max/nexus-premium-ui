import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import worker from '../src/index.ts'

const host = process.env.NEXUS_PREVIEW_HOST ?? '127.0.0.1'
const port = Number(process.env.NEXUS_PREVIEW_PORT ?? 39187)
const appPort = Number(process.env.NEXUS_PREVIEW_APP_PORT ?? 37141)
const databasePath = process.env.NEXUS_PREVIEW_DB ?? '/tmp/nexus-api-preview.sqlite'
const database = new DatabaseSync(databasePath)
database.exec('PRAGMA foreign_keys = ON')
database.exec('CREATE TABLE IF NOT EXISTS _nexus_preview_migrations (name TEXT PRIMARY KEY)')
for (const name of ['0001_initial.sql', '0002_social_live.sql', '0003_golden_plan_idempotency.sql', '0004_circle_timezone_overnight.sql', '0005_availability_submission_status.sql']) {
  const applied = database.prepare('SELECT 1 FROM _nexus_preview_migrations WHERE name=?1').get(name)
  if (!applied) {
    database.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
    database.prepare('INSERT INTO _nexus_preview_migrations(name) VALUES(?1)').run(name)
  }
}

const d1Statement = (sql, values = []) => ({
  bind(...next) { return d1Statement(sql, next) },
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

const objectStore = new Map()
const roomNamespace = {
  idFromName: (name) => name,
  get: () => ({ fetch: async () => new Response(null, { status: 204 }) }),
}
const env = {
  DB: {
    prepare: (sql) => d1Statement(sql),
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
  },
  UPLOADS: {
    async put(key, body, options) { objectStore.set(key, { body: await new Response(body).arrayBuffer(), options }) },
    async get(key) {
      const item = objectStore.get(key)
      return item ? { body: item.body, httpMetadata: item.options?.httpMetadata } : null
    },
    async delete(key) { objectStore.delete(key) },
  },
  CIRCLE_ROOM: roomNamespace,
  LIVE_EVENT_ROOM: roomNamespace,
  APP_ORIGIN: `http://127.0.0.1:${appPort}`,
  PUBLIC_APP_URL: `http://127.0.0.1:${appPort}`,
  AUTH_MODE: 'development',
  ALLOW_DEV_AUTH: 'true',
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = []
    for await (const chunk of incoming) chunks.push(chunk)
    const body = chunks.length ? Buffer.concat(chunks) : undefined
    const headers = new Headers()
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) headers.set(key, value.join(', '))
      else if (value !== undefined) headers.set(key, value)
    }
    const request = new Request(`http://${incoming.headers.host}${incoming.url}`, {
      method: incoming.method,
      headers,
      body: incoming.method === 'GET' || incoming.method === 'HEAD' ? undefined : body,
    })
    const response = await worker.fetch(request, env)
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    console.error('[nexus-local-preview] request failed:', error instanceof Error ? error.message : 'unknown error')
    outgoing.writeHead(500, { 'content-type': 'application/json' })
    outgoing.end(JSON.stringify({ error: { code: 'preview_error', message: 'The local API could not complete this request.' } }))
  }
})

server.listen(port, host, () => {
  console.log(`Nexus local API preview listening on http://${host}:${port}`)
  console.log(`App origin: http://localhost:${appPort}`)
  console.log('Local SQLite only; no Cloudflare resources or live email are used.')
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { database.close(); process.exit(0) }))
}
