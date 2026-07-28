/**
 * GET /api/v1/public/cart (Commerce Foundation C1) — the buyer's carts, grouped by
 * store, re-quoted on this read (C2: the cart never asserts price truth). Reads never
 * mint identity: no visitor cookie means an honestly empty answer. Per-visitor —
 * never cacheable.
 */
import { z } from 'zod'
import { setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import { getVisitorId } from '../../../../utils/visitor'
import type { CartsResponse } from '@contracts/schemas/orders/cart.schema'
import { ok, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'orders.cart.list',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<CartsResponse, DomainError>> {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    const visitorId = getVisitorId(event)
    if (!visitorId) return ok({ carts: [] })
    const c = getContainer()
    const carts = await c.deps.uow.withTransaction((tx) => c.orders.carts.listForBuyer(tx, visitorId))
    return ok({ carts })
  },
})
