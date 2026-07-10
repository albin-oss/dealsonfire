/** POST /api/v1/auth/webauthn/verify-registration (WP-R1-B1 US-2). Auth required. */
import { defineEventHandler, readBody } from 'h3'
import { resolveAuth } from '../../../../utils/identity'
import { getContainer } from '../../../../utils/container'
import { sendProblem } from '../../../../utils/problem'
import { webauthnVerifyRegistrationRequest } from '@contracts/schemas/identity/auth.schema'
import { domainError } from '@shared/errors'

export default defineEventHandler(async (event) => {
  const auth = (event.context.auth as { userId: string } | undefined) ?? resolveAuth(event)
  if (!auth) return sendProblem(event, domainError('AUTH_REQUIRED', 'authentication required'))
  const parsed = webauthnVerifyRegistrationRequest.safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success) return sendProblem(event, domainError('VALIDATION_FAILED', 'invalid registration response'))
  const result = await getContainer().identity.passkeyService.completeRegistration({
    userId: auth.userId,
    challengeId: parsed.data.challenge_id,
    response: parsed.data.response,
    label: parsed.data.label ?? null,
  })
  if (!result.ok) return sendProblem(event, result.error)
  return { registered: true }
})
