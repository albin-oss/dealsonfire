/** POST /api/v1/auth/email-change/revert (C12-3) — the OLD address takes the
 *  account back inside the 72-hour window. Full lockdown on success. */
import { z } from 'zod'
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import type { Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'auth.email-change.revert',
  rateLimit: { limit: 10, windowSeconds: 300 },
  schema: z.object({ token: z.string().min(10).max(200) }).strict(),
  successStatus: 200,
  async handler({ body }): Promise<Result<{ reverted: true }, DomainError>> {
    return getContainer().identity.emailChange.revertChange(body.token)
  },
})
