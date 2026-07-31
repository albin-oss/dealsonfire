/**
 * POST /api/v1/orders/:orderId/cancel-decision (C8, resequenced by C10 §7) —
 * the bench's answer. Approve → the decision and its journaled refund COMMIT
 * together (a bounds violation still voids the decision); the provider executes
 * at the boundary after commit, driver-guaranteed. Decline → it stays on its way.
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
    const decided = await c.deps.uow.withTransaction(async (tx): Promise<Result<{ outcome: string; refunded_minor?: number; op_id?: string | null }, DomainError>> => {
      const { rows } = await c.pool.query<{ business_id: string }>(`SELECT business_id FROM orders WHERE id = $1`, [orderId])
      if (!rows[0]) return err(domainError('NOT_FOUND', 'not found'))
      const access = await c.commerce.deps.merchantAccess.resolveAccess(tx, auth.userId, rows[0].business_id)
      if (!access.ok) return err(domainError('NOT_FOUND', 'not found'))
      const result = await c.orders.cancel.decideCancel(tx, { orderId, approve: body.approve })
      if (!result) return err(domainError('NOT_FOUND', 'not found'))
      if (!result.ok) {
        c.logger.error(`cancel refund unpreparable for order ${orderId}: ${result.detail}`, { component: 'orders-cancel' })
        return err(domainError('CONFLICT', `The refund could not be prepared — nothing changed. Try again; if it keeps failing, support is on it.`))
      }
      return ok({ outcome: result.outcome, ...(result.outcome === 'cancelled' ? { refunded_minor: result.refundedMinor, op_id: result.refundOpId } : {}) })
    })
    // §7: the decision committed; the money executes at the boundary now
    if (decided.ok && decided.value.op_id) {
      await c.payments.boundary.drive(decided.value.op_id).catch((error) =>
        c.logger.error(`cancel refund drive failed for order ${orderId}: ${(error as Error).message}`, { component: 'payments-boundary' }))
    }
    if (decided.ok) {
      const { op_id: _omit, ...response } = decided.value
      return ok(response)
    }
    return decided
  },
})
