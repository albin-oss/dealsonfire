/** POST /api/v1/auth/webauthn/registration-options (WP-R1-B1 US-2). Auth required (add a passkey). */
import { defineEventHandler } from 'h3'
import { resolveAuth } from '../../../../utils/identity'
import { getContainer } from '../../../../utils/container'
import { sendProblem } from '../../../../utils/problem'
import { asUserId } from '@domains/identity/shared-kernel/ids'
import { domainError } from '@shared/errors'

export default defineEventHandler(async (event) => {
  const auth = (event.context.auth as { userId: string } | undefined) ?? resolveAuth(event)
  if (!auth) return sendProblem(event, domainError('AUTH_REQUIRED', 'authentication required'))
  const c = getContainer()
  const user = await c.deps.uow.withTransaction((tx) => c.identity.users.findById(tx, asUserId(auth.userId)))
  if (!user) return sendProblem(event, domainError('AUTH_REQUIRED', 'authentication required'))
  const existing = await c.deps.uow.withTransaction((tx) => c.identity.passkeys.listByUser(tx, auth.userId))
  return c.identity.webauthn.registrationOptions(auth.userId, user.email, existing.map((p) => p.credentialId))
})
