/**
 * POST /api/v1/public/orders/:orderId/return (C9) — the buyer starts a return:
 * eligible lines only (fulfilled, inside the 30-day window from the order's
 * fulfillment), one open case at a time. Buyer-gated (masked). A tracking_ref
 * in the body updates an AUTHORIZED case instead (manual return tracking).
 */
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { definePublicEndpoint } from '../../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../../utils/container'
import { getVisitorId } from '../../../../../utils/visitor'
import { isUuid, uuidv7 } from '@platform/uuid'
import { RETURN_WINDOW_DAYS } from '@domains/operations/returns/application/returns'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'orders.return',
  schema: z.object({
    line_nos: z.array(z.number().int().positive()).max(50).optional(),
    reason_code: z.enum(['not_as_described', 'damaged', 'wrong_item', 'changed_mind', 'other']).optional(),
    comment: z.string().max(500).nullable().optional(),
    tracking_ref: z.string().max(120).optional(),
  }),
  rateLimit: { limit: 10, windowSeconds: 60 },
  async handler({ event, body }): Promise<Result<{ outcome: string; detail?: string }, DomainError>> {
    const orderId = getRouterParam(event, 'orderId') ?? ''
    const buyerId = getVisitorId(event)
    if (!buyerId || !isUuid(orderId)) return err(domainError('NOT_FOUND', 'this order does not exist'))
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx): Promise<Result<{ outcome: string; detail?: string }, DomainError>> => {
      const { rows } = await c.pool.query<{ business_id: string; store_id: string; state: string; placed_at: string }>(
        `SELECT business_id, store_id, state, placed_at::text AS placed_at FROM orders WHERE id = $1 AND buyer_id = $2`, [orderId, buyerId])
      const order = rows[0]
      if (!order) return err(domainError('NOT_FOUND', 'this order does not exist'))

      // manual return tracking on an authorized case
      if (body.tracking_ref) {
        const cases = await c.operations.returns.listByOrder(tx, orderId)
        const authorized = cases.find((k) => k.state === 'authorized')
        if (!authorized) return err(domainError('CONFLICT', 'no authorized return is waiting for tracking'))
        await c.operations.returns.recordTracking(tx, authorized.id, body.tracking_ref)
        await c.pool.query(
          `INSERT INTO order_timeline (id, order_id, entry_type, message, actor) VALUES ($1, $2, 'note', $3, $4)`,
          [uuidv7(), orderId, JSON.stringify({ text: `Your return is on its way back — tracking ${body.tracking_ref}.` }), JSON.stringify({ type: 'guest', id: buyerId })])
        return ok({ outcome: 'tracking_recorded' })
      }

      if (!['fulfilled', 'partially_fulfilled', 'completed'].includes(order.state)) {
        return err(domainError('CONFLICT', 'Returns open once things have arrived — until then, cancelling is the path.'))
      }
      const { rows: lines } = await c.pool.query<{ line_no: number; quantity: number; line_state: string }>(
        `SELECT line_no, quantity, line_state FROM order_lines WHERE order_id = $1`, [orderId])
      const requested = (body.line_nos?.length ? lines.filter((l) => body.line_nos!.includes(l.line_no)) : lines)
        .filter((l) => l.line_state === 'fulfilled')
      if (requested.length === 0) return err(domainError('CONFLICT', 'None of those things are returnable — only delivered items can come back.'))

      // the window: from the order's fulfillment evidence (dispatch/handover)
      const { rows: windowRow } = await c.pool.query<{ latest: string | null }>(
        `SELECT max(COALESCE(handed_over_at, dispatched_at))::text AS latest FROM fulfillment_cases WHERE order_id = $1`, [orderId])
      const latest = windowRow[0]?.latest ? new Date(windowRow[0].latest) : null
      if (latest && Date.now() - latest.getTime() > RETURN_WINDOW_DAYS * 86_400_000) {
        return err(domainError('CONFLICT', `The ${RETURN_WINDOW_DAYS}-day return window has closed for this order.`))
      }

      const result = await c.operations.returns.request(tx, {
        businessId: order.business_id, orderId, storeId: order.store_id,
        lines: requested.map((l) => ({ line_no: l.line_no, quantity: l.quantity })),
        reasonCode: body.reason_code ?? 'other', buyerComment: body.comment ?? null,
      })
      if (!result.ok) return err(domainError('CONFLICT', result.detail))
      await c.pool.query(
        `INSERT INTO order_timeline (id, order_id, entry_type, message, actor) VALUES ($1, $2, 'note', $3, $4)`,
        [uuidv7(), orderId, JSON.stringify({ text: 'You asked to send something back — the maker takes a look and answers here.' }), JSON.stringify({ type: 'guest', id: buyerId })])
      return ok({ outcome: 'requested' })
    })
  },
})
