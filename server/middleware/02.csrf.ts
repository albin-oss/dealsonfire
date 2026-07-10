/**
 * CSRF defense-in-depth (WP-R1-B1 §Middleware; ENGINEERING-STANDARDS §9). The session
 * cookie is SameSite=Lax (the primary defense); this adds an Origin/Referer same-site
 * assertion on state-changing API requests in SESSION mode — the belt to Lax's suspenders.
 *
 * Only enforced when auth is COOKIE-borne (session mode): dev-header auth carries no
 * ambient credential a foreign site could ride, so it is exempt (and keeps the
 * embedded-PG integration suite, which authenticates by header, unaffected).
 */
import { defineEventHandler, getRequestHeader, getRequestHost, createError } from 'h3'
import { getServerConfig } from '../utils/config'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default defineEventHandler((event) => {
  if (getServerConfig().identityMode !== 'session') return
  if (!event.path?.startsWith('/api/')) return
  if (!MUTATING.has(event.method)) return

  const origin = getRequestHeader(event, 'origin')
  const referer = getRequestHeader(event, 'referer')
  const host = getRequestHost(event)

  // Prefer Origin; fall back to Referer's host. A cross-site value is refused.
  const source = origin ?? (referer ? safeHost(referer) : null)
  if (source === null) {
    // No Origin/Referer on a mutating request is anomalous for a browser — refuse.
    throw createError({ statusCode: 403, statusMessage: 'CSRF check failed: missing origin' })
  }
  const sourceHost = origin ? safeHost(origin) : source
  if (sourceHost !== host) {
    throw createError({ statusCode: 403, statusMessage: 'CSRF check failed: cross-site request' })
  }
})

function safeHost(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
