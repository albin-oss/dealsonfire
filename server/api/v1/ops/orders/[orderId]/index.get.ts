/**
 * GET /api/v1/ops/orders/:orderId (C9) — the reconstruction runbook, executable:
 * the whole story (order, lines, timeline), the money (intent, facts, ledger),
 * the stock (reservations), the cases, the returns — one response, no SQL.
 */
import { getRouterParam } from 'h3'
import { defineQueryEndpoint } from '../../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../../utils/container'
import { sendProblem } from '../../../../../utils/problem'
import { isOperator } from '../../../../../utils/ops'
import { isUuid } from '@platform/uuid'
import { domainError } from '@shared/errors'

export default defineQueryEndpoint({
  async handler({ event, auth }) {
    if (!isOperator(auth.userId)) return sendProblem(event, domainError('NOT_FOUND', 'not found'))
    const orderId = getRouterParam(event, 'orderId') ?? ''
    if (!isUuid(orderId)) return sendProblem(event, domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx) => {
      const [order, lines, timeline, intent, facts, ledger, reservations, cases, returns, events] = await Promise.all([
        c.pool.query(`SELECT * FROM orders WHERE id = $1`, [orderId]),
        c.pool.query(`SELECT * FROM order_lines WHERE order_id = $1 ORDER BY line_no`, [orderId]),
        c.pool.query(`SELECT entry_type, message, actor, occurred_at FROM order_timeline WHERE order_id = $1 ORDER BY occurred_at`, [orderId]),
        c.pool.query(`SELECT id, state, amount_minor, captured_minor, refunded_minor, provider, provider_ref FROM payment_intents WHERE order_id = $1`, [orderId]),
        c.pool.query(`SELECT f.kind, f.amount_minor, f.detail, f.occurred_at FROM payment_facts f JOIN payment_intents i ON i.id = f.intent_id WHERE i.order_id = $1 ORDER BY f.occurred_at`, [orderId]),
        c.pool.query(`SELECT a.kind, a.business_id, e.delta_minor, e.cause, e.created_at FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id WHERE e.cause->>'order_id' = $1 ORDER BY e.created_at`, [orderId]),
        c.pool.query(`SELECT r.id, r.status, r.quantity, r.expires_at FROM reservations r WHERE r.id IN (SELECT reservation_id FROM order_lines WHERE order_id = $1 AND reservation_id IS NOT NULL)`, [orderId]),
        c.operations.fulfillment.listByOrder(tx, orderId),
        c.operations.returns.listByOrder(tx, orderId),
        c.pool.query(`SELECT event_type, payload, occurred_at, correlation_id FROM orders_domain_events WHERE aggregate_id = $1 ORDER BY occurred_at`, [orderId]),
      ])
      if (!order.rows[0]) return sendProblem(event, domainError('NOT_FOUND', 'not found'))
      const { buyer_contact, delivery, ...rest } = order.rows[0]
      return {
        order: { ...rest, buyer_contact, delivery },
        lines: lines.rows, timeline: timeline.rows,
        payment: { intent: intent.rows[0] ?? null, facts: facts.rows, ledger: ledger.rows },
        reservations: reservations.rows, fulfillment_cases: cases, return_cases: returns,
        events: events.rows,
      }
    })
  },
})
