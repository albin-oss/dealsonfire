/** POST /api/v1/auth/webauthn/authenticate (WP-R1-B1 US-2). Public; issues a session on success. */
import { defineEventHandler, readBody, getHeader, setResponseStatus } from 'h3'
import { getContainer } from '../../../../utils/container'
import { setSessionCookie } from '../../../../utils/auth-cookie'
import { sendProblem } from '../../../../utils/problem'
import { webauthnAuthenticateRequest } from '@contracts/schemas/identity/auth.schema'
import { domainError } from '@shared/errors'

export default defineEventHandler(async (event) => {
  const parsed = webauthnAuthenticateRequest.safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success) return sendProblem(event, domainError('VALIDATION_FAILED', 'invalid authentication response'))
  // orchestration (find → verify → advance counter → audit, one tx → issue session) lives
  // in the application PasskeyService (P4); the edge only parses, sets the cookie, answers.
  const result = await getContainer().identity.passkeyService.authenticate({
    challengeId: parsed.data.challenge_id,
    response: parsed.data.response,
    userAgent: getHeader(event, 'user-agent') ?? null,
  })
  if (!result.ok) return sendProblem(event, result.error)
  setSessionCookie(event, result.value.token)
  setResponseStatus(event, 200)
  return { user_id: result.value.userId }
})
