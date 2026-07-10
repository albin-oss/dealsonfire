/** POST /api/v1/auth/recovery/reset (WP-R1-B1 US-6). Consumes token; revokes all sessions. */
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import { performResetRequest } from '@contracts/schemas/identity/auth.schema'
import { ok, err, type Result } from '@shared/result'
import { type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'auth.recovery.reset',
  schema: performResetRequest,
  rateLimit: { limit: 5, windowSeconds: 3600 },
  async handler({ body }): Promise<Result<{ ok: true }, DomainError>> {
    const c = getContainer()
    const result = await c.identity.auth.performReset(body.token, body.password)
    if (!result.ok) return err(result.error)
    await c.identity.sessions.revokeAll(result.value.userId, null) // force re-login everywhere (AC-6.2)
    return ok({ ok: true })
  },
})
