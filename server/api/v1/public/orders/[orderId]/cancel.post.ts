/**
 * POST /api/v1/public/orders/:orderId/cancel (C8) — the buyer's one tap.
 * Nothing packed → the tap IS the decision (instant refund, everything back);
 * parcel in motion → the request goes to the bench. Buyer-gated (masked).
 */
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { definePublicEndpoint } from '../../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../../utils/container'
import { getVisitorId } from '../../../../../utils/visitor'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'orders.cancel',
  schema: z.object({}),
  rateLimit: { limit: 10, windowSeconds: 60 },
  async handler({ event }): Promise<Result<{ outcome: string; detail?: string }, DomainError>> {
    const orderId = getRouterParam(event, 'orderId') ?? ''
    const buyerId = getVisitorId(event)
    if (!buyerId || !isUuid(orderId)) return err(domainError('NOT_FOUND', 'this order does not exist'))
    const c = getContainer()
    const result = await c.deps.uow.withTransaction((tx) => c.orders.cancel.requestCancel(tx, { orderId, buyerId }))
    if (!result) return err(domainError('NOT_FOUND', 'this order does not exist'))
    if (!result.ok) return err(domainError('CONFLICT', `${result.detail} Nothing changed — try again shortly.`))
    return ok({ outcome: result.outcome, ...('detail' in result ? { detail: result.detail } : {}) })
  },
})
