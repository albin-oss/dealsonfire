/** POST /api/v1/auth/login (WP-R1-B1 US-3). Public; enumeration-proof. */
import { getHeader } from 'h3'
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import { setSessionCookie } from '../../../utils/auth-cookie'
import { getVisitorId, restoreVisitorId } from '../../../utils/visitor'
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

    // Keep your corner (Release 1.3): the claimed corner follows its owner onto any
    // device; a user without one claims the identity under their feet (if unclaimed).
    let cornerRestored = false
    const claimed = await c.identity.guestClaim.findClaim(result.value.userId, 'visitor')
    const present = getVisitorId(event)
    if (claimed) {
      if (present !== claimed) restoreVisitorId(event, claimed)
      cornerRestored = true
    } else if (present) {
      const claim = await c.identity.guestClaim.claim(result.value.userId, 'visitor', present)
      cornerRestored = claim.ok && claim.value.outcome === 'claimed'
    }
    return ok({ user_id: result.value.userId, corner_restored: cornerRestored })
  },
})
