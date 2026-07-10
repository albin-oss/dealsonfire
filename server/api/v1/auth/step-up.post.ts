/** POST /api/v1/auth/step-up (WP-R1-B1 US-5). Fresh re-auth on the CURRENT session; no new session. */
import { defineEventHandler, readBody, getRequestIP } from 'h3'
import { resolveAuth } from '../../../utils/identity'
import { getContainer } from '../../../utils/container'
import { sendProblem } from '../../../utils/problem'
import { stepUpRequest } from '@contracts/schemas/identity/auth.schema'
import { asUserId } from '@domains/identity/shared-kernel/ids'
import { domainError } from '@shared/errors'

export default defineEventHandler(async (event) => {
  const auth = (event.context.auth as { userId: string } | undefined) ?? resolveAuth(event)
  const sessionId = event.context.sessionId as string | undefined
  if (!auth || !sessionId) return sendProblem(event, domainError('AUTH_REQUIRED', 'authentication required'))
  const c = getContainer()
  if (!c.rateLimiter.allow(`auth.step-up:${getRequestIP(event, { xForwardedFor: true }) ?? auth.userId}`, 10, 300)) {
    return sendProblem(event, domainError('RATE_LIMITED', 'too many attempts — wait a moment'))
  }
  const parsed = stepUpRequest.safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success) return sendProblem(event, domainError('VALIDATION_FAILED', 'password required'))
  const user = await c.deps.uow.withTransaction((tx) => c.identity.users.findById(tx, asUserId(auth.userId)))
  if (!user) return sendProblem(event, domainError('AUTH_REQUIRED', 'authentication required'))
  const okPw = await c.identity.auth.login(user.email, parsed.data.password)
  if (!okPw.ok) return sendProblem(event, domainError('INVALID_CREDENTIALS', 'that password is incorrect'))
  await c.identity.sessions.markStepUp(sessionId)
  return { step_up_verified: true }
})
