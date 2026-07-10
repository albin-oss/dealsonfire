/** POST /api/v1/auth/login (WP-R1-B1 US-3). Public; enumeration-proof. */
import { getHeader } from 'h3'
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import { setSessionCookie } from '../../../utils/auth-cookie'
import { loginRequest } from '@contracts/schemas/identity/auth.schema'
import { ok, err, type Result } from '@shared/result'
import { type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'auth.login',
  schema: loginRequest,
  rateLimit: { limit: 10, windowSeconds: 60 },
  async handler({ event, body }): Promise<Result<{ user_id: string }, DomainError>> {
    const c = getContainer()
    const result = await c.identity.auth.login(body.email, body.password)
    if (!result.ok) return err(result.error)
    const token = await c.identity.sessions.issue(result.value.userId, { stepUp: true, userAgent: getHeader(event, 'user-agent') ?? null })
    setSessionCookie(event, token, { persistent: body.remember })
    return ok({ user_id: result.value.userId })
  },
})
