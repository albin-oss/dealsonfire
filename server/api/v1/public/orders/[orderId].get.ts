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
    const result = await c.deps.uow.withTransaction(async (tx) => {
      const order = await c.orders.checkout.getBuyerOrder(tx, buyerId, orderId)
      if (!order) return null
      // C9: the open (or latest) return case, so the page can say where things stand
      const cases = await c.operations.returns.listByOrder(tx, orderId)
      const rc = cases.find((k) => k.state === 'requested' || k.state === 'authorized') ?? cases.at(-1) ?? null
      return {
        ...order,
        return_case: rc && {
          state: rc.state, instructions: rc.instructions,
          tracking_ref: rc.tracking_ref, resolved_without_return: rc.resolved_without_return,
        },
      }
    })
    if (!result) return err(domainError('NOT_FOUND', 'this order does not exist'))
    // C6: the parcel photo — media ids in timeline messages become URLs here
    const parcelIds = result.timeline
      .map((t) => t.message.parcel_media_id)
      .filter((id): id is string => typeof id === 'string')
    if (parcelIds.length > 0) {
      const urls = await c.media.urlsFor(parcelIds)
      for (const entry of result.timeline) {
        const id = entry.message.parcel_media_id
        if (typeof id === 'string' && urls[id]) entry.message.parcel_url = urls[id]
      }
    }
    return ok(result as BuyerOrderResponse)
  },
})
