/**
 * GET /api/v1/public/orders/:orderId (C3) — one order, buyer-gated by the visitor
 * identity (the buyer gate class, A7-7): another buyer's order answers the
 * indistinguishable 404. Private, never cacheable.
 */
import { z } from 'zod'
import { getRouterParam, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import { getVisitorId } from '../../../../utils/visitor'
import { isUuid } from '@platform/uuid'
import type { BuyerOrderResponse } from '@contracts/schemas/orders/checkout.schema'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'orders.get',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<BuyerOrderResponse, DomainError>> {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    const orderId = getRouterParam(event, 'orderId') ?? ''
    const buyerId = getVisitorId(event)
    if (!buyerId || !isUuid(orderId)) return err(domainError('NOT_FOUND', 'this order does not exist'))
    const c = getContainer()
    const result = await c.deps.uow.withTransaction((tx) => c.orders.checkout.getBuyerOrder(tx, buyerId, orderId))
    if (!result) return err(domainError('NOT_FOUND', 'this order does not exist'))
    return ok(result as BuyerOrderResponse)
  },
})
