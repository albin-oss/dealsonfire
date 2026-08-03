/**
 * POST /api/v1/orders/:orderId/return-decision (C9) — the fair judge's bench,
 * ONE decision surface for the whole lifecycle:
 *
 *   action: 'authorize' (+ instructions) — yes, send it back
 *   action: 'decline'   (+ note)         — said plainly
 *   action: 'resolve'   — received + inspected + disposed + REFUNDED, one act
 *                          (also serves refund-without-return from 'requested':
 *                          generosity is one tap, RT1)
 *
 * The resolution refunds through the ONE primitive (cause-keyed → hostile
 * scenarios 5 and 10 converge: repeats and racing operators change nothing)
 * and restocks per disposition. Returns APPEND — the order never rewinds.
 */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { isUuid, uuidv7 } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

type Out = { outcome: string; refunded_minor?: number; op_id?: string | null }

export default defineCommandEndpoint({
  command: 'orders.return.decide',
  schema: z.object({
    action: z.enum(['authorize', 'decline', 'resolve']),
    instructions: z.string().max(500).nullable().optional(),
    disposition: z.enum(['restock', 'discard']).optional(),
    without_return: z.boolean().optional(),
  }).strict(),
  successStatus: 200,
  async handler({ event, auth, body }): Promise<Result<Out, DomainError>> {
    const orderId = getRouterParam(event, 'orderId') ?? ''
    if (!isUuid(orderId)) return err(domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    const decided = await c.deps.uow.withTransaction(async (tx): Promise<Result<Out, DomainError>> => {
      const { rows } = await c.pool.query<{ business_id: string; currency: string; order_number: string }>(
        `SELECT business_id, currency, order_number FROM orders WHERE id = $1`, [orderId])
      if (!rows[0]) return err(domainError('NOT_FOUND', 'not found'))
      const access = await c.commerce.deps.merchantAccess.resolveAccess(tx, auth.userId, rows[0].business_id)
      if (!access.ok) return err(domainError('NOT_FOUND', 'not found'))
      const cases = await c.operations.returns.listByOrder(tx, orderId)
      const target = cases.find((k) => k.state === 'requested' || k.state === 'authorized')
      if (!target) return err(domainError('CONFLICT', 'no open return here'))

      // the maker's own words arrive as written — we never double their full stop
      const said = (words: string | null | undefined) => {
        const t = (words ?? '').trim()
        return t ? (/[.!?…]$/.test(t) ? t : `${t}.`) : ''
      }
      const timeline = (text: string) => c.pool.query(
        `INSERT INTO order_timeline (id, order_id, entry_type, message, actor) VALUES ($1, $2, 'note', $3, $4)`,
        [uuidv7(), orderId, JSON.stringify({ text }), JSON.stringify({ type: 'user', id: auth.userId })])

      if (body.action === 'authorize') {
        const done = await c.operations.returns.authorize(tx, target.id, body.instructions ?? null)
        if (!done.ok) return err(domainError('CONFLICT', `this return is already ${done.state}`))
        await timeline(body.instructions
          ? `Return authorized — send it back: ${said(body.instructions)}`
          : 'Return authorized — send it back whenever suits you.')
        return ok({ outcome: 'authorized' })
      }
      if (body.action === 'decline') {
        const done = await c.operations.returns.decline(tx, target.id, body.instructions ?? null)
        if (!done.ok) return err(domainError('CONFLICT', `this return is already ${done.state}`))
        await timeline(`The maker looked at this return and is keeping the order as delivered.${body.instructions ? ` ${said(body.instructions)}` : ''} If that doesn’t sit right, support can take a look.`)
        return ok({ outcome: 'declined' })
      }

      // ——— resolve: the ONE decision — received, inspected, disposed, refunded
      const { rows: orderLines } = await c.pool.query<{ line_no: number; unit_price_minor: string; quantity: number; line_state: string; reservation_id: string | null }>(
        `SELECT line_no, unit_price_minor::text, quantity, line_state, reservation_id FROM order_lines WHERE order_id = $1 FOR UPDATE`, [orderId])
      const returnable = orderLines.filter((l) =>
        target.lines.some((rl) => rl.line_no === l.line_no) && l.line_state === 'fulfilled')
      const refundMinor = returnable.reduce((sum, l) => sum + Number(l.unit_price_minor) * l.quantity, 0)

      const resolved = await c.operations.returns.resolve(tx, {
        caseId: target.id,
        disposition: body.disposition ?? 'restock',
        refundMinor,
        withoutReturn: body.without_return ?? false,
      })
      if (!resolved.ok) return err(domainError('CONFLICT', `this return is already ${resolved.state}`))
      if (resolved.alreadyResolved) return ok({ outcome: 'resolved', refunded_minor: 0 }) // scenarios 5/10: quiet convergence

      let refundOpId: string | null = null
      if (refundMinor > 0) {
        // §7: journal the refund WITH the decision; the boundary executes after commit
        const refunded = await c.payments.service.prepareRefund(tx, {
          orderId, amountMinor: refundMinor,
          causeKey: `return:${target.id}`,
          cause: { kind: 'return_resolved', return_case_id: target.id, order_number: rows[0].order_number },
        })
        if (!refunded.ok) {
          c.logger.error(`return refund unpreparable for order ${orderId} case ${target.id}: ${refunded.detail}`, { component: 'orders-returns' })
          return err(domainError('CONFLICT', 'The refund could not be prepared — nothing changed. Try again; support is on it if it keeps failing.'))
        }
        refundOpId = refunded.opId
      }
      for (const l of returnable) {
        await c.pool.query(`UPDATE order_lines SET line_state = 'returned' WHERE order_id = $1 AND line_no = $2`, [orderId, l.line_no])
        if ((body.disposition ?? 'restock') === 'restock' && l.reservation_id && !(body.without_return ?? false)) {
          await c.operations.stock.restockCommitted(tx, l.reservation_id, { type: 'user', id: auth.userId })
        }
      }
      await c.pool.query(
        `INSERT INTO order_timeline (id, order_id, entry_type, message, actor) VALUES ($1, $2, 'refund', $3, $4)`,
        [uuidv7(), orderId, JSON.stringify({
          amount_minor: refundMinor, currency: rows[0].currency,
          text: (body.without_return ?? false)
            ? 'Refunded without needing the send-back — keep it or pass it on.'
            : 'Return received and checked — your refund is on its way back.',
        }), JSON.stringify({ type: 'user', id: auth.userId })])
      return ok({ outcome: 'resolved', refunded_minor: refundMinor, op_id: refundOpId })
    })
    // §7: the decision committed; the money executes at the boundary now
    if (decided.ok && decided.value.op_id) {
      await c.payments.boundary.drive(decided.value.op_id).catch((error) =>
        c.logger.error(`return refund drive failed for order ${orderId}: ${(error as Error).message}`, { component: 'payments-boundary' }))
    }
    if (decided.ok) {
      const { op_id: _omit, ...response } = decided.value
      return ok(response)
    }
    return decided
  },
})
