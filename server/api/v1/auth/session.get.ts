/** GET /api/v1/auth/session (WP-R1-B1 US-9). The current identity ("me"), or 401. */
import { defineEventHandler } from 'h3'
import { resolveAuth } from '../../../utils/identity'
import { getContainer } from '../../../utils/container'
import { sendProblem } from '../../../utils/problem'
import { domainError } from '@shared/errors'

export default defineEventHandler(async (event) => {
  const auth = (event.context.auth as { userId: string; stepUpVerified: boolean } | undefined) ?? resolveAuth(event)
  if (!auth) return sendProblem(event, domainError('AUTH_REQUIRED', 'authentication required'))
  const user = await getContainer().identity.auth.getUser(auth.userId) // GetCurrentUser query (application)
  if (!user) return sendProblem(event, domainError('AUTH_REQUIRED', 'authentication required'))
  return { user_id: user.userId, email: user.email, display_name: user.displayName, email_verified: user.emailVerified, step_up_verified: auth.stepUpVerified }
})
