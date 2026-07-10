/** POST /api/v1/auth/register (WP-R1-B1 US-1). Public; issues a session on success. */
import { getHeader } from 'h3'
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import { setSessionCookie } from '../../../utils/auth-cookie'
import { registerRequest } from '@contracts/schemas/identity/auth.schema'
import { ok, err, type Result } from '@shared/result'
import { type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'auth.register',
  schema: registerRequest,
  successStatus: 201,
  rateLimit: { limit: 5, windowSeconds: 3600 },
  async handler({ event, body }): Promise<Result<{ user_id: string }, DomainError>> {
    const c = getContainer()
    const source = body.claim ? 'ignite_claim' : 'direct'
    const result = await c.identity.auth.register({
      email: body.email, password: body.password, displayName: body.display_name ?? null, source,
    })
    if (!result.ok) return err(result.error)
    if (body.claim) await c.identity.guestClaim.claim(result.value.userId, body.claim.type, body.claim.ref)
    const token = await c.identity.sessions.issue(result.value.userId, { stepUp: true, userAgent: getHeader(event, 'user-agent') ?? null })
    setSessionCookie(event, token)
    return ok({ user_id: result.value.userId })
  },
})
