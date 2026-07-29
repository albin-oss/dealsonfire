/**
 * POST /api/v1/public/checkout (Commerce Foundation C3) — the resumable saga in one
 * request: quote-freeze → reserve → authorize → place, idempotent end-to-end on the
 * client-minted attempt key. Guest-first: the visitor identity IS the buyer.
 *
 * GA gate (ADR-007 R-a): checkout runs on the sandbox PaymentPort until C4 — in
 * production it stays OFF unless explicitly enabled, so no real store can appear
 * to take money it cannot take.
 */
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import { getServerConfig } from '../../../../utils/config'
import { getOrCreateVisitorId } from '../../../../utils/visitor'
import { checkoutRequest, type CheckoutResponse } from '@contracts/schemas/orders/checkout.schema'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'orders.checkout',
  schema: checkoutRequest,
  rateLimit: { limit: 20, windowSeconds: 60 },
  async handler({ event, body }): Promise<Result<CheckoutResponse, DomainError>> {
    const config = getServerConfig()
    if (config.isProduction && process.env.NUXT_COMMERCE_CHECKOUT !== '1') {
      return err(domainError('NOT_FOUND', 'checkout is not open yet'))
    }
    const buyerId = getOrCreateVisitorId(event)
    const c = getContainer()
    const result = await c.deps.uow.withTransaction((tx) =>
      c.orders.checkout.checkout(tx, {
        attemptKey: body.attempt_key,
        buyerId,
        cartId: body.cart_id,
        contact: body.contact,
        // pickup's DeliverySnapshot is the honest marker, not a fake address
        delivery: body.delivery ?? { line1: 'Pickup at the shop', city: '', postal_code: '', country: '' },
        method: body.method,
      }))
    if (result.ok) {
      // C5: confirmation runs immediately in its OWN transaction — the order exists
      // either way, and the cron sweep retries any straggler (placed is never a rest).
      await c.deps.uow.withTransaction((tx) => c.orders.confirm.confirmOrder(tx, result.orderId)).catch((error) => {
        // PRR-H2: never silent — the sweep retries, but a crashing confirm is a bug someone must see
        c.logger.error(`inline confirm failed for order ${result.orderId}: ${(error as Error).message}`, { component: 'orders-confirm' })
      })
      return ok({ ok: true, order_id: result.orderId, order_number: result.orderNumber })
    }
    return ok({ ok: false, code: result.code, detail: result.detail })
  },
})
