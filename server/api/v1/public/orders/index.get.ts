/**
 * GET /api/v1/public/orders (C3) — the buyer's order history, visitor-scoped.
 * Reads never mint identity; no cookie = honestly empty. Private, never cacheable.
 */
import { z } from 'zod'
import { setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import { getVisitorId } from '../../../../utils/visitor'
import type { BuyerOrdersResponse } from '@contracts/schemas/orders/checkout.schema'
import { ok, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'orders.list',
  schema: z.object({}),
  rateLimit: { limit: 60, windowSeconds: 60 },
  async handler({ event }): Promise<Result<BuyerOrdersResponse, DomainError>> {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    const buyerId = getVisitorId(event)
    if (!buyerId) return ok({ items: [] })
    const c = getContainer()
    const items = await c.deps.uow.withTransaction((tx) => c.orders.checkout.listBuyerOrders(tx, buyerId))
    return ok({ items })
  },
})
