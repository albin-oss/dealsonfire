/**
 * POST /api/v1/orders/:orderId/collected (C6) — the pickup handover: the buyer
 * has it in their hands. Hold release follows via the one policy (pickup
 * releases on recorded handover).
 */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'orders.fulfillment.collected',
  schema: z.object({}).strict(),
  successStatus: 200,
  async handler({ event, auth }): Promise<Result<{ case_id: string }, DomainError>> {
    const orderId = getRouterParam(event, 'orderId') ?? ''
    if (!isUuid(orderId)) return err(domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx): Promise<Result<{ case_id: string }, DomainError>> => {
      const { rows } = await c.pool.query<{ business_id: string }>(`SELECT business_id FROM orders WHERE id = $1`, [orderId])
      if (!rows[0]) return err(domainError('NOT_FOUND', 'not found'))
      const access = await c.commerce.deps.merchantAccess.resolveAccess(tx, auth.userId, rows[0].business_id)
      if (!access.ok) return err(domainError('NOT_FOUND', 'not found'))

      const cases = await c.operations.fulfillment.listByOrder(tx, orderId)
      const target = cases.find((k) => k.method === 'pickup' && (k.state === 'ready' || k.state === 'collected'))
      if (!target) return err(domainError('CONFLICT', 'no pickup is waiting here'))
      await c.operations.fulfillment.markCollected(tx, target.id)
      await c.orders.confirm.recordHandover(tx, orderId)
      return ok({ case_id: target.id })
    })
  },
})
