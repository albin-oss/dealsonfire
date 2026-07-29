/**
 * POST /api/v1/orders/:orderId/pack (C6) — the bench moment: the case packs,
 * the optional parcel photo rides along (never demanded), the buyer's timeline
 * gains its chapter. One transaction: Operations case + Orders reaction.
 */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'orders.fulfillment.pack',
  schema: z.object({ parcel_media_id: z.string().uuid().nullable().optional() }).strict(),
  successStatus: 200,
  async handler({ event, auth, body }): Promise<Result<{ case_id: string }, DomainError>> {
    const orderId = getRouterParam(event, 'orderId') ?? ''
    if (!isUuid(orderId)) return err(domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx): Promise<Result<{ case_id: string }, DomainError>> => {
      const { rows } = await c.pool.query<{ business_id: string }>(`SELECT business_id FROM orders WHERE id = $1`, [orderId])
      if (!rows[0]) return err(domainError('NOT_FOUND', 'not found'))
      const access = await c.commerce.deps.merchantAccess.resolveAccess(tx, auth.userId, rows[0].business_id)
      if (!access.ok) return err(domainError('NOT_FOUND', 'not found'))

      const cases = await c.operations.fulfillment.listByOrder(tx, orderId)
      const target = cases.find((k) => k.state === 'open' || k.state === 'packed')
      if (!target) return err(domainError('CONFLICT', 'nothing here is waiting to be packed'))
      await c.operations.fulfillment.pack(tx, target.id, body.parcel_media_id ?? null)
      await c.orders.confirm.recordPacked(tx, orderId, body.parcel_media_id ?? null)
      return ok({ case_id: target.id })
    })
  },
})
