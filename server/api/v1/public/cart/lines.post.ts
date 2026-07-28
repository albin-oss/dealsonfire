/**
 * POST /api/v1/public/cart/lines (Commerce Foundation C1) — set one line to an
 * absolute quantity (0 removes). Idempotent by (buyer, variant). The first add mints
 * the visitor identity (the engagement idiom); a variant outside the visibility
 * conjunction answers the indistinguishable 404 (V6).
 */
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import { getOrCreateVisitorId } from '../../../../utils/visitor'
import { setCartLineRequest, type SetCartLineResponse } from '@contracts/schemas/orders/cart.schema'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'orders.cart.set-line',
  schema: setCartLineRequest,
  rateLimit: { limit: 60, windowSeconds: 60 },
  async handler({ event, body }): Promise<Result<SetCartLineResponse, DomainError>> {
    const visitorId = getOrCreateVisitorId(event)
    const c = getContainer()
    const result = await c.deps.uow.withTransaction((tx) =>
      c.orders.carts.setLine(tx, visitorId, body.variant_id, body.quantity))
    if (!result) return err(domainError('NOT_FOUND', 'this product does not exist'))
    return ok({ cart_id: result.cartId, lines: result.lines })
  },
})
