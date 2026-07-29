/**
 * GET /api/v1/orders?business_id= (Commerce Foundation C5) — the merchant's
 * promises in progress. Triple-gate resolution via merchant access; cross-tenant
 * probes answer the masked NOT_FOUND (kernel law).
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
    if (!parsed.success) {
      return sendProblem(event, domainError('VALIDATION_FAILED', 'invalid query parameters'))
    }
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx) => {
      const access = await c.commerce.deps.merchantAccess.resolveAccess(tx, auth.userId, parsed.data.business_id)
      if (!access.ok) return sendProblem(event, domainError('NOT_FOUND', 'not found'))
      const items = await c.orders.checkout.listBusinessOrders(tx, parsed.data.business_id)
      return { items }
    })
  },
})
