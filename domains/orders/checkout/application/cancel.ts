/**
 * Cancellations (Commerce Foundation C8 — ADR-007 §5, ORR scenario table).
 * The DECISION OWNER depends on how far the promise travelled:
 *
 *   nothing packed yet   → the buyer's one tap IS the decision (auto-approved):
 *                          lines close, stock restocks, the ONE refund primitive
 *                          returns every cent including shipping — instantly
 *   packed or dispatched → the request goes to the bench; the merchant decides
 *                          with the consequence visible; approval refunds the
 *                          undispatched part (dispatched lines stay honest)
 *
 * Everything is row-locked on the order (buyer and merchant acting concurrently
 * converge — hostile scenario 11), idempotent by state ratchets (a browser
 * refresh double-submits harmlessly — scenario 6), and atomic with the refund
 * (a provider refund failure rolls the whole decision back for retry, never a
 * decision without its money — scenario 8).
 */
import type { Tx, EventStore } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'
import { uuidv7 } from '../../../../platform/uuid'

export interface CancelPorts {
  listCases(tx: Tx, orderId: string): Promise<Array<{ state: string; lines: Array<{ line_no: number }> }>>
  /** §7 phase 1: journals the refund (bounded, cause-keyed); the boundary drives it after this tx. */
  prepareRefund(tx: Tx, input: { orderId: string; amountMinor: number; causeKey: string; cause: Record<string, unknown> }):
    Promise<{ ok: true; opId: string | null; alreadyDone: boolean } | { ok: false; detail: string }>
  restock(tx: Tx, reservationId: string, actor: { type: string; id: string }): Promise<{ restocked: boolean }>
}

export type CancelOutcome =
  | { ok: true; outcome: 'cancelled'; refundedMinor: number; refundOpId: string | null }
  | { ok: true; outcome: 'requested' }
  | { ok: true; outcome: 'already_requested' }
  | { ok: true; outcome: 'not_cancellable'; detail: string }
  | { ok: false; detail: string }

const ACTOR = { type: 'system', id: 'order-cancel' }

export class PgCancellationService {
  constructor(private readonly events: EventStore, private readonly ports: CancelPorts) {}

  /** The buyer's ask — one tap; the machinery decides who decides. */
  async requestCancel(tx: Tx, input: { orderId: string; buyerId: string }): Promise<CancelOutcome | null> {
    const client = asClient(tx)
    const { rows } = await client.query<{
      id: string; state: string; business_id: string; store_id: string; order_number: string
      cancel_requested_at: string | null; total_minor: string; shipping_minor: string; currency: string
    }>(
      `SELECT id, state, business_id, store_id, order_number, cancel_requested_at::text AS cancel_requested_at,
              total_minor::text, shipping_minor::text, currency
       FROM orders WHERE id = $1 AND buyer_id = $2 FOR UPDATE`, [input.orderId, input.buyerId])
    const order = rows[0]
    if (!order) return null // masked — the buyer gate
    if (['cancelled', 'payment_failed'].includes(order.state)) {
      return { ok: true, outcome: 'not_cancellable', detail: 'This order is already closed.' }
    }
    if (['fulfilled', 'completed'].includes(order.state)) {
      return { ok: true, outcome: 'not_cancellable', detail: 'It’s already on its way — once it arrives, a return is the path.' }
    }
    if (order.cancel_requested_at) return { ok: true, outcome: 'already_requested' }

    const cases = await this.ports.listCases(tx, input.orderId)
    const untouched = cases.every((c) => c.state === 'open')
    if (untouched && ['confirmed', 'in_fulfillment'].includes(order.state)) {
      // nothing packed: the tap IS the decision
      return this.executeCancel(tx, order, 'buyer_cancel')
    }

    // the bench decides
    await client.query(`UPDATE orders SET cancel_requested_at = now(), cancel_reason = 'buyer_request' WHERE id = $1`, [input.orderId])
    await this.timeline(client, input.orderId, 'note', {
      text: 'You asked to cancel. The maker has your parcel in motion, so they decide — you’ll see the answer right here.',
    })
    await this.events.append(tx, [this.orderEvent(order, 'orders.order.cancel_requested', {})])
    return { ok: true, outcome: 'requested' }
  }

  /** The bench's answer (merchant-gated at the endpoint). */
  async decideCancel(tx: Tx, input: { orderId: string; approve: boolean }): Promise<CancelOutcome | null> {
    const client = asClient(tx)
    const { rows } = await client.query<{
      id: string; state: string; business_id: string; store_id: string; order_number: string
      cancel_requested_at: string | null; total_minor: string; shipping_minor: string; currency: string
    }>(
      `SELECT id, state, business_id, store_id, order_number, cancel_requested_at::text AS cancel_requested_at,
              total_minor::text, shipping_minor::text, currency
       FROM orders WHERE id = $1 FOR UPDATE`, [input.orderId])
    const order = rows[0]
    if (!order) return null
    if (!order.cancel_requested_at) return { ok: true, outcome: 'not_cancellable', detail: 'no open cancellation request' }

    if (!input.approve) {
      await client.query(`UPDATE orders SET cancel_requested_at = NULL, cancel_reason = NULL WHERE id = $1`, [input.orderId])
      await this.timeline(client, input.orderId, 'note', {
        text: 'The maker is keeping this one on its way — it was already in motion. If it’s not right when it arrives, a return is always open.',
      })
      return { ok: true, outcome: 'not_cancellable', detail: 'declined — it stays on its way' }
    }
    return this.executeCancel(tx, order, 'merchant_approved')
  }

  /**
   * The shared execution: close undispatched lines, restock their claims, refund
   * their money (+ shipping when nothing shipped) — atomic with the decision.
   */
  private async executeCancel(tx: Tx, order: {
    id: string; state: string; business_id: string; store_id: string; order_number: string
    shipping_minor: string; currency: string
  }, reason: 'buyer_cancel' | 'merchant_approved'): Promise<CancelOutcome> {
    const client = asClient(tx)
    const cases = await this.ports.listCases(tx, order.id)
    const dispatchedLines = new Set(
      cases.filter((c) => ['dispatched', 'collected', 'granted'].includes(c.state)).flatMap((c) => c.lines.map((l) => l.line_no)))
    const { rows: lines } = await client.query<{ line_no: number; unit_price_minor: string; quantity: number; line_state: string; reservation_id: string | null }>(
      `SELECT line_no, unit_price_minor::text, quantity, line_state, reservation_id
       FROM order_lines WHERE order_id = $1 FOR UPDATE`, [order.id])
    const cancellable = lines.filter((l) => !['cancelled', 'returned', 'fulfilled'].includes(l.line_state) && !dispatchedLines.has(l.line_no))
    if (cancellable.length === 0) {
      await client.query(`UPDATE orders SET cancel_requested_at = NULL WHERE id = $1`, [order.id])
      return { ok: true, outcome: 'not_cancellable', detail: 'everything already shipped' }
    }

    let refundMinor = cancellable.reduce((sum, l) => sum + Number(l.unit_price_minor) * l.quantity, 0)
    if (dispatchedLines.size === 0) refundMinor += Number(order.shipping_minor)

    // §7: the refund is journaled WITH the decision (same tx — a bounds violation
    // still rolls the whole decision back); the provider executes after commit,
    // driver-guaranteed, so the decision never stalls on a provider hiccup.
    const refunded = await this.ports.prepareRefund(tx, {
      orderId: order.id, amountMinor: refundMinor,
      causeKey: `cancel:${reason}:${order.id}`,
      cause: { kind: reason, order_number: order.order_number },
    })
    if (!refunded.ok) return { ok: false, detail: refunded.detail } // ROLLBACK — an unpreparable refund voids the decision

    for (const l of cancellable) {
      await client.query(`UPDATE order_lines SET line_state = 'cancelled' WHERE order_id = $1 AND line_no = $2`, [order.id, l.line_no])
      if (l.reservation_id) await this.ports.restock(tx, l.reservation_id, ACTOR)
    }
    const anythingShipped = dispatchedLines.size > 0
    await client.query(
      `UPDATE orders SET state = $2, total_minor = total_minor - $3, cancel_requested_at = NULL, cancel_reason = $4 WHERE id = $1`,
      [order.id, anythingShipped ? order.state : 'cancelled', refundMinor, reason])
    await this.timeline(client, order.id, 'refund', {
      amount_minor: refundMinor, currency: order.currency,
      text: anythingShipped
        ? 'The unshipped part is cancelled and refunded — what already shipped is unaffected.'
        : reason === 'buyer_cancel'
          ? 'Cancelled at your request — your money is on its way back. Nothing more will be charged.'
          : 'The maker approved your cancellation — your money is on its way back.',
    })
    await this.events.append(tx, [this.orderEvent(order, 'orders.order.cancelled', { reason, refunded_minor: refundMinor })])
    return { ok: true, outcome: 'cancelled', refundedMinor: refundMinor, refundOpId: refunded.opId }
  }

  private async timeline(client: ReturnType<typeof asClient>, orderId: string, entryType: string, message: Record<string, unknown>): Promise<void> {
    await client.query(
      `INSERT INTO order_timeline (id, order_id, entry_type, message, actor) VALUES ($1, $2, $3, $4, $5)`,
      [uuidv7(), orderId, entryType, JSON.stringify(message), JSON.stringify(ACTOR)])
  }

  private orderEvent(order: { id: string; business_id: string; store_id: string }, eventType: string, payload: Record<string, unknown>) {
    return {
      businessId: order.business_id,
      aggregate: { type: 'order', id: order.id },
      eventType,
      schemaVersion: 1,
      payload: { order_id: order.id, business_id: order.business_id, store_id: order.store_id, ...payload },
      actor: { type: 'system' as const, id: 'order-cancel' },
    }
  }
}
