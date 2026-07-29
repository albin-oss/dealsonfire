/**
 * POST /api/v1/orders/:orderId/cancel-decision (C8) — the bench's answer to a
 * cancellation request. Approve → the undispatched part refunds atomically
 * (a provider failure rolls the whole decision back — no decision ever
 * outruns its money). Decline → it stays on its way, said honestly.
 */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'orders.cancel.decide',
  schema: z.object({ approve: z.boolean() }).strict(),
  successStatus: 200,
  async handler({ event, auth, body }): Promise<Result<{ outcome: string; refunded_minor?: number }, DomainError>> {
    const orderId = getRouterParam(event, 'orderId') ?? ''
    if (!isUuid(orderId)) return err(domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx): Promise<Result<{ outcome: string; refunded_minor?: number }, DomainError>> => {
      const { rows } = await c.pool.query<{ business_id: string }>(`SELECT business_id FROM orders WHERE id = $1`, [orderId])
      if (!rows[0]) return err(domainError('NOT_FOUND', 'not found'))
      const access = await c.commerce.deps.merchantAccess.resolveAccess(tx, auth.userId, rows[0].business_id)
      if (!access.ok) return err(domainError('NOT_FOUND', 'not found'))
      const result = await c.orders.cancel.decideCancel(tx, { orderId, approve: body.approve })
      if (!result) return err(domainError('NOT_FOUND', 'not found'))
      if (!result.ok) {
        c.logger.error(`cancel refund failed for order ${orderId}: ${result.detail}`, { component: 'orders-cancel' })
        return err(domainError('CONFLICT', `The refund did not go through — nothing changed. Try again; if it keeps failing, support is on it.`))
      }
      return ok({ outcome: result.outcome, ...(result.outcome === 'cancelled' ? { refunded_minor: result.refundedMinor } : {}) })
    })
  },
})
