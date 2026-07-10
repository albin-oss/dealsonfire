/** POST /api/v1/auth/logout (WP-R1-B1 US-3). Revokes the current session; always clears cookie. */
import { defineEventHandler, setResponseStatus } from 'h3'
import { getContainer } from '../../../utils/container'
import { clearSessionCookie } from '../../../utils/auth-cookie'

export default defineEventHandler(async (event) => {
  const sessionId = event.context.sessionId as string | undefined
  if (sessionId) await getContainer().identity.sessions.revoke(sessionId)
  clearSessionCookie(event)
  setResponseStatus(event, 200)
  return { ok: true }
})
