/**
 * GET /api/v1/returns?business_id= (SV-3) — the merchant's returns queue: every case across
 * all four states (requested / authorized / resolved / declined), newest first, a projection
 * of the return state machine. Business-membership gated; cross-tenant probes masked.
 * Minimum disclosure: no buyer name/address/email — a queue needs none (act on the order).
 */
import { getQuery } from 'h3'
import { z } from 'zod'
import { defineQueryEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { sendProblem } from '../../../utils/problem'
import { domainError } from '@shared/errors'

const querySchema = z.object({ business_id: z.string().uuid() })

export default defineQueryEndpoint({
  async handler({ event, auth }) {
    const parsed = querySchema.safeParse(getQuery(event))
    if (!parsed.success) return sendProblem(event, domainError('VALIDATION_FAILED', 'invalid query parameters'))
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx) => {
      const access = await c.commerce.deps.merchantAccess.resolveAccess(tx, auth.userId, parsed.data.business_id)
      if (!access.ok) return sendProblem(event, domainError('NOT_FOUND', 'not found'))
      const items = await c.operations.returns.listByBusiness(tx, parsed.data.business_id)
      return { items }
    })
  },
})
