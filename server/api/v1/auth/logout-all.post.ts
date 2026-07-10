/** POST /api/v1/auth/logout-all (WP-R1-B1 US-4). Sign out everywhere (keeps current). */
import { defineEventHandler, setResponseStatus } from 'h3'
import { resolveAuth } from '../../../utils/identity'
import { getContainer } from '../../../utils/container'
import { sendProblem } from '../../../utils/problem'
import { domainError } from '@shared/errors'

export default defineEventHandler(async (event) => {
  const auth = (event.context.auth as { userId: string } | undefined) ?? resolveAuth(event)
  if (!auth) return sendProblem(event, domainError('AUTH_REQUIRED', 'authentication required'))
  const keep = (event.context.sessionId as string | undefined) ?? null
  const n = await getContainer().identity.sessions.revokeAll(auth.userId, keep)
  setResponseStatus(event, 200)
  return { revoked: n }
})
