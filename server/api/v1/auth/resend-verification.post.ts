/** POST /api/v1/auth/resend-verification (CAP-R1-ID-002). Uniform answer (enumeration-proof). */
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import { resendVerificationRequest } from '@contracts/schemas/identity/auth.schema'
import { ok, type Result } from '@shared/result'
import { type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'auth.resend_verification',
  schema: resendVerificationRequest,
  rateLimit: { limit: 3, windowSeconds: 3600 },
  async handler({ body }): Promise<Result<{ sent: true }, DomainError>> {
    await getContainer().identity.auth.resendVerification(body.email)
    return ok({ sent: true }) // always — never leaks account existence or verification state
  },
})
