/**
 * POST /api/v1/orders/:orderId/dispatch (C6) — the parcel leaves the bench.
 * Optional line subset SPLITS the case (split shipments over multiple dates);
 * manual carrier + tracking ride along; pickup cases mark ready instead.
 */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

type Out = { case_id: string; remainder_case_id: string | null; ready_for_pickup: boolean }

export default defineCommandEndpoint({
  command: 'orders.fulfillment.dispatch',
  schema: z.object({
    carrier: z.string().max(60).nullable().optional(),
    tracking_ref: z.string().max(120).nullable().optional(),
    line_nos: z.array(z.number().int().positive()).max(50).optional(),
  }).strict(),
  successStatus: 200,
  async handler({ event, auth, body }): Promise<Result<Out, DomainError>> {
    const orderId = getRouterParam(event, 'orderId') ?? ''
    if (!isUuid(orderId)) return err(domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx): Promise<Result<Out, DomainError>> => {
      const { rows } = await c.pool.query<{ business_id: string }>(`SELECT business_id FROM orders WHERE id = $1`, [orderId])
      if (!rows[0]) return err(domainError('NOT_FOUND', 'not found'))
      const access = await c.commerce.deps.merchantAccess.resolveAccess(tx, auth.userId, rows[0].business_id)
      if (!access.ok) return err(domainError('NOT_FOUND', 'not found'))

      const cases = await c.operations.fulfillment.listByOrder(tx, orderId)
      const target = cases.find((k) => (k.state === 'open' || k.state === 'packed') && k.method !== 'digital')
      if (!target) return err(domainError('CONFLICT', 'nothing here is waiting to go out'))

      if (target.method === 'pickup') {
        await c.operations.fulfillment.markReady(tx, target.id)
        await c.orders.confirm.recordDispatch(tx, orderId, {
          lineNos: target.lines.map((l) => l.line_no), carrier: null, trackingRef: null, method: 'pickup',
        })
        return ok({ case_id: target.id, remainder_case_id: null, ready_for_pickup: true })
      }

      const result = await c.operations.fulfillment.dispatch(tx, {
        caseId: target.id,
        carrier: body.carrier ?? null,
        trackingRef: body.tracking_ref ?? null,
        lineNos: body.line_nos,
      })
      if (!result.ok) return err(domainError('CONFLICT', `this parcel is already ${result.state}`))
      await c.orders.confirm.recordDispatch(tx, orderId, {
        lineNos: result.dispatchedLines,
        carrier: body.carrier ?? null,
        trackingRef: body.tracking_ref ?? null,
        method: 'ship',
      })
      return ok({ case_id: result.dispatchedCaseId, remainder_case_id: result.remainderCaseId, ready_for_pickup: false })
    })
  },
})
