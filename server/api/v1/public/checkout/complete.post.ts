/**
 * POST /api/v1/public/checkout/complete (C10 Slice 2) — the buyer's browser came
 * back from the Payment Element. We ask the PROVIDER for the truth (never trust
 * the client's claim), record it, and run confirmation. Idempotent with the
 * webhook in either order; safe under refresh and duplicate submits. Works with
 * webhooks entirely absent (local dev) — this IS the convergence fallback.
 */
import { z } from 'zod'
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import { getVisitorId } from '../../../../utils/visitor'
import { completePaymentAuthorization } from '../../../../utils/payment-completion'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'checkout.complete',
  schema: z.object({ attempt_key: z.string().uuid() }),
  rateLimit: { limit: 30, windowSeconds: 60 },
  async handler({ event, body }): Promise<Result<{ status: string; order_id?: string }, DomainError>> {
    const buyerId = getVisitorId(event)
    if (!buyerId) return err(domainError('NOT_FOUND', 'this checkout does not exist'))
    const c = getContainer()
    // the buyer gate: the attempt must belong to THIS buyer's order (masked otherwise)
    const { rows } = await c.pool.query<{ id: string; state: string; provider_ref: string | null; intent_state: string | null }>(
      `SELECT o.id, o.state, i.provider_ref, i.state AS intent_state
       FROM orders o LEFT JOIN payment_intents i ON i.attempt_key = o.attempt_key
       WHERE o.attempt_key = $1 AND o.buyer_id = $2`, [body.attempt_key, buyerId])
    const order = rows[0]
    if (!order) return err(domainError('NOT_FOUND', 'this checkout does not exist'))
    if (!order.provider_ref) return ok({ status: 'pending', order_id: order.id })
    if (order.intent_state && order.intent_state !== 'requires_action') {
      // already converged (webhook won the race, or a refresh re-asked)
      return ok({ status: order.state === 'payment_failed' ? 'failed' : 'settled', order_id: order.id })
    }

    // the provider's answer, read OUTSIDE any transaction (§7)
    const truth = await c.payments.boundary.readIntent(order.provider_ref)
    if (truth.status === 'authorized' || truth.status === 'captured') {
      await completePaymentAuthorization(c, order.provider_ref)
      return ok({ status: 'settled', order_id: order.id })
    }
    if (truth.status === 'canceled' || truth.status === 'failed') {
      return ok({ status: 'failed', order_id: order.id })
    }
    // still confirming (3DS in flight, processing, or the buyer never finished)
    return ok({ status: 'pending', order_id: order.id })
  },
})
