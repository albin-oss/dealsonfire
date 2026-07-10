/** POST /api/v1/auth/verify-email (WP-R1-B1 US-6). */
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import { verifyEmailRequest } from '@contracts/schemas/identity/auth.schema'
import { ok, err, type Result } from '@shared/result'
import { type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'auth.verify_email',
  schema: verifyEmailRequest,
  rateLimit: { limit: 10, windowSeconds: 3600 },
  async handler({ body }): Promise<Result<{ ok: true }, DomainError>> {
    const result = await getContainer().identity.auth.verifyEmail(body.token)
    return result.ok ? ok({ ok: true }) : err(result.error)
  },
})
