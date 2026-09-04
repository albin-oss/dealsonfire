/**
 * GET /api/v1/inventory?business_id= (SV-3) — "what can I sell right now?" Every sellable
 * variant with its stock truth (tracked / on-hand / reserved / available), catalog-driven
 * so untracked variants surface too. Business-membership gated; cross-tenant probes get the
 * masked NOT_FOUND. Read-only — no PII (stock is not a customer database).
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
      const items = await c.operations.stock.listInventoryForBusiness(tx, parsed.data.business_id)
      return { items }
    })
  },
})
