/** POST /api/v1/auth/email-change/confirm (C12-3) — the NEW address proves
 *  possession. Public (the token is the credential); one-shot; uniform refusals. */
import { z } from 'zod'
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import type { Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'auth.email-change.confirm',
  rateLimit: { limit: 10, windowSeconds: 300 },
  schema: z.object({ token: z.string().min(10).max(200) }).strict(),
  successStatus: 200,
  async handler({ body }): Promise<Result<{ changed: true }, DomainError>> {
    return getContainer().identity.emailChange.confirmChange(body.token)
  },
})
