/** POST /api/v1/auth/recovery/request (WP-R1-B1 US-6). Uniform answer (enumeration-proof). */
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import { requestResetRequest } from '@contracts/schemas/identity/auth.schema'
import { ok, type Result } from '@shared/result'
import { type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'auth.recovery.request',
  schema: requestResetRequest,
  rateLimit: { limit: 3, windowSeconds: 3600 },
  async handler({ body }): Promise<Result<{ sent: true }, DomainError>> {
    await getContainer().identity.auth.requestReset(body.email)
    return ok({ sent: true }) // always — never leaks account existence
  },
})
