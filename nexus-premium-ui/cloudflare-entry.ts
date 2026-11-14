import nextApp from 'vinext/server/fetch-handler'

interface Env {
  NEXUS_API: { fetch(request: Request): Promise<Response> }
}

type RuntimeContext = Parameters<typeof nextApp.fetch>[2]

/**
 * Keep browser API and WebSocket traffic on the frontend origin. The API
 * Worker is reached only through a service binding, so Lax session cookies
 * remain first-party on mobile browsers and the API is not exposed directly.
 */
export default {
  fetch(request: Request, env: Env, context: RuntimeContext) {
    const { pathname } = new URL(request.url)
    if (pathname === '/v1' || pathname.startsWith('/v1/')) {
      return env.NEXUS_API.fetch(request)
    }
    return nextApp.fetch(request, env, context)
  },
}
