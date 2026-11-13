/**
 * Nexus's replacement data boundary. The Worker owns identity, authorization,
 * validation and persistence; the browser sends only same-origin credentials.
 * Keep provider calls behind this module so feature services can migrate without
 * teaching React components about Cloudflare bindings or storage.
 */

export class NexusApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
    this.name = 'NexusApiError'
  }
}

const apiOrigin = (process.env.NEXT_PUBLIC_NEXUS_API_URL ?? '').replace(/\/$/, '')

export async function nexusApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiOrigin}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: { ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...init.headers },
  })
  const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
  if (!response.ok) {
    throw new NexusApiError(
      response.status,
      payload.error?.code ?? 'request_failed',
      payload.error?.message ?? 'The Nexus request could not be completed.',
    )
  }
  return payload as T
}

export const nexusApiOrigin = apiOrigin
