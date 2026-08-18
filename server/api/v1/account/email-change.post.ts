/**
 * POST /api/v1/account/email-change (C12-3) — ask to move the account to a new
 * address. Step-up required (the gate lives in the service — one law, no
 * controller interpretation); the answer is UNIFORM regardless of whether the
 * new address is claimable (enumeration-proof: the truth goes to the address).
 */
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import type { Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'account.email-change.request',
  schema: z.object({ new_email: z.string().min(3).max(254) }).strict(),
  rateLimit: { limit: 5, windowSeconds: 3600 },
  successStatus: 200,
  async handler({ auth, body }): Promise<Result<{ requested: true }, DomainError>> {
    return getContainer().identity.emailChange.requestChange({
      userId: auth.userId, sessionId: null, newEmail: body.new_email, stepUpVerified: auth.stepUpVerified,
    })
  },
})
