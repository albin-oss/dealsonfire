/**
 * Auth middleware (WP-R1-B1 T-7): in 'session' mode, resolve the session cookie to an
 * AuthContext on event.context.auth (the command wrapper reads it first). Cheap: only
 * runs when a session cookie is present. Dev mode is untouched — resolveAuth reads the
 * header as before. This is the seam that makes resolveAuth('session') real.
 */
import { defineEventHandler, getCookie } from 'h3'
import { getServerConfig } from '../utils/config'
import { getContainer } from '../utils/container'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'

export default defineEventHandler(async (event) => {
  if (getServerConfig().identityMode !== 'session') return
  const token = getCookie(event, SESSION_COOKIE)
  if (!token) return
  const resolved = await getContainer().identity.sessions.resolve(token)
  if (resolved) {
    event.context.auth = { userId: resolved.userId, stepUpVerified: resolved.stepUpVerified }
    event.context.sessionId = resolved.sessionId
  }
})
